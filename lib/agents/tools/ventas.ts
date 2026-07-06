import { tool } from "ai"
import { z } from "zod"
import { db } from "@/lib/db"
import { retenciones } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"
import { centavosAString } from "@/lib/conciliacion/matching"

export const ventasTools = {
  listar_retenciones: tool({
    description:
      "Lista todos los comprobantes de retención procesados con empresa, fecha, bruto y neto. Usalo cuando el usuario pregunte por retenciones, pagos recibidos o el estado del módulo Ventas.",
    inputSchema: z.object({}),
    execute: async () => {
      const rows = await db.select().from(retenciones).orderBy(desc(retenciones.creadoEn))
      if (!rows.length) return { total: 0, mensaje: "No hay comprobantes de retención cargados aún.", comprobantes: [] }
      return {
        total: rows.length,
        comprobantes: rows.map((r) => ({
          id: r.id,
          empresa: r.empresa,
          cuit: r.cuit,
          fecha: r.fechaPago,
          concepto: r.concepto,
          bruto: centavosAString(r.montoBruto),
          neto: centavosAString(r.montoNeto),
        })),
      }
    },
  }),

  ver_retencion: tool({
    description:
      "Devuelve el detalle completo de un comprobante de retención: empresa, todas las retenciones por tipo, porcentaje y monto.",
    inputSchema: z.object({
      id: z.string().describe("ID UUID del comprobante de retención"),
    }),
    execute: async ({ id }) => {
      const [row] = await db.select().from(retenciones).where(eq(retenciones.id, id)).limit(1)
      if (!row) return { error: "Comprobante no encontrado" }
      return {
        id: row.id,
        empresa: row.empresa,
        cuit: row.cuit,
        fecha: row.fechaPago,
        concepto: row.concepto,
        nroComprobante: row.nroComprobante,
        bruto: centavosAString(row.montoBruto),
        neto: centavosAString(row.montoNeto),
        retenciones: row.retencionesJson,
      }
    },
  }),

  resumen_retenciones: tool({
    description:
      "Totales agregados de retenciones sobre todos los comprobantes: suma bruto, neto y desglose por tipo de retención (Ganancias, IVA, IIBB, etc.).",
    inputSchema: z.object({}),
    execute: async () => {
      const rows = await db.select().from(retenciones)
      if (!rows.length) return { comprobantes: 0, mensaje: "No hay comprobantes cargados." }
      const totalBruto = rows.reduce((s, r) => s + r.montoBruto, 0)
      const totalNeto = rows.reduce((s, r) => s + r.montoNeto, 0)
      const porTipo: Record<string, number> = {}
      for (const r of rows) {
        const rets = r.retencionesJson
        for (const ret of rets) {
          porTipo[ret.tipo] = (porTipo[ret.tipo] ?? 0) + ret.monto
        }
      }
      return {
        comprobantes: rows.length,
        totalBruto: centavosAString(totalBruto),
        totalNeto: centavosAString(totalNeto),
        porTipo: Object.entries(porTipo)
          .sort(([, a], [, b]) => b - a)
          .map(([tipo, monto]) => ({ tipo, monto: centavosAString(monto) })),
      }
    },
  }),
}
