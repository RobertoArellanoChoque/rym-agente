import { db } from "@/lib/db"
import { conciliaciones, discrepancias, saldosBanco } from "@/lib/db/schema"
import { and, eq, ne } from "drizzle-orm"

// Umbral de discrepancia "grande" en centavos ARS. 5_000_000 = $50.000 — ajustable.
export const ALERTA_DISCREPANCIA_MIN = 5_000_000
// Días sin aprobar tras los cuales una conciliación se marca como "vieja".
export const ALERTA_STALE_DIAS = 7

export type TipoAlerta = "discrepancia" | "saldo_negativo" | "stale"
export type SeveridadAlerta = "warning" | "error"

export type Alerta = {
  id: string // determinístico (estable entre polls) → habilita dismissal por localStorage
  tipo: TipoAlerta
  severidad?: SeveridadAlerta
  titulo: string
  detalle: string
  monto?: number
  entidadId: string
}

// ── Predicados puros (thresholds testeables — ver lib/alertas.test.ts) ──────────
// El scoping por org va siempre en SQL (seguridad); el umbral de negocio vive acá.

export function esDiscrepanciaGrande(monto: number): boolean {
  return Math.abs(monto) > ALERTA_DISCREPANCIA_MIN
}

export function esSaldoNegativo(saldo: number): boolean {
  return saldo < 0
}

export function esStale(updatedAtIso: string, ahoraMs: number = Date.now()): boolean {
  const edadDias = (ahoraMs - new Date(updatedAtIso).getTime()) / 86_400_000
  return edadDias > ALERTA_STALE_DIAS
}

// ── Cómputo on-read (sin tabla, sin cron) ───────────────────────────────────────

export async function getAlertas(orgId: string): Promise<Alerta[]> {
  const [discs, saldos, concsActivas] = await Promise.all([
    // discrepancias no tiene orgId propio → se scopea vía join a su conciliación padre
    db.select({
      id: discrepancias.id,
      monto: discrepancias.monto,
      descripcion: discrepancias.descripcion,
      conciliacionId: discrepancias.conciliacionId,
      label: conciliaciones.label,
    })
      .from(discrepancias)
      .innerJoin(conciliaciones, eq(discrepancias.conciliacionId, conciliaciones.id))
      .where(and(eq(conciliaciones.orgId, orgId), ne(conciliaciones.stage, "aprobada"))),

    db.select({
      bancoId: saldosBanco.bancoId,
      bancoNombre: saldosBanco.bancoNombre,
      ultimoSaldo: saldosBanco.ultimoSaldo,
    })
      .from(saldosBanco)
      .where(eq(saldosBanco.orgId, orgId)),

    db.select({
      id: conciliaciones.id,
      label: conciliaciones.label,
      bancoNombre: conciliaciones.bancoNombre,
      updatedAt: conciliaciones.updatedAt,
    })
      .from(conciliaciones)
      .where(and(eq(conciliaciones.orgId, orgId), ne(conciliaciones.stage, "aprobada"))),
  ])

  const alertas: Alerta[] = []

  // ponytail: umbral filtrado en JS (predicado testeable). Set acotado a conciliaciones
  // no aprobadas; si el volumen de discrepancias crece, empujar abs(monto)>MIN al WHERE.
  for (const d of discs) {
    if (!esDiscrepanciaGrande(d.monto)) continue
    alertas.push({
      id: `discrepancia:${d.id}`,
      tipo: "discrepancia",
      severidad: "warning",
      titulo: "Discrepancia grande",
      detalle: `${d.label}: ${d.descripcion}`,
      monto: d.monto,
      entidadId: d.conciliacionId,
    })
  }

  for (const s of saldos) {
    if (!esSaldoNegativo(s.ultimoSaldo)) continue
    alertas.push({
      id: `saldo-negativo:${s.bancoId}`,
      tipo: "saldo_negativo",
      severidad: "error",
      titulo: "Saldo negativo",
      detalle: s.bancoNombre,
      monto: s.ultimoSaldo,
      entidadId: s.bancoId,
    })
  }

  for (const c of concsActivas) {
    if (!esStale(c.updatedAt)) continue
    alertas.push({
      id: `stale:${c.id}`,
      tipo: "stale",
      severidad: "warning",
      titulo: "Conciliación sin aprobar",
      detalle: `${c.bancoNombre ?? c.label} lleva más de ${ALERTA_STALE_DIAS} días sin aprobar`,
      entidadId: c.id,
    })
  }

  return alertas
}
