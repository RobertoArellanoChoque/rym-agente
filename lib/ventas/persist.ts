import crypto from "crypto"
import { db } from "@/lib/db"
import { retenciones, retencionItems } from "@/lib/db/schema"
import type { PagoResult } from "@/lib/ventas/extractor"

// Extraído de app/api/orchestrator/upload/route.ts (handlePago) para reusar
// desde el sync de Google Drive. Comportamiento idéntico al original: retención +
// ítems en una transacción.
export async function persistPago(pago: PagoResult, createdBy: string | null): Promise<string> {
  const retencionId = crypto.randomUUID()

  await db.transaction(async (tx) => {
    await tx.insert(retenciones).values({
      id: retencionId,
      empresa: pago.empresa,
      cuit: pago.cuit ?? "",
      fechaPago: pago.fechaPago,
      concepto: pago.concepto ?? "",
      nroComprobante: pago.nroComprobante ?? "",
      montoBruto: pago.montoBruto,
      montoNeto: pago.montoNeto,
      creadoEn: new Date().toISOString(),
      createdBy,
    })
    if (pago.retenciones.length) {
      await tx.insert(retencionItems).values(
        pago.retenciones.map((r) => ({
          id: crypto.randomUUID(),
          retencionId,
          tipo: r.tipo,
          monto: r.monto,
          porcentaje: r.porcentaje != null ? String(r.porcentaje) : null,
        }))
      )
    }
  })

  return retencionId
}
