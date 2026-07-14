"use client"

import { Badge } from "@/components/ui/badge"
import type { BankDetectionResult, Movimiento, Categoria } from "@/lib/types"
import { centavosAString } from "@/lib/conciliacion/matching"
import { acumularPorBucket } from "@/lib/extractos/impuestos"
import { cn } from "@/lib/utils"

const CATEGORIA_LABEL: Record<Categoria, string> = {
  impuesto: "Impuesto",
  percepcion: "Percepción",
  transferencia: "Transf.",
  cheque: "Cheque",
  comision: "Comisión",
  prestamo: "Préstamo",
  prestamo_iva: "IVA préstamo",
  otro: "Otro",
}

const CATEGORIA_CLASS: Record<Categoria, string> = {
  impuesto: "bg-rose-100 text-rose-700 border-rose-200",
  percepcion: "bg-orange-100 text-orange-700 border-orange-200",
  transferencia: "bg-blue-100 text-blue-700 border-blue-200",
  cheque: "bg-purple-100 text-purple-700 border-purple-200",
  comision: "bg-slate-100 text-slate-600 border-slate-200",
  prestamo: "bg-emerald-100 text-emerald-700 border-emerald-200",
  prestamo_iva: "bg-teal-100 text-teal-700 border-teal-200",
  otro: "bg-gray-100 text-gray-500 border-gray-200",
}

interface MovimientosPreviewProps {
  bank: BankDetectionResult
  movimientos: Movimiento[]
  saldoAnterior?: number
  saldoFinal?: number
}

export function MovimientosPreview({ bank, movimientos, saldoAnterior, saldoFinal }: MovimientosPreviewProps) {
  const sumaMovimientos = movimientos.reduce((s, m) => s + m.monto, 0)
  const saldoFinalCalculado = saldoAnterior !== undefined
    ? saldoAnterior + sumaMovimientos
    : undefined
  const acumulados = acumularPorBucket(movimientos)
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <span className="text-sm text-muted-foreground">Banco detectado: </span>
          <Badge variant={bank.confidence === "high" ? "default" : "secondary"}>
            {bank.bankName}
          </Badge>
          {bank.confidence === "low" && (
            <span className="ml-2 text-xs text-amber-600">
              (confianza baja — verificá que sea el banco correcto)
            </span>
          )}
        </div>
        <span className="text-sm text-muted-foreground ml-auto">
          <span className="font-semibold text-foreground">{movimientos.length}</span> movimientos extraídos
        </span>
      </div>

      {(saldoAnterior !== undefined || saldoFinal !== undefined || saldoFinalCalculado !== undefined) && (
        <div className="grid grid-cols-3 gap-3">
          {saldoAnterior !== undefined && (
            <div className="rounded-md border bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground">Saldo anterior</p>
              <p className="text-sm font-semibold tabular-nums">{centavosAString(saldoAnterior)}</p>
            </div>
          )}
          <div className="rounded-md border bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground">Movimientos del período</p>
            <p className={`text-sm font-semibold tabular-nums ${sumaMovimientos >= 0 ? "text-emerald-700" : "text-destructive"}`}>
              {centavosAString(sumaMovimientos)}
            </p>
          </div>
          {(saldoFinal !== undefined || saldoFinalCalculado !== undefined) && (
            <div className="rounded-md border bg-primary/5 border-primary/20 px-3 py-2">
              <p className="text-xs text-muted-foreground">
                Saldo final{saldoFinal !== undefined ? "" : " (calculado)"}
              </p>
              <p className="text-sm font-semibold tabular-nums">
                {centavosAString(saldoFinal ?? saldoFinalCalculado!)}
              </p>
            </div>
          )}
        </div>
      )}

      {acumulados.length > 0 && (
        <div className="rounded-lg border bg-card">
          <div className="px-4 py-2.5 border-b">
            <h3 className="text-sm font-semibold">Impuestos acumulados</h3>
            <p className="text-[11px] text-muted-foreground">Total por tipo, según lo detectado en el extracto (fuente de verdad)</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Tipo</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Ítems</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              {acumulados.map((a) => (
                <tr key={a.bucket} className="border-t">
                  <td className="px-4 py-2">{a.bucket}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{a.n}</td>
                  <td className={`px-4 py-2 text-right tabular-nums font-medium ${a.total >= 0 ? "text-emerald-700" : "text-destructive"}`}>
                    {centavosAString(a.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Fecha</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Descripción</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Categoría</th>
              <th className="text-right px-4 py-2 font-medium text-muted-foreground">Monto</th>
            </tr>
          </thead>
          <tbody>
            {movimientos.map((m) => (
              <tr key={m.id} className="border-t">
                <td className="px-4 py-2 tabular-nums text-muted-foreground">{m.fecha}</td>
                <td className="px-4 py-2 truncate max-w-xs">{m.descripcion}</td>
                <td className="px-4 py-2">
                  {m.categoria && (
                    <Badge
                      variant="outline"
                      className={cn("text-xs font-normal", CATEGORIA_CLASS[m.categoria])}
                    >
                      {CATEGORIA_LABEL[m.categoria]}
                    </Badge>
                  )}
                </td>
                <td
                  className={`px-4 py-2 text-right tabular-nums font-medium ${
                    m.monto >= 0 ? "text-emerald-700" : "text-destructive"
                  }`}
                >
                  {centavosAString(m.monto)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
