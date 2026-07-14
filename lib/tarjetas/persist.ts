import crypto from "crypto"
import { db } from "@/lib/db"
import { resumenTarjetas, lineasTarjeta } from "@/lib/db/schema"
import { toCentavos } from "@/lib/utils"
import type { TarjetaResult } from "@/lib/tarjetas/extractor"

// Extraído de app/api/orchestrator/upload/route.ts (handleTarjeta) para reusar
// desde el sync de Google Drive. Comportamiento idéntico al original: resumen +
// líneas en una transacción, tipoLinea sin setear (default "cargo" del schema).
export async function persistTarjeta(
  result: TarjetaResult,
  createdBy: string | null
): Promise<{ resumenId: string; totalMonto: number }> {
  const now = new Date().toISOString()
  const resumenId = crypto.randomUUID()
  const totalMonto = result.lineas.reduce((acc, l) => acc + toCentavos(l.monto), 0)

  await db.transaction(async (tx) => {
    await tx.insert(resumenTarjetas).values({
      id: resumenId,
      nombreTarjeta: result.nombreTarjeta,
      periodo: result.periodo,
      totalMonto,
      creadoEn: now,
      createdBy,
    })
    if (result.lineas.length > 0) {
      await tx.insert(lineasTarjeta).values(result.lineas.map(l => ({
        id: crypto.randomUUID(),
        resumenId,
        cuenta: l.cuenta,
        descripcion: l.descripcion,
        monto: toCentavos(l.monto),
        periodo: l.periodo || result.periodo,
        estado: l.monto > 0 ? "OK" : "",
      })))
    }
  })

  return { resumenId, totalMonto }
}
