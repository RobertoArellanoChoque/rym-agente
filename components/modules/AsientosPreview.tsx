"use client"

import type { Asiento } from "@/lib/types"
import { centavosAString } from "@/lib/conciliacion/matching"

interface AsientosPreviewProps {
  asientos: Asiento[]
}

export function AsientosPreview({ asientos }: AsientosPreviewProps) {
  const hasDebe = asientos.some((a) => a.debe !== undefined)
  const ultimoSaldo = [...asientos].reverse().find((a) => a.saldo !== undefined)?.saldo

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Mayor de Tango</p>
        <span className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{asientos.length}</span> asientos extraídos
        </span>
      </div>

      {ultimoSaldo !== undefined && (
        <div className="rounded-md border bg-primary/5 border-primary/20 px-3 py-2 inline-block">
          <p className="text-xs text-muted-foreground">Último saldo</p>
          <p className="text-sm font-semibold tabular-nums">{centavosAString(ultimoSaldo)}</p>
        </div>
      )}

      <div className="border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Fecha</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Leyenda</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Cuenta</th>
              {hasDebe ? (
                <>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Debe</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Haber</th>
                </>
              ) : (
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Monto</th>
              )}
              {ultimoSaldo !== undefined && (
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Saldo</th>
              )}
            </tr>
          </thead>
          <tbody>
            {asientos.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="px-4 py-2 tabular-nums text-muted-foreground whitespace-nowrap">{a.fecha}</td>
                <td className="px-4 py-2 truncate max-w-[200px]">{a.descripcion}</td>
                <td className="px-4 py-2 text-muted-foreground truncate max-w-[100px]">{a.cuenta}</td>
                {hasDebe ? (
                  <>
                    <td className="px-4 py-2 text-right tabular-nums text-emerald-700 font-medium whitespace-nowrap">
                      {a.debe ? centavosAString(a.debe) : ""}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-destructive font-medium whitespace-nowrap">
                      {a.haber ? centavosAString(a.haber) : ""}
                    </td>
                  </>
                ) : (
                  <td className={`px-4 py-2 text-right tabular-nums font-medium whitespace-nowrap ${a.monto >= 0 ? "text-emerald-700" : "text-destructive"}`}>
                    {centavosAString(a.monto)}
                  </td>
                )}
                {ultimoSaldo !== undefined && (
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                    {a.saldo !== undefined ? centavosAString(a.saldo) : ""}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
