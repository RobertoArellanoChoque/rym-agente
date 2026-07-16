"use client"

import { Badge } from "@/components/ui/badge"
import { MovimientosPreview } from "@/components/modules/MovimientosPreview"
import { AsientosPreview } from "@/components/modules/AsientosPreview"
import { centavosAString } from "@/lib/conciliacion/matching"
import type { BankDetectionResult, Movimiento, Asiento } from "@/lib/types"

interface ComparativaPreviewProps {
  bank: BankDetectionResult
  movimientos: Movimiento[]
  saldoAnterior?: number
  saldoFinal?: number
  asientos: Asiento[]
}

export function ComparativaPreview({ bank, movimientos, saldoAnterior, saldoFinal, asientos }: ComparativaPreviewProps) {
  const ultimoSaldoTango = [...asientos].reverse().find(a => a.saldo !== undefined)?.saldo

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-lg border bg-card px-4 py-3 space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant={bank.confidence === "high" ? "default" : "secondary"}>{bank.bankName}</Badge>
            <span className="text-xs text-muted-foreground">Extracto bancario</span>
          </div>
          <p className="text-sm">
            <span className="font-semibold tabular-nums">{movimientos.length}</span> movimientos
            {saldoFinal !== undefined && (
              <> · saldo final <span className="font-semibold tabular-nums">{centavosAString(saldoFinal)}</span></>
            )}
          </p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3 space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Tango</Badge>
            <span className="text-xs text-muted-foreground">Mayor de cuentas</span>
          </div>
          <p className="text-sm">
            <span className="font-semibold tabular-nums">{asientos.length}</span> asientos
            {ultimoSaldoTango !== undefined && (
              <> · último saldo <span className="font-semibold tabular-nums">{centavosAString(ultimoSaldoTango)}</span></>
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-semibold mb-3">Extracto bancario</h3>
          <MovimientosPreview bank={bank} movimientos={movimientos} saldoAnterior={saldoAnterior} saldoFinal={saldoFinal} />
        </div>
        <div>
          <h3 className="text-sm font-semibold mb-3">Mayor Tango</h3>
          <AsientosPreview asientos={asientos} />
        </div>
      </div>
    </div>
  )
}
