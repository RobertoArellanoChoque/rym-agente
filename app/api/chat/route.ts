import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { streamText, isStepCount } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { conciliacionTools } from "@/lib/agents/tools/conciliacion"
import { ventasTools } from "@/lib/agents/tools/ventas"
import { orchestratorTools } from "@/lib/agents/tools/orchestrator"
import { actionTools } from "@/lib/agents/tools/actions"
import { logUso } from "@/lib/ai/log-uso"
import { rateLimit, ipOf } from "@/lib/rate-limit"

const ALL_TOOLS = { ...conciliacionTools, ...ventasTools, ...orchestratorTools, ...actionTools }

const BodySchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(200_000), // mensajes con contexto OCR pueden ser grandes
  })).min(1).max(30),
})

const SYSTEM = `Sos el asistente de RyM Agente, sistema contable para Argentina.

Tu rol es ACTUAR, no solo informar. Ejecutá herramientas en secuencia sin esperar confirmación intermedia. Reportá después de ejecutar, no antes.

Cuando el usuario pida múltiples cosas: llamá ver_estado_general primero, luego las herramientas específicas en secuencia. Presentá resumen unificado al final.

Respondé en español rioplatense. Sé conciso: máximo 3-4 oraciones por respuesta salvo que estés reportando un resultado de herramienta.`

function getModel() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey === "placeholder") return null
  const anthropic = createAnthropic({ apiKey })
  return anthropic("claude-sonnet-4-6")
}

export async function POST(req: NextRequest) {
  if (Number(req.headers.get("content-length") ?? 0) > 2_000_000)
    return NextResponse.json({ error: "Payload demasiado grande" }, { status: 413 })
  if (!rateLimit(`chat:${ipOf(req)}`, 10, 60_000))
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 })
  const parsed = BodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success)
    return NextResponse.json({ error: "Entrada inválida" }, { status: 400 })
  const { messages } = parsed.data
  const enc = new TextEncoder()

  const model = getModel()
  if (!model) {
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(enc.encode(`data: ${JSON.stringify({ type: "text", content: "Servicio de IA no disponible." })}\n\n`))
        c.enqueue(enc.encode("data: [DONE]\n\n"))
        c.close()
      },
    })
    return new NextResponse(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } })
  }

  const result = streamText({
    model,
    system: SYSTEM,
    messages,
    tools: ALL_TOOLS,
    stopWhen: isStepCount(20),
    maxOutputTokens: 800,
  })

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const part of result.fullStream) {
          if (part.type === "text-delta") {
            controller.enqueue(enc.encode(
              `data: ${JSON.stringify({ type: "text", content: part.text })}\n\n`
            ))
          } else if (part.type === "tool-call") {
            controller.enqueue(enc.encode(
              `data: ${JSON.stringify({ type: "tool-call", toolCallId: part.toolCallId, toolName: part.toolName, args: part.input })}\n\n`
            ))
          } else if (part.type === "tool-result") {
            controller.enqueue(enc.encode(
              `data: ${JSON.stringify({ type: "tool-result", toolCallId: part.toolCallId, toolName: part.toolName, result: part.output })}\n\n`
            ))
          } else if (part.type === "error") {
            controller.enqueue(enc.encode(
              `data: ${JSON.stringify({ type: "tool-error", error: String(part.error) })}\n\n`
            ))
          }
        }
        try {
          const usage = await result.usage
          logUso("anthropic", "claude-sonnet-4-6", "chat", usage.inputTokens ?? 0, usage.outputTokens ?? 0)
        } catch { /* non-critical */ }
      } finally {
        controller.enqueue(enc.encode("data: [DONE]\n\n"))
        controller.close()
      }
    },
  })

  return new NextResponse(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
