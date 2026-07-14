"use client"

import { useState, useMemo, useCallback } from "react"
import { CheckCircle2, XCircle, AlertCircle, Download, Loader2, ArrowRightCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import type { ResultadoConciliacion } from "@/lib/types"
import { toast } from "sonner"
import { centavosAString } from "@/lib/conciliacion/matching"
import { explicarGap } from "@/lib/conciliacion/explicar-gap"
import { agruparPorCategoria } from "@/lib/conciliacion/agrupar-categorias"
import { agruparPrestamos } from "@/lib/conciliacion/prestamos"
import { CATEGORIAS_DESTINO } from "@/lib/extractos/impuestos"

interface ResultTableProps {
  resultado: ResultadoConciliacion
  sessionId?: string
}

export function ResultTable({ resultado, sessionId }: ResultTableProps) {
  const { discrepancias, movimientos, asientos, saldoBanco, saldoMayor, matches, sumaPartidas } = resultado
  const [overrides, setOverrides] = useState<Record<number, { bucketOverride?: string; revisar?: boolean }>>({})
  const [saving, setSaving] = useState<Set<number>>(new Set())
  const [justMoved, setJustMoved] = useState<number | null>(null)
  const [diferidas, setDiferidas] = useState<Set<number>>(new Set())
  const [matchOverrides, setMatchOverrides] = useState<Record<number, "confirmed" | "rejected">>({})
  const [matchSaving, setMatchSaving] = useState<Set<number>>(new Set())

  // Discrepancias diferidas al próximo mes (optimistic): se sacan de toda la vista
  // (grupos, totales, detalle técnico) hasta el próximo reload/comparar().
  const discrepanciasVisibles = useMemo(
    () => discrepancias.filter(d => !(d.id !== undefined && diferidas.has(d.id))),
    [discrepancias, diferidas]
  )

  const gapBruto = saldoBanco - saldoMayor
  const explic = useMemo(
    () => explicarGap(discrepanciasVisibles, gapBruto, sumaPartidas ?? 0),
    [discrepanciasVisibles, gapBruto, sumaPartidas]
  )

  // Aplicar overrides al estado local antes de agrupar
  const discrepanciasConOverrides = useMemo(
    () =>
      discrepanciasVisibles.map(d => {
        const override = d.id ? overrides[d.id] : undefined
        if (!override) return d
        return {
          ...d,
          bucketOverride: override.bucketOverride ?? d.bucketOverride,
          revisar: override.revisar !== undefined ? override.revisar : d.revisar,
        }
      }),
    [discrepanciasVisibles, overrides]
  )

  const secciones = useMemo(() => agruparPorCategoria(discrepanciasConOverrides), [discrepanciasConOverrides])

  // Lookup O(1) por id: evita find() por fila en el render (cuadrático con miles de movs).
  const movById = useMemo(() => new Map(movimientos.map(m => [m.id, m])), [movimientos])

  // Confirmar/rechazar matches probables (optimistic): aplica el override local
  // antes de derivar confirmed/probable/prestamos, sin esperar un reload.
  const matchesConOverrides = useMemo(
    () => matches.map(m => (m.id !== undefined && matchOverrides[m.id] ? { ...m, tipo: matchOverrides[m.id] } : m)),
    [matches, matchOverrides]
  )
  const confirmed = useMemo(() => matchesConOverrides.filter(m => m.tipo === "confirmed"), [matchesConOverrides])
  const probable = useMemo(() => matchesConOverrides.filter(m => m.tipo === "probable"), [matchesConOverrides])

  const prestamos = useMemo(
    () => agruparPrestamos(movimientos, matchesConOverrides, asientos),
    [movimientos, matchesConOverrides, asientos]
  )

  const handlePatch = useCallback(
    async (discrepanciaId: number, bucketOverride?: string | null, revisar?: boolean) => {
      if (!sessionId || !discrepanciaId) return
      setSaving(prev => new Set([...prev, discrepanciaId]))
      try {
        const res = await fetch("/api/conciliacion/discrepancia", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ discrepanciaId, bucketOverride, revisar }),
        })
        if (res.ok) {
          setOverrides(prev => {
            const newOverride: { bucketOverride?: string; revisar?: boolean } = { ...(prev[discrepanciaId] ?? {}) }
            if (bucketOverride !== undefined) newOverride.bucketOverride = bucketOverride ?? undefined
            if (revisar !== undefined) newOverride.revisar = revisar
            return { ...prev, [discrepanciaId]: newOverride }
          })
          if (bucketOverride) {
            toast.success(`Movido a ${bucketOverride}`)
            setJustMoved(discrepanciaId)
            setTimeout(() => setJustMoved(prev => (prev === discrepanciaId ? null : prev)), 1500)
          } else {
            toast.success("Cambio guardado")
          }
        } else {
          toast.error("Error al guardar")
        }
      } catch (err) {
        console.error("[ResultTable] PATCH error:", err)
        toast.error("Error al guardar")
      } finally {
        setSaving(prev => {
          const next = new Set(prev)
          next.delete(discrepanciaId)
          return next
        })
      }
    },
    [sessionId]
  )

  const handleDiferir = useCallback(
    async (discrepanciaId: number) => {
      if (!discrepanciaId) return
      setSaving(prev => new Set([...prev, discrepanciaId]))
      try {
        const res = await fetch("/api/conciliacion/diferir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ discrepanciaId }),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok) {
          setDiferidas(prev => new Set([...prev, discrepanciaId]))
          toast.success(`Movido a ${data.periodoDestino ?? "próximo mes"}`)
        } else {
          toast.error(data.error ?? "Error al mover")
        }
      } catch (err) {
        console.error("[ResultTable] diferir error:", err)
        toast.error("Error al mover")
      } finally {
        setSaving(prev => {
          const next = new Set(prev)
          next.delete(discrepanciaId)
          return next
        })
      }
    },
    []
  )

  const handleMatchAction = useCallback(
    async (matchId: number | undefined, action: "confirm" | "reject") => {
      if (!matchId) return
      setMatchSaving(prev => new Set([...prev, matchId]))
      try {
        const res = await fetch("/api/conciliacion/match", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchId, action }),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok) {
          setMatchOverrides(prev => ({ ...prev, [matchId]: data.tipo }))
          toast.success(action === "confirm" ? "Match confirmado" : "Match rechazado")
        } else {
          toast.error(data.error ?? "Error al guardar")
        }
      } catch (err) {
        console.error("[ResultTable] match action error:", err)
        toast.error("Error al guardar")
      } finally {
        setMatchSaving(prev => {
          const next = new Set(prev)
          next.delete(matchId)
          return next
        })
      }
    },
    []
  )

  const contabilizar = async () => {
    if (!sessionId) return
    setSaving(prev => new Set([...prev, -2]))
    try {
      const res = await fetch("/api/conciliacion/contabilizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      })
      const d = await res.json()
      if (res.ok) toast.success(`Contabilizado: ${d.asientosCreados} asiento(s), diferencia ${d.diferencia}`)
      else toast.error(d.error ?? "No se pudo contabilizar")
    } catch {
      toast.error("Error al contabilizar")
    } finally {
      setSaving(prev => { const n = new Set(prev); n.delete(-2); return n })
    }
  }

  const downloadExcel = () => {
    if (!sessionId) return
    setSaving(prev => new Set([...prev, -1]))
    toast.loading("Descargando...")
    try {
      window.open(`/api/conciliacion/export?sessionId=${sessionId}`, "_blank")
      toast.success("Excel descargado")
    } catch {
      toast.error("Error al descargar")
    } finally {
      setTimeout(() => {
        setSaving(prev => {
          const next = new Set(prev)
          next.delete(-1)
          return next
        })
      }, 1500)
    }
  }

  return (
    <div className="space-y-6">
      {/* Hero: Total a conciliar */}
      <div className={`rounded-lg border p-6 ${explic.cuadra ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Banco — neto período</p>
            <p className="text-2xl font-bold mt-1 tabular-nums">{centavosAString(saldoBanco)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Mayor — neto período</p>
            <p className="text-2xl font-bold mt-1 tabular-nums">{centavosAString(saldoMayor)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">TOTAL A CONCILIAR</p>
            <p className={`text-3xl font-bold mt-1 tabular-nums ${explic.cuadra ? "text-emerald-700" : "text-amber-700"}`}>
              {centavosAString(explic.totalExplicado)}
            </p>
            {explic.cuadra ? (
              <Badge className="mt-2 bg-emerald-100 text-emerald-800 border-emerald-200">✓ Cuadra</Badge>
            ) : (
              <Badge className="mt-2 bg-amber-100 text-amber-800 border-amber-200">Residual {centavosAString(explic.residual)}</Badge>
            )}
          </div>
        </div>
      </div>

      {/* Desglose por categoría */}
      {secciones.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Pendientes por categoría</h3>
          <div className="space-y-2">
            {secciones.map((sec, i) => (
              <details key={i} className="rounded-lg border bg-card open:ring-1 open:ring-slate-200">
                <summary className="flex items-center gap-3 px-4 py-2.5 cursor-pointer text-sm font-medium">
                  <span>{sec.categoria}</span>
                  <Badge variant="outline" className="text-xs">{sec.count} ítems</Badge>
                  <span className="ml-auto text-sm tabular-nums font-semibold">{centavosAString(sec.total)}</span>
                </summary>
                <div className="px-4 py-3 space-y-2 border-t">
                  {sec.items.map((d, j) => {
                    const isSaving = saving.has(d.id ?? 0)
                    const isRevisar = (overrides[d.id ?? 0]?.revisar ?? d.revisar) ?? false
                    return (
                      <div
                        key={j}
                        className={`flex items-center gap-3 p-2 rounded text-sm transition-all ${isRevisar ? "border border-amber-300 bg-amber-50" : ""} ${justMoved === d.id ? "ring-2 ring-primary/60 bg-primary/5" : ""}`}
                      >
                        <div className="p-2 -m-2 shrink-0">
                          <Checkbox
                            checked={isRevisar}
                            disabled={isSaving}
                            onCheckedChange={checked =>
                              handlePatch(d.id ?? 0, overrides[d.id ?? 0]?.bucketOverride ?? d.bucketOverride, !!checked)
                            }
                            aria-label={`Revisar: ${d.descripcion}`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-muted-foreground">{d.fecha}</div>
                          <div className="truncate" title={d.descripcion}>{d.descripcion}</div>
                        </div>
                        <div className="tabular-nums font-medium">{centavosAString(d.monto)}</div>
                        <Select
                          value={overrides[d.id ?? 0]?.bucketOverride ?? d.bucketOverride ?? ""}
                          disabled={isSaving}
                          onValueChange={val => handlePatch(d.id ?? 0, val || null, isRevisar)}
                        >
                          <SelectTrigger className="w-32 h-10 text-xs">
                            <SelectValue placeholder="Categoría" />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORIAS_DESTINO.map(cat => (
                              <SelectItem key={cat} value={cat}>
                                {cat}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {d.tipo === "en_extracto_no_en_mayor" && d.movimientoId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 shrink-0"
                            disabled={isSaving}
                            onClick={() => handleDiferir(d.id ?? 0)}
                            title="Mover a próximo mes"
                            aria-label={`Mover a próximo mes: ${d.descripcion}`}
                          >
                            {isSaving ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ArrowRightCircle className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}

      {/* Préstamos */}
      {prestamos.length > 0 && (
        <div className="rounded-lg border bg-card">
          <div className="px-5 py-3 border-b">
            <h3 className="text-sm font-semibold">Préstamos del extracto</h3>
          </div>
          <div className="divide-y">
            {prestamos.map((p, i) => (
              <div key={i} className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium tabular-nums">{p.fecha}</span>
                  <span className="text-sm">{p.amort?.descripcion ?? "Préstamo"}</span>
                  {p.asiento ? (
                    <Badge className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">En Tango ✓</Badge>
                  ) : (
                    <Badge className="text-xs bg-amber-50 text-amber-700 border-amber-200">Pendiente</Badge>
                  )}
                  <span className="ml-auto tabular-nums font-semibold text-sm">{centavosAString(p.total)}</span>
                </div>
                <div className="mt-1 pl-4 space-y-0.5 text-xs text-muted-foreground">
                  {p.amort && (
                    <div className="flex justify-between">
                      <span>Amortización</span>
                      <span className="tabular-nums">{centavosAString(p.amort.monto)}</span>
                    </div>
                  )}
                  {p.impuestos.map((imp, j) => (
                    <div key={j} className="flex justify-between">
                      <span>{imp.descripcion}</span>
                      <span className="tabular-nums">{centavosAString(imp.monto)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Separator />

      {/* Detalle técnico colapsado */}
      <details className="rounded-lg border">
        <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer text-sm font-medium">
          Ver detalle técnico
        </summary>
        <div className="px-4 py-4 space-y-6 border-t">
            {/* Conciliados */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Conciliados ({confirmed.length})
              </h4>
              {confirmed.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin coincidencias</p>
              ) : (
                <div className="text-xs space-y-1">
                  {confirmed.map((m, i) => (
                    <div key={i} className="flex justify-between p-2 bg-slate-50 rounded">
                      <span>{movById.get(m.movimientoId)?.descripcion}</span>
                      <span className="tabular-nums">{centavosAString(movById.get(m.movimientoId)?.monto ?? 0)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Probables */}
            {probable.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-blue-500" />
                  Sugerencias IA ({probable.length})
                </h4>
                <div className="text-xs space-y-1">
                  {probable.map((m, i) => {
                    const isMatchSaving = matchSaving.has(m.id ?? 0)
                    return (
                      <div key={m.id ?? i} className="flex items-center gap-2 p-2 bg-blue-50 rounded">
                        <span className="flex-1 min-w-0 truncate">{movById.get(m.movimientoId)?.descripcion}</span>
                        <span className="tabular-nums shrink-0">{m.score}</span>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          disabled={isMatchSaving || !m.id}
                          onClick={() => handleMatchAction(m.id, "confirm")}
                          title="Confirmar match"
                          aria-label={`Confirmar match: ${movById.get(m.movimientoId)?.descripcion}`}
                        >
                          {isMatchSaving ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          disabled={isMatchSaving || !m.id}
                          onClick={() => handleMatchAction(m.id, "reject")}
                          title="Rechazar match"
                          aria-label={`Rechazar match: ${movById.get(m.movimientoId)?.descripcion}`}
                        >
                          <XCircle className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Discrepancias */}
            {discrepanciasVisibles.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-destructive" />
                  Discrepancias ({discrepanciasVisibles.length})
                </h4>
                <div className="text-xs space-y-1">
                  {discrepanciasVisibles.map((d, i) => (
                    <div key={i} className="flex justify-between p-2 bg-destructive/5 rounded">
                      <span className="truncate">{d.descripcion}</span>
                      <span className="tabular-nums">{centavosAString(d.monto)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Verificación */}
            <div className="rounded border p-3 bg-slate-50">
              <h4 className="text-xs font-semibold mb-2">Verificación</h4>
              <div className="text-xs space-y-1 tabular-nums">
                <div className="flex justify-between">
                  <span>Mayor Tango:</span>
                  <span>{centavosAString(saldoMayor)}</span>
                </div>
                <div className="flex justify-between">
                  <span>+ Por conciliar:</span>
                  <span>{centavosAString(explic.totalExplicado)}</span>
                </div>
                {!!sumaPartidas && (
                  <div className="flex justify-between">
                    <span>+ Partidas manuales:</span>
                    <span>{centavosAString(sumaPartidas)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold border-t pt-1">
                  <span>= Total:</span>
                  <span>{centavosAString(saldoMayor + explic.totalExplicado + (sumaPartidas ?? 0))}</span>
                </div>
                <div className="flex justify-between">
                  <span>Banco:</span>
                  <span>{centavosAString(saldoBanco)}</span>
                </div>
                <div className={`flex justify-between font-bold ${explic.cuadra ? "text-emerald-700" : "text-amber-700"}`}>
                  <span>{explic.cuadra ? "✓ CUADRA" : "Residual:"}</span>
                  <span>{explic.cuadra ? "" : centavosAString(explic.residual)}</span>
                </div>
              </div>
            </div>
        </div>
      </details>

      <Separator />

      {/* Acciones */}
      <div className="flex gap-3">
        {secciones.length > 0 && sessionId && (
          <Button onClick={contabilizar} variant="default" size="sm" disabled={saving.has(-2)}>
            {saving.has(-2) ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Contabilizando...
              </>
            ) : (
              "Contabilizar pendientes y cerrar en 0"
            )}
          </Button>
        )}
        <Button onClick={downloadExcel} variant="outline" size="sm" disabled={saving.has(-1)}>
          {saving.has(-1) ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Descargando...
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              Descargar Excel
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
