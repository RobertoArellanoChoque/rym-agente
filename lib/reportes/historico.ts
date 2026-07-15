import { db } from "@/lib/db"
import { conciliaciones } from "@/lib/db/schema"
import { and, eq, gte, lte } from "drizzle-orm"

// Subset de `conciliaciones` (schema.ts:14) que necesita la agregación.
// Montos en centavos (bigint mode number). periodo = "YYYY-MM" (nullable).
export type FilaConc = {
  id: string
  label: string
  periodo: string | null
  bancoId: string | null
  bancoNombre: string | null
  saldoBanco: number | null
  saldoMayor: number | null
  diferencia: number | null
  updatedAt: string
}

type Totales = { cantidad: number; totalSaldoBanco: number; totalSaldoMayor: number; totalDiferencia: number }
export type ResumenPeriodo = Totales & { periodo: string }
export type ResumenBanco = Totales & { bancoId: string; bancoNombre: string }
export type Historico = { porPeriodo: ResumenPeriodo[]; porBanco: ResumenBanco[]; detalle: FilaConc[] }

// Pura: agrega filas ya filtradas por período y por banco. Testeable sin DB.
export function agregarHistorico(filas: FilaConc[]): Historico {
  const porPeriodo = new Map<string, ResumenPeriodo>()
  const porBanco = new Map<string, ResumenBanco>()

  for (const f of filas) {
    const sb = f.saldoBanco ?? 0
    const sm = f.saldoMayor ?? 0
    const dif = f.diferencia ?? 0

    const per = f.periodo ?? "—"
    const p = porPeriodo.get(per) ?? { periodo: per, cantidad: 0, totalSaldoBanco: 0, totalSaldoMayor: 0, totalDiferencia: 0 }
    p.cantidad++; p.totalSaldoBanco += sb; p.totalSaldoMayor += sm; p.totalDiferencia += dif
    porPeriodo.set(per, p)

    const bid = f.bancoId ?? "—"
    const b = porBanco.get(bid) ?? { bancoId: bid, bancoNombre: f.bancoNombre ?? "—", cantidad: 0, totalSaldoBanco: 0, totalSaldoMayor: 0, totalDiferencia: 0 }
    b.cantidad++; b.totalSaldoBanco += sb; b.totalSaldoMayor += sm; b.totalDiferencia += dif
    porBanco.set(bid, b)
  }

  return {
    porPeriodo: [...porPeriodo.values()].sort((a, b) => a.periodo.localeCompare(b.periodo)),
    porBanco: [...porBanco.values()].sort((a, b) => a.bancoNombre.localeCompare(b.bancoNombre)),
    detalle: [...filas].sort(
      (a, b) => (a.periodo ?? "").localeCompare(b.periodo ?? "") || (a.bancoNombre ?? "").localeCompare(b.bancoNombre ?? ""),
    ),
  }
}

// Query org-scoped: conciliaciones aprobadas en [desde, hasta] (comparación string sobre "YYYY-MM").
export async function historicoMensual(orgId: string, desde: string, hasta: string, bancoId?: string): Promise<Historico> {
  const filas = await db
    .select({
      id: conciliaciones.id,
      label: conciliaciones.label,
      periodo: conciliaciones.periodo,
      bancoId: conciliaciones.bancoId,
      bancoNombre: conciliaciones.bancoNombre,
      saldoBanco: conciliaciones.saldoBanco,
      saldoMayor: conciliaciones.saldoMayor,
      diferencia: conciliaciones.diferencia,
      updatedAt: conciliaciones.updatedAt,
    })
    .from(conciliaciones)
    .where(
      and(
        eq(conciliaciones.orgId, orgId),
        eq(conciliaciones.stage, "aprobada"),
        gte(conciliaciones.periodo, desde), // periodo NULL nunca matchea gte/lte → se excluye
        lte(conciliaciones.periodo, hasta),
        bancoId ? eq(conciliaciones.bancoId, bancoId) : undefined,
      ),
    )

  return agregarHistorico(filas)
}
