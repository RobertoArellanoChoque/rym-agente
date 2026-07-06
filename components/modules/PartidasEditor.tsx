"use client"

import { useState } from "react"
import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { centavosAString } from "@/lib/conciliacion/matching"
import type { Partida } from "@/lib/partidas/manager"

interface PartidasEditorProps {
  bankId: string
  partidas: Partida[]
  onChange: (partidas: Partida[]) => void
}

export function PartidasEditor({ bankId, partidas, onChange }: PartidasEditorProps) {
  const [editDesc, setEditDesc] = useState("")
  const [editMonto, setEditMonto] = useState("")

  function handleAdd() {
    if (!editDesc.trim() || !editMonto) return
    const monto = Math.round(parseFloat(editMonto) * 100)
    if (isNaN(monto)) return
    const nueva: Partida = {
      id: Math.random().toString(36).substring(2),
      descripcion: editDesc,
      monto,
      fecha: new Date().toISOString().slice(0, 10),
    }
    onChange([...partidas, nueva])
    setEditDesc("")
    setEditMonto("")
  }

  function handleDelete(id: string) {
    onChange(partidas.filter((p) => p.id !== id))
  }

  const suma = partidas.reduce((s, p) => s + p.monto, 0)

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <h3 className="text-sm font-semibold">Partidas pendientes</h3>

      {partidas.length > 0 && (
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {partidas.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between text-xs px-2 py-1.5 bg-background rounded"
            >
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium">{p.descripcion}</p>
                <p className="text-muted-foreground text-[10px]">{p.fecha}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`font-semibold tabular-nums whitespace-nowrap ${
                    p.monto > 0 ? "text-emerald-700" : "text-destructive"
                  }`}
                >
                  {p.monto > 0 ? "+" : ""}
                  {centavosAString(p.monto)}
                </span>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {suma !== 0 && (
        <div className="text-xs bg-background rounded px-2 py-1 flex justify-between">
          <span>Total partidas:</span>
          <span className="font-semibold tabular-nums">
            {suma > 0 ? "+" : ""}
            {centavosAString(suma)}
          </span>
        </div>
      )}

      <div className="space-y-2">
        <input
          type="text"
          placeholder="Descripción"
          value={editDesc}
          onChange={(e) => setEditDesc(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          className="w-full text-xs px-2 py-1 border rounded bg-background placeholder:text-muted-foreground"
        />
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="Monto ($)"
            value={editMonto}
            onChange={(e) => setEditMonto(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            step="0.01"
            className="flex-1 text-xs px-2 py-1 border rounded bg-background placeholder:text-muted-foreground"
          />
          <Button
            onClick={handleAdd}
            disabled={!editDesc.trim() || !editMonto}
            size="sm"
            className="shrink-0"
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  )
}
