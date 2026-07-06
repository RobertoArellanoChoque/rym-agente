import { tool } from "ai"
import { z } from "zod"
import { db } from "@/lib/db"
import { conciliaciones, movimientos as movimientosTable, asientos as asientosTable, matches, discrepancias } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { conciliar } from "@/lib/conciliacion/matching"
import { upsertConciliacion, getConciliacion } from "@/lib/conciliacion/registry"
import { centavosAString } from "@/lib/conciliacion/matching"
import { approveConciliacion } from "@/lib/conciliacion/approve"
import crypto from "crypto"
import type { Movimiento, Asiento } from "@/lib/types"

export const actionTools = {
  ejecutar_matching: tool({
    description:
      "Ejecuta el algoritmo de matching entre movimientos del extracto bancario y asientos del mayor de Tango. Guarda los matches encontrados, detecta discrepancias y calcula la diferencia. Requerido antes de aprobar una conciliación.",
    inputSchema: z.object({
      sessionId: z.string().describe("ID UUID de la sesión de conciliación"),
      aprobarMatches: z.boolean().optional().describe("Si true, aprueba automáticamente todos los matches sin intervención del usuario. Default: false (solo calcula, no aprueba)."),
    }),
    execute: async ({ sessionId, aprobarMatches = false }) => {
      // Verificar sesión existe
      const session = await getConciliacion(sessionId)
      if (!session) return { error: "Sesión no encontrada" }

      // Stage debe ser tango-done (banco + mayor cargados)
      if (session.stage !== "tango-done") {
        return { error: `Stage actual: ${session.stage}. Requerido: tango-done (extraer banco y mayor primero).` }
      }

      // Obtener movimientos y asientos
      const movs = await db.select().from(movimientosTable).where(eq(movimientosTable.conciliacionId, sessionId))
      const asien = await db.select().from(asientosTable).where(eq(asientosTable.conciliacionId, sessionId))

      if (movs.length === 0) return { error: "Sin movimientos cargados del extracto" }
      if (asien.length === 0) return { error: "Sin asientos cargados del mayor Tango" }

      // Convertir a tipos para matching
      const movimientos: Movimiento[] = movs.map(m => ({
        id: m.id,
        fecha: m.fecha,
        descripcion: m.descripcion,
        referencia: m.referencia,
        monto: m.monto,
        saldo: m.saldo ?? undefined,
        categoria: m.categoria as any,
      }))

      const asientos: Asiento[] = asien.map(a => ({
        id: a.id,
        fecha: a.fecha,
        descripcion: a.descripcion,
        referencia: a.referencia,
        monto: a.monto,
        cuenta: a.cuenta,
        debe: a.debe ?? undefined,
        haber: a.haber ?? undefined,
        saldo: a.saldo ?? undefined,
      }))

      // Ejecutar matching
      const resultado = conciliar(
        movimientos,
        asientos,
        session.saldoFinal,
        undefined,
        session.saldoMayor
      )

      // Guardar matches en DB
      await db.delete(matches).where(eq(matches.conciliacionId, sessionId))
      await db.delete(discrepancias).where(eq(discrepancias.conciliacionId, sessionId))

      if (resultado.matches.length > 0) {
        await db.insert(matches).values(resultado.matches.map(m => ({
          conciliacionId: sessionId,
          movimientoId: m.movimientoId,
          asientoId: m.asientoId,
          score: m.score,
          motivo: m.motivo,
          tipo: aprobarMatches ? "confirmed" : m.tipo,
          diferenciaMonto: m.diferenciaMonto,
          explicacion: m.explicacion,
        })))
      }

      if (resultado.discrepancias.length > 0) {
        await db.insert(discrepancias).values(resultado.discrepancias.map(d => ({
          conciliacionId: sessionId,
          tipo: d.tipo,
          fecha: d.fecha,
          descripcion: d.descripcion,
          monto: d.monto,
          movimientoId: d.movimientoId,
          asientoId: d.asientoId,
        })))
      }

      // Actualizar sesión
      await upsertConciliacion(sessionId, {
        stage: "done",
        movimientosCount: resultado.movimientos.length,
        asientosCount: resultado.asientos.length,
        saldoBanco: resultado.saldoBanco,
        saldoMayor: resultado.saldoMayor,
        diferencia: resultado.diferencia,
      })

      return {
        ok: true,
        matches: resultado.matches.length,
        discrepancias: resultado.discrepancias.length,
        diferencia: centavosAString(resultado.diferencia),
        stage: "done",
      }
    },
  }),

  aprobar_conciliacion: tool({
    description:
      "Marca una conciliación como completada (stage=done) y registra el saldo conciliado en la tabla saldosBanco. Llamá esto después de ejecutar_matching cuando la diferencia sea 0 o aceptable.",
    inputSchema: z.object({
      sessionId: z.string().describe("ID UUID de la sesión de conciliación"),
      aceptarDiferencia: z.boolean().optional().describe("Si true, aprueba incluso si hay diferencia residual. Default: false."),
    }),
    execute: async ({ sessionId, aceptarDiferencia = false }) => {
      return approveConciliacion(sessionId, aceptarDiferencia)
    },
  }),

  crear_sesion: tool({
    description:
      "Crea una nueva sesión de conciliación. Llamá esto antes de subir cualquier extracto bancario. Retorna el sessionId para usar en los demás endpoints.",
    inputSchema: z.object({
      label: z.string().describe("Nombre/descripción para la sesión, ej: 'BBVA Junio 2026' o 'Conciliación mensual'"),
      bankHint: z.string().optional().describe("Optional hint del banco si ya lo sabés, para auto-completar el label después. Ej: 'bbva', 'galicia'."),
    }),
    execute: async ({ label, bankHint }) => {
      const sessionId = crypto.randomUUID()
      const now = new Date().toISOString()

      await db.insert(conciliaciones).values({
        id: sessionId,
        label,
        stage: "new",
        createdAt: now,
        updatedAt: now,
      })

      return {
        ok: true,
        sessionId,
        label,
        stage: "new",
        hint: "Próximo paso: subí el extracto bancario (PDF o Excel) con sessionId=" + sessionId,
      }
    },
  }),

  listar_discrepancias: tool({
    description:
      "Retorna todas las discrepancias encontradas en una conciliación (movimientos en extracto que no están en Tango y vice versa). Útil para diagnosticar diferencias.",
    inputSchema: z.object({
      sessionId: z.string().describe("ID UUID de la sesión de conciliación"),
    }),
    execute: async ({ sessionId }) => {
      const session = await getConciliacion(sessionId)
      if (!session) return { error: "Sesión no encontrada" }

      const rows = await db.select().from(discrepancias).where(eq(discrepancias.conciliacionId, sessionId))

      return {
        total: rows.length,
        discrepancias: rows.map(d => ({
          tipo: d.tipo,
          fecha: d.fecha,
          descripcion: d.descripcion,
          monto: centavosAString(d.monto),
        })),
      }
    },
  }),
}
