/**
 * Backfillea org_id en las 11 tablas raíz que lo agregaron nullable en esta sesión
 * (conciliaciones, saldos_banco, partidas, tarjetas_maestras, resumen_tarjetas,
 * retenciones, retenciones_arca, retenciones_tango, sesiones, uso_api,
 * movimientos_diferidos). UPDATE ... WHERE org_id IS NULL, todas las tablas en
 * una sola transacción.
 *
 *   npx tsx scripts/backfill-org.ts              # dry-run: solo cuenta y loguea, no escribe
 *   npx tsx scripts/backfill-org.ts --apply       # aplica los UPDATE de verdad
 *
 * Resuelve el orgId destino:
 *   1. env DRIVE_SYNC_ORG_ID si está seteada (misma que usa lib/drive/sync.ts).
 *   2. si no, Clerk Backend SDK: lista organizaciones y usa la única existente.
 *      Si hay 0 o más de 1, aborta pidiendo DRIVE_SYNC_ORG_ID=<id> explícito.
 *
 * Idempotente: WHERE org_id IS NULL hace que correrlo de nuevo no toque filas
 * ya backfilleadas.
 */
import { sql } from "drizzle-orm"
import { createClerkClient } from "@clerk/backend"
import { db } from "@/lib/db"

process.loadEnvFile(".env.local")

const TABLAS = [
  "conciliaciones", "saldos_banco", "partidas", "tarjetas_maestras",
  "resumen_tarjetas", "retenciones", "retenciones_arca", "retenciones_tango",
  "sesiones", "uso_api", "movimientos_diferidos",
] as const

const APPLY = process.argv.includes("--apply")

async function resolveOrgId(): Promise<string> {
  if (process.env.DRIVE_SYNC_ORG_ID) return process.env.DRIVE_SYNC_ORG_ID

  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey) {
    throw new Error(
      "Falta DRIVE_SYNC_ORG_ID y CLERK_SECRET_KEY en el entorno — no hay forma de resolver " +
      "el orgId. Configurá CLERK_SECRET_KEY en .env.local o corré con DRIVE_SYNC_ORG_ID=<id> explícito."
    )
  }

  const clerk = createClerkClient({ secretKey })
  const { data: orgs, totalCount } = await clerk.organizations.getOrganizationList()

  if (totalCount !== 1) {
    const listado = orgs.map((o) => `  - ${o.id}  ${o.name}`).join("\n")
    throw new Error(
      `Se esperaba exactamente 1 organización en Clerk, se encontraron ${totalCount}.\n` +
      (orgs.length ? `${listado}\n` : "") +
      "Corré de nuevo con DRIVE_SYNC_ORG_ID=<id> explícito para desambiguar."
    )
  }

  return orgs[0].id
}

async function contarPendientes(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const tabla of TABLAS) {
    const result = await db.execute<{ n: number }>(
      sql.raw(`SELECT count(*)::int AS n FROM "${tabla}" WHERE org_id IS NULL`)
    )
    counts[tabla] = result[0].n
  }
  return counts
}

async function main() {
  const orgId = await resolveOrgId()
  console.log(`orgId destino: ${orgId}`)
  console.log(APPLY
    ? "Modo: --apply (se van a ejecutar los UPDATE)"
    : "Modo: dry-run (solo conteo, no se escribe nada — pasá --apply para aplicar)")

  console.log("\n=== Filas con org_id IS NULL (antes) ===")
  const antes = await contarPendientes()
  for (const tabla of TABLAS) console.log(`  ${tabla}: ${antes[tabla]}`)

  if (!APPLY) {
    console.log("\nDry-run: no se modificó nada. Corré con --apply para aplicar el backfill.")
    process.exit(0)
  }

  console.log("\n=== Aplicando UPDATE (transacción única) ===")
  await db.transaction(async (tx) => {
    for (const tabla of TABLAS) {
      const result = await tx.execute(
        sql`UPDATE ${sql.raw(`"${tabla}"`)} SET org_id = ${orgId} WHERE org_id IS NULL`
      )
      console.log(`  ${tabla}: ${result.count} filas actualizadas`)
    }
  })

  console.log("\n=== Filas con org_id IS NULL (después, debería ser 0 en todas) ===")
  const despues = await contarPendientes()
  for (const tabla of TABLAS) console.log(`  ${tabla}: ${despues[tabla]}`)

  console.log("\nBackfill aplicado ✓")
  process.exit(0)
}

main().catch((e) => { console.error("Error:", e); process.exit(1) })
