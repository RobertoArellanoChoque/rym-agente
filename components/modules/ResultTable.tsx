"use client"

import { useState, useMemo, type ReactNode } from "react"
import { CheckCircle2, XCircle, AlertCircle, Lightbulb, HelpCircle } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import type { ResultadoConciliacion, Match } from "@/lib/types"
import { centavosAString } from "@/lib/conciliacion/matching"
import { categorizarMovimiento, normalizeConcepto } from "@/lib/extractos/categorize"

interface ResultTableProps {
  resultado: ResultadoConciliacion
  sessionId?: string
}

export function ResultTable({ resultado, sessionId }: ResultTableProps) {
  const { discrepancias, movimientos, asientos, saldoBanco, saldoMayor, conceptosPendientes, conceptosPendientesTango, diferencia, candidatosAConciliarIds, sumaPartidas, diferenciaAjustada } =
    resultado

  const [matchStates, setMatchStates] = useState<Record<number, "confirmed" | "rejected">>({})

  const confirmed = resultado.matches.filter(m => {
    const override = m.id != null ? matchStates[m.id] : undefined
    return (override ?? m.tipo) === "confirmed"
  })
  const probable = resultado.matches.filter(m => {
    const override = m.id != null ? matchStates[m.id] : undefined
    return (override ?? m.tipo) === "probable"
  })

  const candidatosSet = new Set(candidatosAConciliarIds ?? [])

  const CATEGORIA_LABELS: Record<string, string> = {
    impuesto: "Impuestos",
    percepcion: "Percepciones",
    transferencia: "Transferencias",
    cheque: "Cheques",
    comision: "Comisiones",
    otro: "Otros",
  }

  // Resumen por categoría: banco neto + tango neto. Se cancelan cuando están conciliados (banco negativo + tango positivo ≈ 0)
  const categorySummary = useMemo(() => {
    const bancoMap: Record<string, number> = {}
    for (const m of movimientos) {
      const cat = m.categoria ?? "otro"
      bancoMap[cat] = (bancoMap[cat] ?? 0) + m.monto
    }
    const tangoMap: Record<string, number> = {}
    for (const a of asientos) {
      const cat = categorizarMovimiento(a.descripcion)
      tangoMap[cat] = (tangoMap[cat] ?? 0) + a.monto
    }
    const cats = new Set([...Object.keys(bancoMap), ...Object.keys(tangoMap)])
    return [...cats]
      .map(cat => ({
        cat,
        banco: bancoMap[cat] ?? 0,
        tango: tangoMap[cat] ?? 0,
        diff: (bancoMap[cat] ?? 0) + (tangoMap[cat] ?? 0),
      }))
      .filter(c => c.banco !== 0 || c.tango !== 0)
      .sort((a, b) => Math.abs(b.banco) - Math.abs(a.banco))
  }, [movimientos, asientos])

  // Detalle por concepto: agrupa banco+Tango por (categoria, descripcion normalizada)
  const conceptosSummary = useMemo(() => {
    const map = new Map<string, { cat: string; concepto: string; banco: number; tango: number }>()

    for (const m of movimientos) {
      const cat = m.categoria ?? "otro"
      const concepto = normalizeConcepto(m.descripcion)
      const key = `${cat}||${concepto}`
      const prev = map.get(key)
      if (prev) prev.banco += m.monto
      else map.set(key, { cat, concepto, banco: m.monto, tango: 0 })
    }

    for (const a of asientos) {
      const cat = categorizarMovimiento(a.descripcion)
      const concepto = normalizeConcepto(a.descripcion)
      const key = `${cat}||${concepto}`
      const prev = map.get(key)
      if (prev) prev.tango += a.monto
      else map.set(key, { cat, concepto, banco: 0, tango: a.monto })
    }

    return [...map.values()]
      .filter(c => c.banco !== 0 || c.tango !== 0)
      .sort((a, b) => a.cat !== b.cat
        ? a.cat.localeCompare(b.cat)
        : Math.abs(b.banco) - Math.abs(a.banco))
  }, [movimientos, asientos])

  const getMovimiento = (id: string) => movimientos.find((m) => m.id === id)
  const getAsiento = (id: string) => asientos.find((a) => a.id === id)

  async function handleMatchAction(match: Match, action: "confirm" | "reject") {
    if (!match.id || !sessionId) return
    try {
      await fetch("/api/conciliacion/match", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: match.id, action }),
      })
      setMatchStates(prev => ({ ...prev, [match.id!]: action === "confirm" ? "confirmed" : "rejected" }))
    } catch (err) {
      console.error("[ResultTable] handleMatchAction error:", err)
    }
  }

  return (
    <div className="space-y-6">
      {/* Fórmula de conciliación */}
      <div className="rounded-lg border bg-slate-50/50 p-5 space-y-3">
        <h3 className="text-sm font-semibold">Fórmula de conciliación</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Saldo mayor Tango (última fila):</span>
            <span className="tabular-nums font-medium">{centavosAString(saldoMayor)}</span>
          </div>
          {conceptosPendientes !== 0 && (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>+ Banco no contabilizados en Tango:</span>
              <span className="tabular-nums">{centavosAString(conceptosPendientes)}</span>
            </div>
          )}
          {(conceptosPendientesTango ?? 0) !== 0 && (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>− Tango no en extracto banco:</span>
              <span className="tabular-nums">({centavosAString(conceptosPendientesTango ?? 0)})</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Saldo extracto bancario:</span>
            <span className="tabular-nums font-medium">{centavosAString(saldoBanco)}</span>
          </div>
          <div className="border-t border-slate-200 my-2 pt-2 flex justify-between">
            <span className="font-medium">Diferencia:</span>
            <span className={`tabular-nums font-semibold ${diferencia === 0 ? "text-emerald-700" : "text-amber-700"}`}>
              {centavosAString(diferencia)}
            </span>
          </div>
          {sumaPartidas !== undefined && sumaPartidas !== 0 && (
            <>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Partidas manuales adicionales:</span>
                <span className="tabular-nums">{centavosAString(sumaPartidas)}</span>
              </div>
              <div className="border-t border-slate-200 my-2 pt-2 flex justify-between">
                <span>Diferencia ajustada:</span>
                <span className={`tabular-nums font-semibold ${diferenciaAjustada === 0 ? "text-emerald-700" : "text-amber-700"}`}>
                  {centavosAString(diferenciaAjustada ?? 0)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Resumen saldos */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Saldo Banco</p>
          <p className="text-2xl font-bold mt-1 tabular-nums">{centavosAString(saldoBanco)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Saldo Mayor (Tango)</p>
          <p className="text-2xl font-bold mt-1 tabular-nums">{centavosAString(saldoMayor)}</p>
        </div>
        <div className={`rounded-lg border p-4 ${diferencia === 0 ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Diferencia</p>
          <p className={`text-2xl font-bold mt-1 tabular-nums ${diferencia === 0 ? "text-emerald-700" : "text-amber-700"}`}>
            {centavosAString(diferencia)}
          </p>
        </div>
      </div>

      <Separator />

      {/* Conciliados confirmados */}
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          Conciliados ({confirmed.length})
        </h3>
        {confirmed.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin coincidencias</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Descripción Banco</TableHead>
                <TableHead>Descripción Tango</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="text-right">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {confirmed.map((m) => {
                const mov = getMovimiento(m.movimientoId)
                const asi = getAsiento(m.asientoId)
                return (
                  <TableRow key={`${m.movimientoId}-${m.asientoId}`}>
                    <TableCell className="text-sm tabular-nums">{mov?.fecha}</TableCell>
                    <TableCell className="text-sm">{mov?.descripcion}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{asi?.descripcion}</TableCell>
                    <TableCell className="text-sm text-right tabular-nums">{centavosAString(mov?.monto ?? 0)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={m.score >= 80 ? "default" : "secondary"} className="tabular-nums">{m.score}</Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Probables (sugeridos por IA) */}
      {probable.length > 0 && (
        <>
          <Separator />
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <HelpCircle className="h-4 w-4 text-blue-500" />
              Probables — sugeridos por IA ({probable.length})
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              La IA encontró estos matches posibles aunque las descripciones difieran. Confirmá o rechazá cada uno.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Banco</TableHead>
                  <TableHead>Tango</TableHead>
                  <TableHead>Explicación IA</TableHead>
                  <TableHead className="text-right">Diferencia</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {probable.map((m) => {
                  const mov = getMovimiento(m.movimientoId)
                  const asi = getAsiento(m.asientoId)
                  return (
                    <TableRow key={`${m.movimientoId}-${m.asientoId}`} className="bg-blue-50/40">
                      <TableCell className="text-sm">
                        <div className="font-medium">{mov?.descripcion}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">{mov?.fecha} · {centavosAString(mov?.monto ?? 0)}</div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium">{asi?.descripcion}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">{asi?.fecha} · {centavosAString(asi?.monto ?? 0)}</div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs">{m.explicacion}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">
                        {m.diferenciaMonto ? centavosAString(m.diferenciaMonto) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                            onClick={() => handleMatchAction(m, "confirm")}>Confirmar</Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/5"
                            onClick={() => handleMatchAction(m, "reject")}>Rechazar</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <Separator />

      {/* Discrepancias */}
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <XCircle className="h-4 w-4 text-destructive" />
          Discrepancias ({discrepancias.length})
        </h3>
        {discrepancias.length === 0 ? (
          <p className="text-sm text-emerald-600 font-medium">¡Sin discrepancias! La conciliación es perfecta.</p>
        ) : (
          <>
          {/* Subtotales por sección */}
          <div className="flex gap-6 mb-3 text-sm">
            <div>
              <span className="text-muted-foreground">No contabilizados (banco→Tango): </span>
              <span className="font-semibold tabular-nums">
                {centavosAString(discrepancias.filter(d => d.tipo === "en_extracto_no_en_mayor").reduce((s, d) => s + d.monto, 0))}
              </span>
              <span className="text-muted-foreground ml-1 text-xs">
                ({discrepancias.filter(d => d.tipo === "en_extracto_no_en_mayor").length} ítems)
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Pendientes acreditación (Tango→banco): </span>
              <span className="font-semibold tabular-nums">
                {centavosAString(discrepancias.filter(d => d.tipo === "en_mayor_no_en_extracto").reduce((s, d) => s + d.monto, 0))}
              </span>
              <span className="text-muted-foreground ml-1 text-xs">
                ({discrepancias.filter(d => d.tipo === "en_mayor_no_en_extracto").length} ítems)
              </span>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {discrepancias.map((d, i) => {
                const itemId = d.movimientoId ?? d.asientoId ?? ""
                const esCandidato = candidatosSet.has(itemId)
                return (
                  <TableRow key={i} className={esCandidato ? "bg-amber-50" : "bg-destructive/5"}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant="destructive" className="text-xs whitespace-nowrap w-fit">
                          {d.tipo === "en_extracto_no_en_mayor" ? "No contabilizado" : "Pendiente acreditación"}
                        </Badge>
                        {esCandidato && (
                          <Badge variant="outline" className="text-xs whitespace-nowrap w-fit bg-amber-100 text-amber-700 border-amber-300">
                            candidato
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">{d.fecha}</TableCell>
                    <TableCell className="text-sm">{d.descripcion}</TableCell>
                    <TableCell className="text-sm text-right tabular-nums">{centavosAString(d.monto)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          </>
        )}
      </div>

      {discrepancias.length > 0 && diferencia !== 0 && (candidatosAConciliarIds?.length ?? 0) > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-800">
          <Lightbulb className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            Se encontraron <strong>{candidatosAConciliarIds?.length}</strong> items marcados como &quot;candidato&quot; cuya suma explica la diferencia de {centavosAString(diferencia)}. Revisalos: si los contabilizás en Tango, la conciliación queda en 0.
          </p>
        </div>
      )}
      {discrepancias.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-800">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            Hay {discrepancias.length} movimiento(s) sin conciliar. Revisalos con tu contador o preguntale al asistente.
          </p>
        </div>
      )}

      <Separator />

      {/* Resumen por tipo de movimiento */}
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-1">
          Resumen por tipo
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Banco (débitos negativos) + Tango (haberes positivos) se cancelan cuando están conciliados. Diferencia ≠ 0 indica items pendientes en esa categoría.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Total Banco</TableHead>
              <TableHead className="text-right">Total Tango</TableHead>
              <TableHead className="text-right">Diferencia</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categorySummary.map(({ cat, banco, tango, diff }) => (
              <TableRow key={cat}>
                <TableCell className="font-medium text-sm">{CATEGORIA_LABELS[cat] ?? cat}</TableCell>
                <TableCell className={`text-right tabular-nums text-sm ${banco < 0 ? "text-destructive" : "text-emerald-700"}`}>
                  {centavosAString(banco)}
                </TableCell>
                <TableCell className={`text-right tabular-nums text-sm ${tango < 0 ? "text-destructive" : "text-emerald-700"}`}>
                  {centavosAString(tango)}
                </TableCell>
                <TableCell className={`text-right tabular-nums text-sm font-semibold ${diff === 0 ? "text-emerald-700" : "text-amber-700"}`}>
                  {centavosAString(diff)}
                </TableCell>
              </TableRow>
            ))}
            {/* Totales */}
            <TableRow className="border-t-2 bg-slate-50">
              <TableCell className="font-semibold text-sm">Total</TableCell>
              <TableCell className={`text-right tabular-nums text-sm font-semibold ${categorySummary.reduce((s, c) => s + c.banco, 0) < 0 ? "text-destructive" : "text-emerald-700"}`}>
                {centavosAString(categorySummary.reduce((s, c) => s + c.banco, 0))}
              </TableCell>
              <TableCell className={`text-right tabular-nums text-sm font-semibold ${categorySummary.reduce((s, c) => s + c.tango, 0) < 0 ? "text-destructive" : "text-emerald-700"}`}>
                {centavosAString(categorySummary.reduce((s, c) => s + c.tango, 0))}
              </TableCell>
              <TableCell className={`text-right tabular-nums text-sm font-semibold ${categorySummary.reduce((s, c) => s + c.diff, 0) === 0 ? "text-emerald-700" : "text-amber-700"}`}>
                {centavosAString(categorySummary.reduce((s, c) => s + c.diff, 0))}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {/* Detalle por concepto */}
      {conceptosSummary.length > 0 && (
        <>
          <Separator />
          <div>
            <h3 className="text-sm font-semibold mb-1">Detalle por concepto</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Banco y Tango agrupados por concepto normalizado dentro de cada categoría.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Concepto</TableHead>
                  <TableHead className="text-right">Total Banco</TableHead>
                  <TableHead className="text-right">Total Tango</TableHead>
                  <TableHead className="text-right">Diferencia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  const rows: ReactNode[] = []
                  let currentCat = ""
                  let subtotalBanco = 0
                  let subtotalTango = 0

                  const flushSubtotal = (cat: string) => {
                    const diff = subtotalBanco + subtotalTango
                    rows.push(
                      <TableRow key={`sub-${cat}`} className="bg-slate-50 border-t">
                        <TableCell className="text-xs font-semibold text-muted-foreground pl-4">
                          Subtotal {CATEGORIA_LABELS[cat] ?? cat}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums text-xs font-semibold ${subtotalBanco < 0 ? "text-destructive" : "text-emerald-700"}`}>
                          {centavosAString(subtotalBanco)}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums text-xs font-semibold ${subtotalTango < 0 ? "text-destructive" : "text-emerald-700"}`}>
                          {centavosAString(subtotalTango)}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums text-xs font-semibold ${diff === 0 ? "text-emerald-700" : "text-amber-700"}`}>
                          {centavosAString(diff)}
                        </TableCell>
                      </TableRow>
                    )
                    subtotalBanco = 0
                    subtotalTango = 0
                  }

                  for (const { cat, concepto, banco, tango } of conceptosSummary) {
                    if (cat !== currentCat) {
                      if (currentCat !== "") flushSubtotal(currentCat)
                      currentCat = cat
                      rows.push(
                        <TableRow key={`cat-${cat}`} className="bg-slate-100">
                          <TableCell colSpan={4} className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-1.5">
                            {CATEGORIA_LABELS[cat] ?? cat}
                          </TableCell>
                        </TableRow>
                      )
                    }
                    subtotalBanco += banco
                    subtotalTango += tango
                    const diff = banco + tango
                    rows.push(
                      <TableRow key={`${cat}||${concepto}`}>
                        <TableCell className="text-sm pl-6">{concepto}</TableCell>
                        <TableCell className={`text-right tabular-nums text-sm ${banco < 0 ? "text-destructive" : banco > 0 ? "text-emerald-700" : "text-muted-foreground"}`}>
                          {banco !== 0 ? centavosAString(banco) : "—"}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums text-sm ${tango < 0 ? "text-destructive" : tango > 0 ? "text-emerald-700" : "text-muted-foreground"}`}>
                          {tango !== 0 ? centavosAString(tango) : "—"}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums text-sm font-medium ${diff === 0 ? "text-emerald-700" : "text-amber-700"}`}>
                          {centavosAString(diff)}
                        </TableCell>
                      </TableRow>
                    )
                  }
                  if (currentCat !== "") flushSubtotal(currentCat)
                  return rows
                })()}
              </TableBody>
            </Table>
          </div>

          {/* Totales de impuestos y percepciones */}
          {(() => {
            const TAX_CATS = new Set(["impuesto", "percepcion"])
            const taxRows = conceptosSummary.filter(c => TAX_CATS.has(c.cat))
            if (taxRows.length === 0) return null
            const totalBanco = taxRows.reduce((s, c) => s + c.banco, 0)
            const totalTango = taxRows.reduce((s, c) => s + c.tango, 0)
            const totalDiff = totalBanco + totalTango
            return (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
                <h4 className="text-sm font-semibold mb-3">Resumen de impuestos y percepciones</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Concepto</TableHead>
                      <TableHead className="text-right">Banco</TableHead>
                      <TableHead className="text-right">Tango</TableHead>
                      <TableHead className="text-right">Diferencia</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {taxRows.map(({ cat, concepto, banco, tango }) => {
                      const diff = banco + tango
                      return (
                        <TableRow key={`tax-${cat}||${concepto}`}>
                          <TableCell className="text-sm">
                            <span className="text-xs text-muted-foreground mr-2">{CATEGORIA_LABELS[cat] ?? cat}</span>
                            {concepto}
                          </TableCell>
                          <TableCell className={`text-right tabular-nums text-sm ${banco < 0 ? "text-destructive" : banco > 0 ? "text-emerald-700" : "text-muted-foreground"}`}>
                            {banco !== 0 ? centavosAString(banco) : "—"}
                          </TableCell>
                          <TableCell className={`text-right tabular-nums text-sm ${tango < 0 ? "text-destructive" : tango > 0 ? "text-emerald-700" : "text-muted-foreground"}`}>
                            {tango !== 0 ? centavosAString(tango) : "—"}
                          </TableCell>
                          <TableCell className={`text-right tabular-nums text-sm font-medium ${diff === 0 ? "text-emerald-700" : "text-amber-700"}`}>
                            {centavosAString(diff)}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                    <TableRow className="border-t-2 bg-amber-100/60">
                      <TableCell className="font-semibold text-sm">Total impuestos + percepciones</TableCell>
                      <TableCell className={`text-right tabular-nums text-sm font-semibold ${totalBanco < 0 ? "text-destructive" : "text-emerald-700"}`}>
                        {centavosAString(totalBanco)}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums text-sm font-semibold ${totalTango < 0 ? "text-destructive" : "text-emerald-700"}`}>
                        {centavosAString(totalTango)}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums text-sm font-semibold ${totalDiff === 0 ? "text-emerald-700" : "text-amber-700"}`}>
                        {centavosAString(totalDiff)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}
