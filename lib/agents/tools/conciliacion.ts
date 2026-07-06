import { tool } from "ai"
import { z } from "zod"
import { listConciliaciones, getConciliacion } from "@/lib/conciliacion/registry"
import { getSaldos } from "@/lib/saldos/manager"
import { getPartidas } from "@/lib/partidas/manager"

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
}
