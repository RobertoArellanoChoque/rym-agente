"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import {
  Send, Loader2, Paperclip, X, FileText,
  CheckCircle2, AlertCircle, ChevronDown, Zap, Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useChat, type ChatMessage as Message, type ToolEvent } from "@/lib/context/chat-context"

const TOOL_LABELS: Record<string, string> = {
  ver_estado_general: "Estado general",
  ejecutar_matching: "Matching",
  aprobar_conciliacion: "Aprobar conciliación",
  crear_sesion: "Nueva sesión",
  listar_discrepancias: "Discrepancias",
  listar_sesiones: "Listar sesiones",
  ver_sesion: "Ver sesión",
  ver_saldos: "Saldos",
  ver_partidas: "Partidas",
  ver_tarjeta: "Ver tarjeta",
  listar_tarjetas: "Listar tarjetas",
  analizar_tarjeta: "Analizar tarjeta",
  listar_retenciones: "Listar retenciones",
  ver_retencion: "Ver retención",
  resumen_retenciones: "Resumen retenciones",
}

const CHIPS = [
  "Ver estado general",
  "Listar conciliaciones",
  "Listar tarjetas",
  "Ver saldos bancarios",
]

const DEFAULT_WELCOME =
  "Hola, soy el asistente de RyM. Podés escribirme o arrastrar un archivo (extracto bancario, resumen de tarjeta, comprobante de pago) y lo identifico automáticamente."

function ToolCard({ tool }: { tool: ToolEvent }) {
  const [expanded, setExpanded] = useState(false)
  const label = TOOL_LABELS[tool.toolName] ?? tool.toolName

  return (
    <div className="rounded-md border border-border bg-muted/30 text-xs my-1 overflow-hidden">
      <button
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-muted/50 transition-colors"
        onClick={() => tool.status !== "running" && setExpanded(v => !v)}
      >
        {tool.status === "running" && <Loader2 className="h-3 w-3 animate-spin text-amber-500 shrink-0" />}
        {tool.status === "done" && <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />}
        {tool.status === "error" && <AlertCircle className="h-3 w-3 text-destructive shrink-0" />}
        <Zap className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
        <span className="font-medium text-muted-foreground">{label}</span>
        {tool.status === "running" && (
          <span className="text-amber-600 ml-auto text-[10px]">ejecutando…</span>
        )}
        {tool.status !== "running" && (
          <ChevronDown className={cn("h-3 w-3 ml-auto text-muted-foreground transition-transform", expanded && "rotate-180")} />
        )}
      </button>
      {expanded && tool.result !== undefined && (
        <div className="px-3 pb-2 border-t border-border bg-muted/20">
          <pre className="text-[10px] leading-relaxed text-muted-foreground overflow-auto max-h-40 whitespace-pre-wrap mt-1.5">
            {JSON.stringify(tool.result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

export function ChatInterface({ welcomeMessage = DEFAULT_WELCOME }: { welcomeMessage?: string }) {
  const { messages, setMessages, clearMessages } = useChat()
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [attachedFile, setAttachedFile] = useState<File | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [draggingOver, setDraggingOver] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  function autoResize() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  function addMessage(msg: Omit<Message, "id">) {
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
    if (!text && !attachedFile) return

    if (!overrideText) setInput("")
    setLoading(true)

    const historyMessages = [...messages]

    let fileContext: string | null = null
    if (attachedFile) {
      const fileName = attachedFile.name
      addMessage({ role: "user", content: text ? `${text}\n\n📎 ${fileName}` : `📎 ${fileName}` })
      try {
        fileContext = await processFile(attachedFile)
        if (fileContext) addMessage({ role: "system", content: fileContext })
      } catch {
        fileContext = "Error al procesar el archivo."
        addMessage({ role: "system", content: fileContext })
      }
      setAttachedFile(null)
    } else {
      addMessage({ role: "user", content: text })
    }

    const chatHistory = [
      ...historyMessages,
      attachedFile
        ? { id: "", role: "user" as const, content: text ? `${text}\n\n📎 ${attachedFile?.name ?? "archivo"}` : `📎 ${attachedFile?.name ?? "archivo"}` }
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
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, input, attachedFile, messages, sessionId])

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault()
    setDraggingOver(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const ext = file.name.toLowerCase().split(".").pop() ?? ""
    if (["pdf", "xlsx", "xls", "csv"].includes(ext)) setAttachedFile(file)
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
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-primary/10 border-2 border-dashed border-primary pointer-events-none">
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
        <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center px-6">
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl shrink-0" style={{ background: "rgba(229,39,19,0.1)" }}>
            <svg viewBox="0 0 24 22" fill="none" className="w-6 h-6" aria-hidden>
              <path d="M2 11 L7.5 18 L19 2" stroke="#E52713" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="5" y1="21" x2="13" y2="21" stroke="#E52713" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">RyM Agente</h1>
            <p className="text-muted-foreground text-sm mt-1.5 max-w-sm">
              {welcomeMessage}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            {CHIPS.map(chip => (
              <button
                key={chip}
                onClick={() => send(chip)}
                className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <ScrollArea className="flex-1 pr-1">
          <div className="space-y-5 py-4 px-2">
            {messages.map(msg => {
              if (msg.role === "system") {
                return (
                  <div key={msg.id} className="flex gap-2 items-start">
                    <div className="h-5 w-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                      <FileText className="h-3 w-3 text-emerald-700" />
                    </div>
                    <div className="rounded-lg px-3 py-2 text-xs bg-emerald-50 text-emerald-900 border border-emerald-100 max-w-[90%]">
                      {msg.content}
                    </div>
                  </div>
                )
              }

              if (msg.role === "user") {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[80%] px-3.5 py-2.5 rounded-xl text-sm leading-relaxed bg-primary/10 border border-primary/20 text-foreground">
                      {msg.content}
                    </div>
                  </div>
                )
              }

              // assistant
              return (
                <div key={msg.id} className="flex flex-col gap-0.5 max-w-[92%]">
                  {msg.tools?.map(t => <ToolCard key={t.toolCallId} tool={t} />)}
                  {msg.content ? (
                    <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                      {msg.content}
                    </p>
                  ) : (
                    !msg.tools?.length && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground mt-1" />
                  )}
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>
      )}

      {/* File attached preview */}
      {attachedFile && (
        <div className="flex items-center gap-2 px-2 py-1.5 mb-2 bg-muted rounded-md text-xs">
          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="flex-1 truncate">{attachedFile.name}</span>
          <button onClick={() => setAttachedFile(null)} className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="mt-3 rounded-xl border border-border bg-card px-3 py-2 flex items-end gap-2 focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.xlsx,.xls,.csv"
          className="hidden"
          onChange={e => e.target.files?.[0] && setAttachedFile(e.target.files[0])}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <textarea
          ref={textareaRef}
          value={input}
          rows={1}
          onChange={e => { setInput(e.target.value); autoResize() }}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder={attachedFile ? "Agregá un mensaje o enviá el archivo…" : "Preguntá o arrastrá un PDF…"}
          disabled={loading}
          className="flex-1 bg-transparent resize-none text-sm leading-relaxed outline-none min-h-[24px] max-h-[120px] placeholder:text-muted-foreground"
          style={{ lineHeight: "1.5rem" }}
        />
        <Button
          onClick={() => send()}
          disabled={(!input.trim() && !attachedFile) || loading}
          size="icon"
          className="h-7 w-7 shrink-0"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  )
}
