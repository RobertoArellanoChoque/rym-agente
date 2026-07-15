import { tool } from "ai"
import { z } from "zod"
import { db } from "@/lib/db"
import { retenciones, retencionItems } from "@/lib/db/schema"
import { eq, and, desc, sql } from "drizzle-orm"
import { centavosAString } from "@/lib/conciliacion/matching"
import { requireOrgId } from "@/lib/auth/current-user"

export const ventasTools = {
  listar_retenciones: tool({
    description:
      "Lista todos los comprobantes de retención procesados con empresa, fecha, bruto y neto. Usalo cuando el usuario pregunte por retenciones, pagos recibidos o el estado del módulo Ventas.",
    inputSchema: z.object({}),
    execute: async () => {
      const orgId = await requireOrgId()
      const [rows, total] = await Promise.all([
        db.select().from(retenciones).where(eq(retenciones.orgId, orgId)).orderBy(desc(retenciones.creadoEn)).limit(20),
        db.$count(retenciones, eq(retenciones.orgId, orgId)),
      ])
      if (!rows.length) return { total: 0, mensaje: "No hay comprobantes de retención cargados aún.", comprobantes: [] }
      return {
        total,
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
      const orgId = await requireOrgId()
      const row = await db.query.retenciones.findFirst({
        where: and(eq(retenciones.id, id), eq(retenciones.orgId, orgId)),
        with: { items: true },
      })
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
        retenciones: row.items.map((it) => ({
          tipo: it.tipo,
          monto: it.monto,
          porcentaje: it.porcentaje != null ? Number(it.porcentaje) : undefined,
        })),
      }
    },
  }),

  resumen_retenciones: tool({
    description:
      "Totales agregados de retenciones sobre todos los comprobantes: suma bruto, neto y desglose por tipo de retención (Ganancias, IVA, IIBB, etc.).",
    inputSchema: z.object({}),
    execute: async () => {
      const orgId = await requireOrgId()
      const [totales, porTipoRows] = await Promise.all([
        db.select({
          comprobantes: sql<number>`count(*)::int`,
          totalBruto: sql<number>`coalesce(sum(${retenciones.montoBruto}), 0)::bigint`.mapWith(Number),
          totalNeto: sql<number>`coalesce(sum(${retenciones.montoNeto}), 0)::bigint`.mapWith(Number),
        }).from(retenciones).where(eq(retenciones.orgId, orgId)),
        // retencionItems no tiene orgId propio (hijo de retenciones) — se scopea via join
        db
          .select({ tipo: retencionItems.tipo, monto: sql<number>`sum(${retencionItems.monto})::bigint` })
          .from(retencionItems)
          .innerJoin(retenciones, eq(retencionItems.retencionId, retenciones.id))
          .where(eq(retenciones.orgId, orgId))
          .groupBy(retencionItems.tipo),
      ])
      const { comprobantes, totalBruto, totalNeto } = totales[0]
      if (!comprobantes) return { comprobantes: 0, mensaje: "No hay comprobantes cargados." }
      return {
        comprobantes,
        totalBruto: centavosAString(totalBruto),
        totalNeto: centavosAString(totalNeto),
        porTipo: porTipoRows
          .map((r) => ({ tipo: r.tipo, monto: Number(r.monto) }))
          .sort((a, b) => b.monto - a.monto)
          .map(({ tipo, monto }) => ({ tipo, monto: centavosAString(monto) })),
      }
    },
  }),
}
