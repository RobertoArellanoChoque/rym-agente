"use client"

// Patrón de 21st.dev #12363 "Thinking Tool" (Agent Elements): label con shimmer
// mientras corre + collapsible. Aplicado al ToolCard original de ChatInterface,
// mismo ToolEvent de chat-context. El utility `shimmer` viene de shadcn/tailwind.css.

import { useState } from "react"
import { Loader2, CheckCircle2, AlertCircle, ChevronDown, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ToolEvent } from "@/lib/context/chat-context"

const TOOL_LABELS: Record<string, string> = {
  ver_estado_general: "Estado general",
  ejecutar_matching: "Matching",
  aprobar_conciliacion: "Aprobar conciliación",
  crear_sesion: "Nueva sesión",
  explicar_diferencia: "Explicar diferencia",
  contabilizar_pendientes: "Contabilizar pendientes",
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

export function ToolCard({ tool }: { tool: ToolEvent }) {
  const [expanded, setExpanded] = useState(false)
  const label = TOOL_LABELS[tool.toolName] ?? tool.toolName
  const running = tool.status === "running"

  return (
    <div className="rounded-lg border border-border bg-muted/30 text-xs my-1 overflow-hidden">
      <button
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-muted/50 transition-colors"
        onClick={() => !running && setExpanded(v => !v)}
      >
        {running && <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />}
        {tool.status === "done" && <CheckCircle2 className="h-3 w-3 text-success shrink-0" />}
        {tool.status === "error" && <AlertCircle className="h-3 w-3 text-destructive shrink-0" />}
        <Zap className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
        <span className={cn("font-medium text-muted-foreground", running && "shimmer")}>
          {label}
        </span>
        {running ? (
          <span className="shimmer text-muted-foreground ml-auto text-[10px]">ejecutando…</span>
        ) : (
          <ChevronDown className={cn("h-3 w-3 ml-auto text-muted-foreground transition-transform", expanded && "rotate-180")} />
        )}
      </button>
      {expanded && tool.result !== undefined && (
        <div className="px-3 pb-2 border-t border-border bg-muted/20">
          <pre className="text-[10px] font-mono leading-relaxed text-muted-foreground overflow-auto max-h-40 whitespace-pre-wrap mt-1.5">
            {JSON.stringify(tool.result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
