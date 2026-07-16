"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Loader2, Paperclip, X, FileText, Trash2, ArrowUp } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Message } from "@/components/ai/message"
import { Suggestions } from "@/components/ai/suggestions"
import {
  PromptInput, PromptInputTextarea, PromptInputActions, PromptInputAction,
} from "@/components/ai/prompt-input"
import { useChat, type ChatMessage } from "@/lib/context/chat-context"
import { useAgentActivity } from "@/lib/context/agent-activity-context"

const CHIPS = [
  "Ver estado general",
  "Listar conciliaciones",
  "Listar tarjetas",
  "Ver saldos bancarios",
]

const DEFAULT_WELCOME =
  "Hola, soy el asistente de RyM. Podés escribirme o arrastrar un archivo (extracto bancario, resumen de tarjeta, comprobante de pago) y lo identifico automáticamente."

export function ChatInterface({ welcomeMessage = DEFAULT_WELCOME }: { welcomeMessage?: string }) {
  const { messages, setMessages, clearMessages } = useChat()
  const { setIsStreaming } = useAgentActivity()
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [draggingOver, setDraggingOver] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  function addMessage(msg: Omit<ChatMessage, "id">) {
    setMessages(prev => [...prev, { ...msg, id: crypto.randomUUID() }])
  }

  async function processFile(file: File): Promise<string | null> {
    const form = new FormData()
    form.append("file", file)
    if (sessionId) form.append("sessionId", sessionId)

    const res = await fetch("/api/orchestrator/upload", { method: "POST", body: form })
    const data = await res.json()

    if (!res.ok) return `Error al procesar el archivo: ${data.error ?? "desconocido"}`
    if (data.sessionId) setSessionId(data.sessionId)
    return data.summary ?? null
  }

  const send = useCallback(async (overrideText?: string) => {
    if (loading) return
    const text = (overrideText ?? input).trim()
    if (!text && attachedFiles.length === 0) return

    if (!overrideText) setInput("")

    // Multi-archivo → conciliación batch (agrupa por banco+mes, sin LLM)
    if (attachedFiles.length > 1) {
      const files = attachedFiles
      setAttachedFiles([])
      setLoading(true); setIsStreaming(true)
      try { await runBatch(files, text) } finally { setLoading(false); setIsStreaming(false) }
      return
    }

    const single = attachedFiles[0] ?? null
    setLoading(true)
    setIsStreaming(true)

    const historyMessages = [...messages]

    let fileContext: string | null = null
    if (single) {
      const fileName = single.name
      addMessage({ role: "user", content: text ? `${text}\n\n📎 ${fileName}` : `📎 ${fileName}` })
      try {
        fileContext = await processFile(single)
        if (fileContext) addMessage({ role: "system", content: fileContext })
      } catch {
        fileContext = "Error al procesar el archivo."
        addMessage({ role: "system", content: fileContext })
      }
      setAttachedFiles([])
    } else {
      addMessage({ role: "user", content: text })
    }

    const chatHistory = [
      ...historyMessages,
      single
        ? { id: "", role: "user" as const, content: text ? `${text}\n\n📎 ${single.name}` : `📎 ${single.name}` }
        : { id: "", role: "user" as const, content: text },
      ...(fileContext ? [{ id: "", role: "user" as const, content: `[ARCHIVO PROCESADO]\n${fileContext}` }] : []),
    ]

    const apiMessages = chatHistory
      .filter(m => m.role !== "system")
      .map(m => ({ role: m.role === "system" ? "user" : m.role, content: m.content }))
      .slice(-10)

    if (fileContext) {
      apiMessages.push({ role: "user", content: `[ARCHIVO PROCESADO]\n${fileContext}` })
    }

    const assistantId = crypto.randomUUID()
    setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "", tools: [] }])

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
      })

      if (!res.body) throw new Error("No stream")
      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        for (const line of chunk.split("\n").filter(l => l.startsWith("data: "))) {
          const raw = line.slice(6)
          if (raw === "[DONE]") break
          try {
            const event = JSON.parse(raw)
            if (event.type === "text") {
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, content: m.content + event.content } : m
              ))
            } else if (event.type === "tool-call") {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, tools: [...(m.tools ?? []), { toolCallId: event.toolCallId, toolName: event.toolName, status: "running" as const, args: event.args }] }
                  : m
              ))
            } else if (event.type === "tool-result") {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, tools: (m.tools ?? []).map(t => t.toolCallId === event.toolCallId ? { ...t, status: "done" as const, result: event.result } : t) }
                  : m
              ))
            } else if (event.type === "tool-error") {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, tools: (m.tools ?? []).map(t => t.toolCallId === event.toolCallId ? { ...t, status: "error" as const, error: event.error } : t) }
                  : m
              ))
            }
          } catch { /* skip malformed chunk */ }
        }
      }
    } catch {
      setMessages(prev =>
        prev.map(m => m.id === assistantId ? { ...m, content: "Error al contactar el asistente." } : m)
      )
    } finally {
      setLoading(false)
      setIsStreaming(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, input, attachedFiles, messages, sessionId])

  const esFormatoValido = (f: File) => ["pdf", "xlsx", "xls", "csv"].includes(f.name.toLowerCase().split(".").pop() ?? "")

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault()
    setDraggingOver(false)
    const files = Array.from(e.dataTransfer.files).filter(esFormatoValido)
    if (files.length) setAttachedFiles(prev => [...prev, ...files])
  }

  // Conciliación multi-archivo: NO pasa por el LLM (binario nunca al modelo, /cso F1).
  async function runBatch(files: File[], text: string) {
    addMessage({ role: "user", content: `${text ? text + "\n\n" : ""}${files.length} archivos: ${files.map(f => f.name).join(", ")}` })
    addMessage({ role: "system", content: "Procesando y conciliando por banco y mes…" })
    const form = new FormData()
    files.forEach(f => form.append("files", f))
    try {
      const res = await fetch("/api/conciliacion/ingest-batch", { method: "POST", body: form })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { addMessage({ role: "system", content: `Error: ${d.error ?? "no se pudo procesar"}` }); return }
      const fmt = (c?: number) => c == null ? "" : ` — dif $${(Math.abs(c) / 100).toLocaleString("es-AR")}${c === 0 ? " (cuadra)" : ""}`
      const lines = (d.sesiones ?? []).map((s: { label?: string; banco: boolean; tango: boolean; diferencia?: number }) =>
        `• ${s.label ?? "Conciliación"}${s.banco && s.tango ? fmt(s.diferencia) : s.banco ? " — solo banco (falta mayor)" : " — solo mayor (falta extracto)"}`)
      const errs = (d.errores ?? []).map((e: { file: string; error: string }) => `Error — ${e.file}: ${e.error}`)
      addMessage({ role: "system", content: `Listo. ${d.sesiones?.length ?? 0} conciliación(es):\n${lines.join("\n")}${errs.length ? `\n\n${errs.join("\n")}` : ""}` })
      window.dispatchEvent(new Event("tasks-refresh"))
    } catch {
      addMessage({ role: "system", content: "Error al procesar los archivos." })
    }
  }

  const isEmptyState = messages.length === 1 && messages[0].id === "welcome"

  return (
    <div
      className="flex flex-col h-full relative"
      onDragOver={e => { e.preventDefault(); setDraggingOver(true) }}
      onDragLeave={() => setDraggingOver(false)}
      onDrop={handleFileDrop}
    >
      {draggingOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-primary/10 border-2 border-dashed border-primary shadow-glow pointer-events-none">
          <p className="text-sm font-medium text-primary">Soltá el archivo aquí</p>
        </div>
      )}

      {/* Clear button — only when there are messages */}
      {!isEmptyState && (
        <div className="flex justify-end px-2 pt-2 shrink-0">
          <button
            onClick={clearMessages}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <Trash2 className="h-3 w-3" />
            Limpiar conversación
          </button>
        </div>
      )}

      {/* Empty state splash */}
      {isEmptyState ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center px-6 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--primary)_6%,transparent),transparent_60%)]">
          <div
            className="flex items-center justify-center w-14 h-14 rounded-2xl shrink-0 shadow-glow animate-in fade-in zoom-in-95 duration-500 fill-mode-backwards"
            style={{ background: "color-mix(in oklch, var(--primary) 10%, transparent)" }}
          >
            <svg viewBox="0 0 24 22" fill="none" className="w-7 h-7" aria-hidden>
              <path d="M2 11 L7.5 18 L19 2" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="5" y1="21" x2="13" y2="21" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-100 fill-mode-backwards">
            <h1
              className="text-3xl font-bold tracking-tight"
              style={{ fontFamily: "var(--font-cabinet-grotesk)" }}
            >
              RyM Agente
            </h1>
            <p className="text-muted-foreground text-sm mt-1.5 max-w-sm">
              {welcomeMessage}
            </p>
          </div>
          <Suggestions
            className="justify-center animate-in fade-in slide-in-from-bottom-2 duration-500 delay-200 fill-mode-backwards"
            items={CHIPS.map(chip => ({ id: chip, label: chip }))}
            onSelect={item => send(item.label)}
            disabled={loading}
          />
        </div>
      ) : (
        <ScrollArea className="flex-1 pr-1 scroll-fade-y">
          <div className="space-y-5 py-4 px-2">
            {messages.map(msg => <Message key={msg.id} msg={msg} />)}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>
      )}

      {/* Input area */}
      <PromptInput
        className="mt-3"
        value={input}
        onValueChange={setInput}
        onSubmit={() => send()}
        isLoading={loading}
        disabled={loading}
      >
        {/* Archivos adjuntos */}
        {attachedFiles.length > 0 && (
          <div className="space-y-1 mb-2">
            {attachedFiles.length > 1 && (
              <p className="px-1 text-[10px] text-muted-foreground">{attachedFiles.length} archivos → se conciliarán por banco y mes</p>
            )}
            {attachedFiles.map((f, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5 bg-muted rounded-lg text-xs">
                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate">{f.name}</span>
                <button onClick={() => setAttachedFiles(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <PromptInputTextarea
          placeholder={attachedFiles.length ? "Agregá un mensaje o enviá los archivos…" : "Preguntá o arrastrá extractos y mayores…"}
        />

        <PromptInputActions className="justify-between">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.xlsx,.xls,.csv"
            multiple
            className="hidden"
            onChange={e => {
              const files = Array.from(e.target.files ?? []).filter(esFormatoValido)
              if (files.length) setAttachedFiles(prev => [...prev, ...files])
              e.target.value = ""
            }}
          />
          <PromptInputAction tooltip="Adjuntar pdf / xlsx / csv">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <Paperclip className="h-4 w-4" />
            </button>
          </PromptInputAction>
          <PromptInputAction tooltip={loading ? "Procesando…" : "Enviar"}>
            <button
              type="button"
              onClick={() => send()}
              disabled={(!input.trim() && attachedFiles.length === 0) || loading}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-glow transition-all hover:bg-primary/90 disabled:opacity-40 disabled:shadow-none"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </PromptInputAction>
        </PromptInputActions>
      </PromptInput>
    </div>
  )
}
