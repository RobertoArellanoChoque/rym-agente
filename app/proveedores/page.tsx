"use client"

import { useState } from "react"
import { CreditCard, Plus, CheckCircle2, AlertTriangle, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TarjetaUpload } from "@/components/modules/TarjetaUpload"

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

export default function ProveedoresPage() {
  const [mode, setMode] = useState<"upload" | "preview">("upload")
  const [processing, setProcessing] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [importing, setImporting] = useState(false)

  async function handleUpload(file: File) {
    setProcessing(true)
    setError(null)
    setStepIndex(0)

    const timer0 = setTimeout(() => setStepIndex(1), 800)
    const timer1 = setTimeout(() => setStepIndex(2), 4000)
    const timer2 = setTimeout(() => setStepIndex(3), 10000)

    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/proveedores/tarjeta/preview", { method: "POST", body: form })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? "Error al analizar el resumen")
        return
      }

      setPreview(data as PreviewData)
      setMode("preview")
    } catch {
      setError("Error de red al procesar el resumen")
    } finally {
      clearTimeout(timer0)
      clearTimeout(timer1)
      clearTimeout(timer2)
      setProcessing(false)
      setStepIndex(0)
    }
  }

  async function handleImportar() {
    if (!preview) return
    setImporting(true)
    try {
      const res = await fetch("/api/proveedores/tarjeta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombreTarjeta: preview.tarjetaDetectada?.nombre ?? preview.nombreTarjeta,
          periodo: preview.periodo,
          tarjetaMaestraId: preview.tarjetaDetectada?.id,
          rawLineas: preview.rawLineas,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Error al importar")
        return
      }
      setPreview(null)
      setMode("upload")
    } catch {
      setError("Error de red al importar")
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-8 py-8">
      <div className="max-w-2xl mx-auto">

        {mode === "upload" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-lg font-bold">Impuestos de tarjeta</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Subí el PDF del resumen para extraer los impuestos (IVA, IIBB, percepciones, retenciones).
              </p>
            </div>
            <TarjetaUpload
              processing={processing}
              stepIndex={stepIndex}
              error={error}
              onUpload={handleUpload}
            />
          </div>
        )}

        {mode === "preview" && preview && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-bold">Vista previa — Impuestos detectados</h1>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setMode("upload"); setPreview(null); setError(null) }}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleImportar} disabled={importing}>
                  {importing ? "Importando…" : "Importar"}
                </Button>
              </div>
            </div>

            {/* Card detected */}
            <div className="rounded-lg border p-4 space-y-1">
              <p className="text-xs text-muted-foreground">Tarjeta detectada</p>
              {preview.tarjetaDetectada ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold">{preview.tarjetaDetectada.nombre}</span>
                  <TipoBadge tipo={preview.tarjetaDetectada.tipo} />
                  <span className="text-xs text-muted-foreground">BCO {preview.tarjetaDetectada.banco}</span>
                  {preview.confidence >= 0.7 && (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-600">
                      <CheckCircle2 className="h-3 w-3" /> Alta confianza
                    </span>
                  )}
                  {preview.confidence < 0.7 && preview.confidence > 0 && (
                    <span className="flex items-center gap-1 text-[11px] text-amber-600">
                      <AlertTriangle className="h-3 w-3" /> Confianza media — verificar
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-amber-600 text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  <span>No se identificó la tarjeta. Se guardará como "{preview.nombreTarjeta}"</span>
                </div>
              )}
              {preview.periodo && (
                <p className="text-xs text-muted-foreground">Período: {preview.periodo}</p>
              )}
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
                <p className="text-xs text-orange-700">Impuestos</p>
                <p className="text-lg font-bold text-orange-800 mt-0.5">{fmt(preview.totalImpuestos)}</p>
                <p className="text-xs text-orange-600">{preview.impuestos.length} líneas</p>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs text-emerald-700">Devoluciones impositivas</p>
                <p className="text-lg font-bold text-emerald-800 mt-0.5">{fmt(preview.totalDevoluciones)}</p>
                <p className="text-xs text-emerald-600">{preview.devoluciones.length} líneas</p>
              </div>
            </div>

            {/* Detail tables */}
            {preview.impuestos.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-orange-700 mb-1.5 flex items-center gap-1">
                  <ChevronRight className="h-3 w-3" /> Impuestos detectados
                </p>
                <MiniTable lineas={preview.impuestos} emptyText="" />
              </div>
            )}
            {preview.devoluciones.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-1.5 flex items-center gap-1">
                  <ChevronRight className="h-3 w-3" /> Devoluciones impositivas
                </p>
                <MiniTable lineas={preview.devoluciones} emptyText="" />
              </div>
            )}

            {preview.impuestos.length === 0 && preview.devoluciones.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground rounded-lg border p-4">
                <CreditCard className="h-4 w-4" />
                <span>No se detectaron impuestos en este extracto.</span>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
