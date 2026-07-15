import { tool } from "ai"
import { z } from "zod"
import { db } from "@/lib/db"
import { resumenTarjetas, retenciones } from "@/lib/db/schema"
import { and, eq, desc } from "drizzle-orm"
import { listConciliaciones } from "@/lib/conciliacion/registry"
import { centavosAString } from "@/lib/conciliacion/matching"
import { requireOrgId } from "@/lib/auth/current-user"

export const orchestratorTools = {
  ver_estado_general: tool({
    description:
      "Muestra un resumen del estado global del sistema: sesiones de conciliación activas, resúmenes de tarjeta procesados y saldos bancarios registrados. Usalo cuando el usuario pregunte qué hay cargado o qué procesó el sistema.",
    inputSchema: z.object({}),
    execute: async () => {
      const orgId = await requireOrgId()
      const [conciliacionesAll, tarjetas, ultimasRetenciones] = await Promise.all([
        listConciliaciones(orgId),
        db.select().from(resumenTarjetas).where(eq(resumenTarjetas.orgId, orgId)).orderBy(desc(resumenTarjetas.creadoEn)).limit(5),
        db.select().from(retenciones).where(eq(retenciones.orgId, orgId)).orderBy(desc(retenciones.creadoEn)).limit(3),
      ])
      const conciliaciones = conciliacionesAll.slice(0, 5)
      return {
        conciliaciones: conciliaciones.map((c) => ({
          id: c.id,
          banco: c.bankName,
          stage: c.stage,
          movimientos: c.movimientosCount,
          diferencia: c.diferencia != null ? centavosAString(c.diferencia) : null,
        })),
        tarjetas: tarjetas.map((t) => ({
          id: t.id,
          tarjeta: t.nombreTarjeta,
          periodo: t.periodo,
          total: centavosAString(t.totalMonto),
        })),
        retenciones: ultimasRetenciones.map((r) => ({
          id: r.id,
          empresa: r.empresa,
          fecha: r.fechaPago,
          neto: centavosAString(r.montoNeto),
        })),
      }
    },
  }),

  ver_tarjeta: tool({
    description:
      "Devuelve el detalle de un resumen de tarjeta procesado: líneas de cargos con cuenta, descripción, monto y período.",
    inputSchema: z.object({
      resumenId: z.string().describe("ID UUID del resumen de tarjeta"),
    }),
    execute: async ({ resumenId }) => {
      const orgId = await requireOrgId()
      const resumen = await db.query.resumenTarjetas.findFirst({
        where: and(eq(resumenTarjetas.id, resumenId), eq(resumenTarjetas.orgId, orgId)),
        with: { lineas: true },
      })
      if (!resumen) return { error: "Resumen no encontrado" }
      return {
        ...resumen,
        totalFormateado: centavosAString(resumen.totalMonto),
        lineas: resumen.lineas.map((l) => ({ ...l, montoFormateado: centavosAString(l.monto) })),
      }
    },
  }),

  listar_tarjetas: tool({
    description:
      "Lista todos los resúmenes de tarjeta de crédito procesados con sus totales y períodos.",
    inputSchema: z.object({}),
    execute: async () => {
      const orgId = await requireOrgId()
      const rows = await db.select().from(resumenTarjetas).where(eq(resumenTarjetas.orgId, orgId)).orderBy(desc(resumenTarjetas.creadoEn)).limit(20)
      return rows.map((r) => ({
        id: r.id,
        tarjeta: r.nombreTarjeta,
        periodo: r.periodo,
        total: centavosAString(r.totalMonto),
        fecha: r.creadoEn,
      }))
    },
  }),

  analizar_tarjeta: tool({
    description:
      "Analiza un resumen de tarjeta: desglose de gastos por cuenta, top 5 cargos más altos y total. Usalo cuando el usuario quiera saber en qué se gastó o cómo se distribuyen los cargos.",
    inputSchema: z.object({
      resumenId: z.string().describe("ID UUID del resumen de tarjeta"),
    }),
    execute: async ({ resumenId }) => {
      const orgId = await requireOrgId()
      const resumen = await db.query.resumenTarjetas.findFirst({
        where: and(eq(resumenTarjetas.id, resumenId), eq(resumenTarjetas.orgId, orgId)),
        with: { lineas: true },
      })
      if (!resumen) return { error: "Resumen no encontrado" }
      const lineas = resumen.lineas
      if (!lineas.length) return { error: "Sin líneas de cargo" }
      const porCuenta: Record<string, number> = {}
      for (const l of lineas) {
        const key = l.cuenta || "Sin cuenta"
        porCuenta[key] = (porCuenta[key] ?? 0) + l.monto
      }
      const top5 = [...lineas].sort((a, b) => b.monto - a.monto).slice(0, 5)
      return {
        tarjeta: resumen.nombreTarjeta,
        periodo: resumen.periodo,
        total: centavosAString(resumen.totalMonto),
        porCuenta: Object.entries(porCuenta)
          .sort(([, a], [, b]) => b - a)
          .map(([cuenta, monto]) => ({ cuenta, monto: centavosAString(monto) })),
        top5: top5.map((l) => ({
          descripcion: l.descripcion,
          cuenta: l.cuenta,
          monto: centavosAString(l.monto),
        })),
      }
    },
  }),
}
