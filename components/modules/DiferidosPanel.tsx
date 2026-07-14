"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { centavosAString } from "@/lib/conciliacion/matching"
import type { Movimiento } from "@/lib/types"

type Diferido = {
  id: string
  fecha: string
  descripcion: string
  monto: number
}

interface DiferidosPanelProps {
  bankId: string
  periodo: string
  movimientos: Movimiento[]
}

// Movimientos sin match diferidos desde el período anterior (ver /api/conciliacion/diferir):
// se resuelven acá vinculándolos a un movimiento de este extracto, o descartándolos.
export function DiferidosPanel({ bankId, periodo, movimientos }: DiferidosPanelProps) {
  const [diferidos, setDiferidos] = useState<Diferido[]>([])
  const [saving, setSaving] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    fetch(`/api/conciliacion/diferidos?bankId=${encodeURIComponent(bankId)}&periodo=${encodeURIComponent(periodo)}`)
      .then(r => (r.ok ? r.json() : []))
      .then(d => { if (!cancelled) setDiferidos(Array.isArray(d) ? d : []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [bankId, periodo])

  const patch = async (diferidoId: string, body: Record<string, unknown>) => {
    setSaving(prev => new Set([...prev, diferidoId]))
    try {
      const res = await fetch("/api/conciliacion/diferidos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diferidoId, ...body }),
      })
      if (res.ok) {
        setDiferidos(prev => prev.filter(d => d.id !== diferidoId))
        toast.success("Diferido actualizado")
      } else {
        toast.error("Error al actualizar")
      }
    } catch {
      toast.error("Error al actualizar")
    } finally {
      setSaving(prev => {
        const next = new Set(prev)
        next.delete(diferidoId)
        return next
      })
    }
  }

  if (diferidos.length === 0) return null

  return (
    <div className="rounded-lg border bg-card">
      <div className="px-5 py-3 border-b">
        <h3 className="text-sm font-semibold">Movimientos diferidos del mes anterior</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Vinculalos a un movimiento de este extracto o descartalos.</p>
      </div>
      <div className="divide-y">
        {diferidos.map(d => {
          const isSaving = saving.has(d.id)
          return (
            <div key={d.id} className="px-5 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground">{d.fecha}</div>
                <div className="truncate text-sm" title={d.descripcion}>{d.descripcion}</div>
              </div>
              <div className="tabular-nums text-sm font-medium shrink-0">{centavosAString(d.monto)}</div>
              <Select
                disabled={isSaving}
                onValueChange={val => patch(d.id, { estado: "conciliado", conciliadoEnMovimientoId: val })}
              >
                <SelectTrigger className="w-56 h-9 text-xs shrink-0" title="Vincular a un movimiento de este extracto bancario (no a un asiento Tango)">
                  <SelectValue placeholder="Vincular a movimiento de este extracto..." />
                </SelectTrigger>
                <SelectContent>
                  {movimientos.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.fecha} · {m.descripcion.slice(0, 30)} · {centavosAString(m.monto)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={isSaving}
                onClick={() => patch(d.id, { estado: "descartado" })}
              >
                Descartar
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
