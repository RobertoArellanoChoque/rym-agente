"use client"

import { useEffect, useState } from "react"
import { FileBarChart, Download, Printer, Loader2 } from "lucide-react"
import { centavosAString } from "@/lib/conciliacion/matching"
import type { Historico } from "@/lib/reportes/historico"

function ym(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export default function ReportesPage() {
  const hoy = new Date()
  const [desde, setDesde] = useState(() => ym(new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1)))
  const [hasta, setHasta] = useState(() => ym(hoy))
  const [bancoId, setBancoId] = useState("")
  const [data, setData] = useState<Historico | null>(null)
  const [bancos, setBancos] = useState<{ bancoId: string; bancoNombre: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams({ desde, hasta })
    if (bancoId) params.set("bancoId", bancoId)
    setLoading(true)
    setError(null)
    fetch(`/api/reportes/historico?${params}`)
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Error al cargar")
        return r.json() as Promise<Historico>
      })
      .then(d => {
        setData(d)
        // La lista de bancos se captura de la vista "todos" (sin filtro), para no encogerse al filtrar.
        if (!bancoId) setBancos(d.porBanco.map(b => ({ bancoId: b.bancoId, bancoNombre: b.bancoNombre })))
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [desde, hasta, bancoId])

  const descargarExcel = () => {
    const p = new URLSearchParams({ desde, hasta, formato: "xlsx" })
    if (bancoId) p.set("bancoId", bancoId)
    window.open(`/api/reportes/historico?${p}`, "_blank")
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Print: oculta el rail de nav global y los controles; deja solo el reporte. */}
      <style>{`@media print { aside, .no-print { display: none !important; } #reporte-print { padding: 0 !important; } }`}</style>

      {/* Header */}
      <div className="px-6 py-5 border-b bg-card no-print">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0" style={{ background: "color-mix(in oklch, var(--primary) 10%, transparent)" }}>
            <FileBarChart className="h-4 w-4" style={{ color: "var(--primary)" }} />
          </div>
          <div>
            <h1 className="text-lg font-bold">Reportes</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Histórico mensual de conciliaciones aprobadas</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div id="reporte-print" className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">

          {/* Filtros + acciones */}
          <div className="flex flex-wrap items-end gap-4 no-print">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Desde
              <input type="month" value={desde} onChange={e => setDesde(e.target.value)}
                className="h-9 rounded-lg border bg-background px-3 text-sm text-foreground" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Hasta
              <input type="month" value={hasta} onChange={e => setHasta(e.target.value)}
                className="h-9 rounded-lg border bg-background px-3 text-sm text-foreground" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Banco
              <select value={bancoId} onChange={e => setBancoId(e.target.value)}
                className="h-9 rounded-lg border bg-background px-3 text-sm text-foreground min-w-40">
                <option value="">Todos</option>
                {bancos.map(b => <option key={b.bancoId} value={b.bancoId}>{b.bancoNombre}</option>)}
              </select>
            </label>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={descargarExcel}
                className="inline-flex items-center gap-2 h-9 rounded-lg px-3 text-sm font-medium text-primary-foreground"
                style={{ background: "var(--primary)" }}>
                <Download className="h-4 w-4" /> Descargar Excel
              </button>
              <button onClick={() => window.print()}
                className="inline-flex items-center gap-2 h-9 rounded-lg border px-3 text-sm font-medium hover:bg-muted/50">
                <Printer className="h-4 w-4" /> Imprimir
              </button>
            </div>
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}

          {data && !loading && data.detalle.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <FileBarChart className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">Sin conciliaciones aprobadas en el rango</p>
              <p className="text-xs mt-1">Ajustá el período o el banco</p>
            </div>
          )}

          {data && data.detalle.length > 0 && (
            <>
              <ReportTable title="Resumen mensual" first="Período"
                rows={data.porPeriodo.map(p => ({ key: p.periodo, label: p.periodo, r: p }))} />
              <ReportTable title="Por banco" first="Banco"
                rows={data.porBanco.map(b => ({ key: b.bancoId, label: b.bancoNombre, r: b }))} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

type Totales = { cantidad: number; totalSaldoBanco: number; totalSaldoMayor: number; totalDiferencia: number }

function ReportTable({ title, first, rows }: { title: string; first: string; rows: { key: string; label: string; r: Totales }[] }) {
  const tot = rows.reduce(
    (s, { r }) => ({
      cantidad: s.cantidad + r.cantidad,
      totalSaldoBanco: s.totalSaldoBanco + r.totalSaldoBanco,
      totalSaldoMayor: s.totalSaldoMayor + r.totalSaldoMayor,
      totalDiferencia: s.totalDiferencia + r.totalDiferencia,
    }),
    { cantidad: 0, totalSaldoBanco: 0, totalSaldoMayor: 0, totalDiferencia: 0 },
  )

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b flex items-center gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{first}</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Conc.</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Saldo Banco</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Saldo Mayor</th>
              <th className="text-right px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Diferencia</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map(({ key, label, r }) => (
              <tr key={key} className="hover:bg-muted/20 transition-colors">
                <td className="px-5 py-3 font-medium">{label}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.cantidad}</td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">{centavosAString(r.totalSaldoBanco)}</td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">{centavosAString(r.totalSaldoMayor)}</td>
                <td className="px-5 py-3 text-right font-mono tabular-nums">{centavosAString(r.totalDiferencia)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t">
            <tr className="font-semibold">
              <td className="px-5 py-3">Total</td>
              <td className="px-4 py-3 text-right tabular-nums">{tot.cantidad}</td>
              <td className="px-4 py-3 text-right font-mono tabular-nums">{centavosAString(tot.totalSaldoBanco)}</td>
              <td className="px-4 py-3 text-right font-mono tabular-nums">{centavosAString(tot.totalSaldoMayor)}</td>
              <td className="px-5 py-3 text-right font-mono tabular-nums">{centavosAString(tot.totalDiferencia)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
