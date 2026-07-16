"use client"

import { useState } from "react"
import { toast } from "sonner"
import { CreditCard, CheckCircle2, AlertTriangle, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { UploadDropzone } from "@/components/modules/UploadDropzone"

interface LineaPreview {
  cuenta: string
  descripcion: string
  monto: number // centavos
  periodo: string
  tipoLinea: "impuesto" | "devolucion"
}

interface PreviewData {
  tarjetaDetectada: { id: string; nombre: string; banco: string; tipo: string } | null
  confidence: number
  nombreTarjeta: string
  periodo: string
  impuestos: LineaPreview[]
  devoluciones: LineaPreview[]
  totalImpuestos: number
  totalDevoluciones: number
  rawLineas: LineaPreview[]
}

function fmt(centavos: number) {
  const sign = centavos < 0 ? "-" : ""
  return `${sign}$${(Math.abs(centavos) / 100).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
}

function TipoBadge({ tipo }: { tipo: string }) {
  const map: Record<string, string> = {
    VISA: "bg-blue-100 text-blue-800",
    AMEX: "bg-sky-100 text-sky-800",
    MASTERCARD: "bg-orange-100 text-orange-800",
  }
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${map[tipo] ?? "bg-muted text-muted-foreground"}`}>
      {tipo}
    </span>
  )
}

function MiniTable({ lineas, emptyText }: { lineas: LineaPreview[]; emptyText: string }) {
  if (!lineas.length) {
    return <p className="text-xs text-muted-foreground py-2">{emptyText}</p>
  }
  return (
    <div className="max-h-40 overflow-y-auto rounded border text-xs">
      <table className="w-full">
        <tbody className="divide-y">
          {lineas.map((l, i) => (
            <tr key={i} className="hover:bg-muted/30">
              <td className="px-2 py-1 flex-1 truncate max-w-[220px]" title={l.descripcion}>{l.descripcion}</td>
              <td className="px-2 py-1 text-right tabular-nums font-medium whitespace-nowrap">{fmt(l.monto)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PreviewCard({ p }: { p: PreviewData }) {
  return (
    <div className="space-y-4">
      {/* Card detected */}
      <div className="rounded-lg border p-4 space-y-1">
        <p className="text-xs text-muted-foreground">Tarjeta detectada</p>
        {p.tarjetaDetectada ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">{p.tarjetaDetectada.nombre}</span>
            <TipoBadge tipo={p.tarjetaDetectada.tipo} />
            <span className="text-xs text-muted-foreground">BCO {p.tarjetaDetectada.banco}</span>
            {p.confidence >= 0.7 && (
              <span className="flex items-center gap-1 text-[11px] text-emerald-600">
                <CheckCircle2 className="h-3 w-3" /> Alta confianza
              </span>
            )}
            {p.confidence < 0.7 && p.confidence > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-amber-600">
                <AlertTriangle className="h-3 w-3" /> Confianza media — verificar
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-amber-600 text-sm">
            <AlertTriangle className="h-4 w-4" />
            <span>No se identificó la tarjeta. Se guardará como &quot;{p.nombreTarjeta}&quot;</span>
          </div>
        )}
        {p.periodo && (
          <p className="text-xs text-muted-foreground">Período: {p.periodo}</p>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
          <p className="text-xs text-orange-700">Impuestos</p>
          <p className="text-lg font-bold text-orange-800 mt-0.5">{fmt(p.totalImpuestos)}</p>
          <p className="text-xs text-orange-600">{p.impuestos.length} líneas</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs text-emerald-700">Devoluciones impositivas</p>
          <p className="text-lg font-bold text-emerald-800 mt-0.5">{fmt(p.totalDevoluciones)}</p>
          <p className="text-xs text-emerald-600">{p.devoluciones.length} líneas</p>
        </div>
      </div>

      {/* Detail tables */}
      {p.impuestos.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-700 mb-1.5 flex items-center gap-1">
            <ChevronRight className="h-3 w-3" /> Impuestos detectados
          </p>
          <MiniTable lineas={p.impuestos} emptyText="" />
        </div>
      )}
      {p.devoluciones.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-1.5 flex items-center gap-1">
            <ChevronRight className="h-3 w-3" /> Devoluciones impositivas
          </p>
          <MiniTable lineas={p.devoluciones} emptyText="" />
        </div>
      )}

      {p.impuestos.length === 0 && p.devoluciones.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground rounded-lg border p-4">
          <CreditCard className="h-4 w-4" />
          <span>No se detectaron impuestos en este extracto.</span>
        </div>
      )}
    </div>
  )
}

// Flujo de resumen de tarjeta (upload → preview → import). Reusado por la página
// /proveedores y por el modal "nueva tarjeta" del TasksPanel.
export function TarjetaFlow({ onImported }: { onImported?: () => void }) {
  const [mode, setMode] = useState<"upload" | "preview">("upload")
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number; current?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previews, setPreviews] = useState<Array<{ file: string; data?: PreviewData; error?: string }>>([])
  const [importing, setImporting] = useState(false)

  async function handleUpload(files: File[]) {
    setProcessing(true)
    setError(null)
    const results: Array<{ file: string; data?: PreviewData; error?: string }> = []
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      setProgress({ done: i + 1, total: files.length, current: f.name })
      try {
        const form = new FormData()
        form.append("file", f)
        const res = await fetch("/api/proveedores/tarjeta/preview", { method: "POST", body: form })
        const data = await res.json()
        if (!res.ok) results.push({ file: f.name, error: data.error ?? "Error al analizar el resumen" })
        else results.push({ file: f.name, data: data as PreviewData })
      } catch {
        results.push({ file: f.name, error: "Error de red al procesar el resumen" })
      }
    }
    setProgress(null)
    setProcessing(false)
    setPreviews(results)
    setMode("preview")
  }

  const conData = previews.filter((p) => p.data)

  async function handleImportarTodo() {
    if (!conData.length) return
    setImporting(true)
    setError(null)
    const errs: Array<{ file: string; error: string }> = []
    for (const p of conData) {
      const preview = p.data!
      try {
        const res = await fetch("/api/proveedores/tarjeta", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // ponytail: parametrizar ubicación de impuestos por banco+tarjeta (columna en tarjetas_maestras + override del prompt del extractor) es diferible; el prompt genérico cubre hoy.
          body: JSON.stringify({
            nombreTarjeta: preview.tarjetaDetectada?.nombre ?? preview.nombreTarjeta,
            periodo: preview.periodo,
            tarjetaMaestraId: preview.tarjetaDetectada?.id,
            rawLineas: preview.rawLineas,
          }),
        })
        const data = await res.json()
        if (!res.ok) errs.push({ file: p.file, error: data.error ?? "Error al importar" })
      } catch {
        errs.push({ file: p.file, error: "Error de red al importar" })
      }
    }
    setImporting(false)
    if (errs.length) toast.error(`No se importaron ${errs.length}: ${errs.map((e) => e.file).join(", ")}`)
    setPreviews([])
    setMode("upload")
    onImported?.()
  }

  if (mode === "upload") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-lg font-bold">Impuestos de tarjeta</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Subí el resumen (PDF, Excel o CSV) para extraer los impuestos (IVA, IIBB, percepciones, retenciones).
          </p>
        </div>
        <UploadDropzone
          accept=".pdf,.xlsx,.xls,.csv"
          multiple
          title="Arrastrá resúmenes de tarjeta"
          hint="PDF, Excel o CSV — podés subir varios"
          buttonLabel="Analizar"
          processing={processing}
          progress={progress ?? undefined}
          error={error}
          onUpload={handleUpload}
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Vista previa — Impuestos detectados</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setMode("upload"); setPreviews([]); setError(null) }}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleImportarTodo} disabled={importing || !conData.length}>
            {importing ? "Importando…" : `Importar todo (${conData.length})`}
          </Button>
        </div>
      </div>

      {previews.map((p, i) =>
        p.data ? (
          <div key={i} className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground truncate">{p.file}</p>
            <PreviewCard p={p.data} />
          </div>
        ) : (
          <div key={i} className="flex items-center gap-2 text-sm text-destructive rounded-lg border border-destructive/20 bg-destructive/5 p-3">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span><span className="font-medium">{p.file}</span> — {p.error}</span>
          </div>
        )
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
