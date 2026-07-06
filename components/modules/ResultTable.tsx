"use client"

import { useState, useMemo } from "react"
import { CheckCircle2, XCircle, AlertCircle, Lightbulb, HelpCircle, Download } from "lucide-react"
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
import { explicarGap } from "@/lib/conciliacion/explicar-gap"
import { bucketConcepto } from "@/lib/extractos/impuestos"

interface ResultTableProps {
  resultado: ResultadoConciliacion
  sessionId?: string
}

export function ResultTable({ resultado, sessionId }: ResultTableProps) {
  const { discrepancias, movimientos, asientos, saldoBanco, saldoMayor, diferencia, candidatosAConciliarIds, sumaPartidas } =
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

  // ── Conciliación de impuestos: Banco (fuente de verdad) vs Mayor ──────────
  // Agrupa banco y mayor por el MISMO bucket de impuesto → comparación precisa.
  const impuestosSummary = useMemo(() => {
    const map = new Map<string, { bucket: string; banco: number; mayor: number }>()
    for (const m of movimientos) {
      const b = bucketConcepto(m.descripcion, m.monto, m.categoria)
      const p = map.get(b) ?? { bucket: b, banco: 0, mayor: 0 }
      p.banco += m.monto
      map.set(b, p)
    }
    for (const a of asientos) {
      const b = bucketConcepto(a.descripcion, a.monto)
      const p = map.get(b) ?? { bucket: b, banco: 0, mayor: 0 }
      p.mayor += a.monto
      map.set(b, p)
    }
    // Magnitudes: banco y mayor registran el mismo impuesto con signos opuestos;
    // comparamos importes absolutos. diff > 0 → falta en el mayor.
    return [...map.values()]
      .map(r => {
        const banco = Math.abs(r.banco)
        const mayor = Math.abs(r.mayor)
        return { bucket: r.bucket, banco, mayor, diff: banco - mayor }
      })
      .filter(r => r.banco !== 0 || r.mayor !== 0)
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || b.banco - a.banco)
  }, [movimientos, asientos])

  // Gap a explicar: banco (fuente de verdad) − mayor. Los ítems sin conciliar
  // lo explican POR MONTO; el bucket solo agrupa para presentar.
  const gapBruto = saldoBanco - saldoMayor
  const explicacion = useMemo(
    () => explicarGap(discrepancias, gapBruto, sumaPartidas ?? 0),
    [discrepancias, gapBruto, sumaPartidas]
  )
  const totalVerificacion = saldoMayor + explicacion.totalExplicado + (sumaPartidas ?? 0)

  function downloadCsv() {
    const esc = (v: string | number) => {
      const s = String(v)
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const rows: string[] = []
    rows.push("Conciliación de impuestos — Banco (fuente de verdad) vs Mayor")
    rows.push("")
    rows.push(["Impuesto", "Banco", "Mayor", "Diferencia"].join(","))
    for (const r of impuestosSummary) {
      rows.push([r.bucket, centavosAString(r.banco), centavosAString(r.mayor), centavosAString(r.diff)].map(esc).join(","))
    }
    rows.push("")
    rows.push("Explicación de la diferencia (por montos)")
    rows.push(["Grupo/Ítem", "Lado", "Ítems", "Fecha", "Total", "Acción"].join(","))
    for (const g of explicacion.grupos) {
      rows.push([g.bucket, g.lado, g.items.length, "", centavosAString(g.total),
        g.lado === "banco" ? "subir al mayor de una vez" : "verificar en banco"].map(esc).join(","))
      for (const d of g.items) {
        rows.push([`  ${d.descripcion}`, "", "", d.fecha, centavosAString(d.monto), ""].map(esc).join(","))
      }
    }
    for (const d of explicacion.cuentasAConciliar) {
      rows.push([d.descripcion, d.tipo === "en_extracto_no_en_mayor" ? "banco" : "mayor", 1,
        d.fecha, centavosAString(d.monto), "cuenta a conciliar"].map(esc).join(","))
    }
    rows.push("")
    rows.push("Verificación (banco = fuente de verdad)")
    rows.push(["Concepto", "Monto"].join(","))
    rows.push(["Mayor Tango", centavosAString(saldoMayor)].map(esc).join(","))
    rows.push(["+ Por conciliar + cuentas a conciliar", centavosAString(explicacion.totalExplicado)].map(esc).join(","))
    if ((sumaPartidas ?? 0) !== 0) {
      rows.push(["+ Partidas manuales", centavosAString(sumaPartidas ?? 0)].map(esc).join(","))
    }
    rows.push(["= Total", centavosAString(totalVerificacion)].map(esc).join(","))
    rows.push(["Banco (extracto)", centavosAString(saldoBanco)].map(esc).join(","))
    rows.push([explicacion.cuadra ? "CUADRA" : "Residual sin explicar", centavosAString(explicacion.residual)].map(esc).join(","))

    const blob = new Blob(["﻿" + rows.join("\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `conciliacion-${sessionId ?? "impuestos"}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

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
      {/* Encabezado + export */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold">Conciliación de impuestos</h2>
          <p className="text-xs text-muted-foreground">El extracto bancario es la fuente de verdad. El mayor debe igualarlo.</p>
        </div>
        <Button size="sm" variant="outline" onClick={downloadCsv}>
          <Download className="h-4 w-4 mr-2" />
          Descargar CSV
        </Button>
      </div>

      {/* Banner: gap a explicar (banco = fuente de verdad) */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Banco (extracto)</p>
          <p className="text-2xl font-bold mt-1 tabular-nums">{centavosAString(saldoBanco)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Mayor (Tango)</p>
          <p className="text-2xl font-bold mt-1 tabular-nums">{centavosAString(saldoMayor)}</p>
        </div>
        <div className="rounded-lg border bg-slate-50 border-slate-200 p-4">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Diferencia a explicar</p>
          <p className="text-2xl font-bold mt-1 tabular-nums">{centavosAString(gapBruto)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">se explica abajo, por montos</p>
        </div>
      </div>

      {/* Impuestos: Banco vs Mayor (tabla principal) */}
      <div className="rounded-lg border bg-card">
        <div className="px-5 py-3 border-b">
          <h3 className="text-sm font-semibold">Impuestos: Banco vs Mayor</h3>
          <p className="text-[11px] text-muted-foreground">Total acumulado por tipo. Diferencia &gt; 0 = falta registrar en el mayor.</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Impuesto</TableHead>
              <TableHead className="text-right">Banco</TableHead>
              <TableHead className="text-right">Mayor</TableHead>
              <TableHead className="text-right">Diferencia</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {impuestosSummary.map((r) => (
              <TableRow key={r.bucket}>
                <TableCell className="font-medium text-sm">{r.bucket}</TableCell>
                <TableCell className="text-right tabular-nums text-sm">{centavosAString(r.banco)}</TableCell>
                <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{centavosAString(r.mayor)}</TableCell>
                <TableCell className={`text-right tabular-nums text-sm font-semibold ${r.diff === 0 ? "text-emerald-700" : "text-amber-700"}`}>
                  {r.diff === 0 ? "OK" : `${centavosAString(r.diff)}${r.diff > 0 ? " · falta en mayor" : " · de más en mayor"}`}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="border-t-2 bg-slate-50">
              <TableCell className="font-semibold text-sm">Total</TableCell>
              <TableCell className="text-right tabular-nums text-sm font-semibold">{centavosAString(impuestosSummary.reduce((s, r) => s + r.banco, 0))}</TableCell>
              <TableCell className="text-right tabular-nums text-sm font-semibold">{centavosAString(impuestosSummary.reduce((s, r) => s + r.mayor, 0))}</TableCell>
              <TableCell className={`text-right tabular-nums text-sm font-semibold ${impuestosSummary.reduce((s, r) => s + r.diff, 0) === 0 ? "text-emerald-700" : "text-amber-700"}`}>
                {centavosAString(impuestosSummary.reduce((s, r) => s + r.diff, 0))}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {/* Qué explica la diferencia (por montos, agrupado para presentar) */}
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-1">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          Qué explica la diferencia (por montos)
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Ítems sin conciliar agrupados por tipo. Los grupos se suben al mayor de una vez; los ítems sueltos van como cuenta a conciliar.
        </p>
        {explicacion.grupos.length === 0 && explicacion.cuentasAConciliar.length === 0 ? (
          <p className="text-sm text-emerald-600 font-medium">Nada pendiente: banco y mayor coinciden.</p>
        ) : (
          <div className="space-y-2">
            {explicacion.grupos.map((g) => (
              <details key={`${g.lado}||${g.bucket}`} className="rounded-lg border bg-card">
                <summary className="flex items-center gap-3 px-4 py-2.5 cursor-pointer text-sm">
                  <span className="font-medium">{g.bucket}</span>
                  <Badge variant="outline" className="text-xs font-normal">
                    {g.items.length} ítems
                  </Badge>
                  <Badge variant="outline" className={`text-xs font-normal ${g.lado === "banco" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>
                    {g.lado === "banco" ? "subir al mayor de una vez" : "en mayor, sin respaldo en banco"}
                  </Badge>
                  <span className="ml-auto tabular-nums font-semibold">{centavosAString(g.total)}</span>
                </summary>
                <div className="border-t">
                  <Table>
                    <TableBody>
                      {g.items.map((d, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm tabular-nums w-28">{d.fecha}</TableCell>
                          <TableCell className="text-sm">{d.descripcion}</TableCell>
                          <TableCell className="text-sm text-right tabular-nums">{centavosAString(d.monto)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </details>
            ))}

            {explicacion.cuentasAConciliar.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/40">
                <div className="px-4 py-2.5 border-b border-amber-200">
                  <span className="text-sm font-semibold">Cuentas a conciliar (ítems individuales)</span>
                  <p className="text-[11px] text-muted-foreground">Difieren del resto: no forman grupo, se concilian por separado.</p>
                </div>
                <Table>
                  <TableBody>
                    {explicacion.cuentasAConciliar.map((d, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm tabular-nums w-28">{d.fecha}</TableCell>
                        <TableCell className="text-sm">{d.descripcion}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {d.tipo === "en_extracto_no_en_mayor" ? "en banco, falta en mayor" : "en mayor, sin respaldo en banco"}
                        </TableCell>
                        <TableCell className="text-sm text-right tabular-nums font-medium">{centavosAString(d.monto)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cierre de verificación: banco = fuente de verdad */}
      <div className={`rounded-lg border p-5 space-y-2 ${explicacion.cuadra ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
        <h3 className="text-sm font-semibold">Verificación</h3>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span>Mayor Tango:</span>
            <span className="tabular-nums">{centavosAString(saldoMayor)}</span>
          </div>
          <div className="flex justify-between">
            <span>+ Por conciliar + cuentas a conciliar:</span>
            <span className="tabular-nums">{centavosAString(explicacion.totalExplicado)}</span>
          </div>
          {(sumaPartidas ?? 0) !== 0 && (
            <div className="flex justify-between">
              <span>+ Partidas manuales:</span>
              <span className="tabular-nums">{centavosAString(sumaPartidas ?? 0)}</span>
            </div>
          )}
          <div className="border-t border-current/10 pt-1.5 flex justify-between font-medium">
            <span>= Total:</span>
            <span className="tabular-nums">{centavosAString(totalVerificacion)}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span>Banco (extracto):</span>
            <span className="tabular-nums">{centavosAString(saldoBanco)}</span>
          </div>
          <div className={`flex justify-between font-bold ${explicacion.cuadra ? "text-emerald-700" : "text-amber-700"}`}>
            <span>{explicacion.cuadra ? "✓ CUADRA" : "Residual sin explicar:"}</span>
            <span className="tabular-nums">{explicacion.cuadra ? "" : centavosAString(explicacion.residual)}</span>
          </div>
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

    </div>
  )
}
