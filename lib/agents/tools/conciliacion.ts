import { tool } from "ai"
import { z } from "zod"
import { listConciliaciones, getConciliacion } from "@/lib/conciliacion/registry"
import { getSaldos } from "@/lib/saldos/manager"
import { getPartidas } from "@/lib/partidas/manager"
import { db } from "@/lib/db"
import { conciliaciones } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { explicarGap } from "@/lib/conciliacion/explicar-gap"
import { agruparPrestamos } from "@/lib/conciliacion/prestamos"
import { centavosAString } from "@/lib/conciliacion/matching"
import type { Discrepancia, Categoria } from "@/lib/types"

export const conciliacionTools = {
  listar_sesiones: tool({
    description:
      "Lista todas las sesiones de conciliación bancaria con su estado, banco, fechas y diferencia.",
    inputSchema: z.object({}),
    execute: async () => listConciliaciones(),
  }),

  ver_sesion: tool({
    description:
      "Devuelve el detalle de una sesión de conciliación: saldos, conteos, diferencia y stage.",
    inputSchema: z.object({
      sessionId: z.string().describe("ID UUID de la sesión de conciliación"),
    }),
    execute: async ({ sessionId }) => getConciliacion(sessionId),
  }),

  ver_saldos: tool({
    description:
      "Devuelve los saldos bancarios registrados por banco (último saldo, fecha, saldo conciliado).",
    inputSchema: z.object({}),
    execute: async () => getSaldos(),
  }),

  ver_partidas: tool({
    description:
      "Devuelve las partidas de ajuste manual cargadas para un banco específico.",
    inputSchema: z.object({
      bankId: z.string().describe("Identificador del banco, ej: 'bbva', 'galicia'"),
    }),
    execute: async ({ bankId }) => getPartidas(bankId),
  }),

  explicar_diferencia: tool({
    description:
      "Nombra las cuentas a conciliar de una sesión: desglosa la diferencia Banco−Mayor en grupos e ítems individuales (fecha, descripción, monto) que la explican. Usalo después de ejecutar_matching para decirle al usuario CUÁLES son los ítems a conciliar antes de contabilizarlos.",
    inputSchema: z.object({
      sessionId: z.string().describe("ID UUID de la sesión de conciliación"),
    }),
    execute: async ({ sessionId }) => {
      const session = await getConciliacion(sessionId)
      if (!session) return { error: "Sesión no encontrada" }
      if (session.stage !== "done") {
        return { error: `Stage actual: ${session.stage}. Ejecutá el matching primero (ejecutar_matching).` }
      }

      const conc = await db.query.conciliaciones.findFirst({
        where: eq(conciliaciones.id, sessionId),
        with: {
          movimientos: true,
          matches: true,
          asientos: true,
          discrepancias: { with: { movimiento: true } },
        },
      })
      const movs = conc?.movimientos ?? []
      const mts = conc?.matches ?? []
      const asis = conc?.asientos ?? []
      const discrepancias: Discrepancia[] = (conc?.discrepancias ?? []).map(d => ({
        tipo: d.tipo as Discrepancia["tipo"],
        fecha: d.fecha,
        descripcion: d.descripcion,
        monto: d.monto,
        movimientoId: d.movimientoId ?? undefined,
        asientoId: d.asientoId ?? undefined,
        categoria: d.movimiento?.categoria as Categoria | undefined,
        grupoId: d.movimiento?.grupoId ?? undefined,
      }))

      const partidas = session.bankId ? await getPartidas(session.bankId) : []
      const sumaPartidas = partidas.reduce((s, p) => s + p.monto, 0)
      const gapBruto = (session.saldoBanco ?? 0) - (session.saldoMayor ?? 0)

      const explic = explicarGap(discrepancias, gapBruto, sumaPartidas)
      const fmt = (d: Discrepancia) => ({
        fecha: d.fecha,
        descripcion: d.descripcion,
        monto: centavosAString(d.monto),
        lado: d.tipo === "en_extracto_no_en_mayor" ? "banco (falta en mayor)" : "mayor (sin respaldo en banco)",
      })

      // Préstamos del extracto: todos los grupos (conciliados o no), con estado
      const prestamos = agruparPrestamos(movs, mts, asis).map(g => ({
        fecha: g.fecha,
        amortizacion: g.amort ? centavosAString(g.amort.monto) : null,
        impuestosRelacionados: g.impuestos.map(i => ({ descripcion: i.descripcion, monto: centavosAString(i.monto) })),
        total: centavosAString(g.total),
        estado: g.asiento
          ? `En Tango ✓ — conciliado con "${g.asiento.descripcion}" (${g.asiento.fecha})`
          : "Pendiente de conciliar (no está en Tango)",
      }))

      return {
        diferencia: centavosAString(session.diferencia ?? 0),
        cuadra: explic.cuadra,
        grupos: explic.grupos.map(g => ({
          concepto: g.bucket,
          lado: g.lado,
          esPrestamo: g.esPrestamo ?? false,
          total: centavosAString(g.total),
          items: g.items.map(fmt),
        })),
        cuentasAConciliar: explic.cuentasAConciliar.map(fmt),
        operativos: explic.operativos.map(fmt),
        prestamos,
      }
    },
  }),
}
