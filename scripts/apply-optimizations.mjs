/**
 * Aplica índices, cambio a jsonb y FKs huérfanas directamente sobre Postgres.
 * Idempotente (IF NOT EXISTS / catch duplicate_object). Se usa porque
 * `drizzle-kit push` tiene un bug de introspección en esta versión.
 *
 *   node scripts/apply-optimizations.mjs
 */
import postgres from "postgres"
process.loadEnvFile(".env.local")

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 })

const INDEXES = [
  ["movimientos_conciliacion_id_idx", "movimientos", "conciliacion_id"],
  ["asientos_conciliacion_id_idx", "asientos", "conciliacion_id"],
  ["matches_conciliacion_id_idx", "matches", "conciliacion_id"],
  ["discrepancias_conciliacion_id_idx", "discrepancias", "conciliacion_id"],
  ["lineas_tarjeta_resumen_id_idx", "lineas_tarjeta", "resumen_id"],
  ["partidas_banco_id_idx", "partidas", "banco_id"],
  ["sesiones_modulo_updated_at_idx", "sesiones", "modulo, updated_at"],
  ["conciliaciones_created_at_idx", "conciliaciones", "created_at"],
  ["conciliaciones_updated_at_idx", "conciliaciones", "updated_at"],
  ["resumen_tarjetas_creado_en_idx", "resumen_tarjetas", "creado_en"],
  ["retenciones_creado_en_idx", "retenciones", "creado_en"],
  ["uso_api_ts_idx", "uso_api", "ts"],
  ["discrepancias_movimiento_id_idx", "discrepancias", "movimiento_id"],
  ["discrepancias_asiento_id_idx", "discrepancias", "asiento_id"],
  ["resumen_tarjetas_tarjeta_maestra_id_idx", "resumen_tarjetas", "tarjeta_maestra_id"],
  ["conciliaciones_stage_idx", "conciliaciones", "stage"],
]

// [constraint_name, table, column, ref_table, ref_col]
const FKS = [
  ["resumen_tarjetas_tarjeta_maestra_id_tarjetas_maestras_id_fk", "resumen_tarjetas", "tarjeta_maestra_id", "tarjetas_maestras", "id"],
  ["discrepancias_movimiento_id_movimientos_id_fk", "discrepancias", "movimiento_id", "movimientos", "id"],
  ["discrepancias_asiento_id_asientos_id_fk", "discrepancias", "asiento_id", "asientos", "id"],
]

async function main() {
  console.log("=== ÍNDICES ===")
  for (const [name, table, cols] of INDEXES) {
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS "${name}" ON "${table}" (${cols})`)
    console.log(`✓ ${name}`)
  }

  // Nota: el bloque JSONB viejo se eliminó — `sesiones.datos` ya es jsonb en el schema
  // y `retenciones.retenciones_json` ya no existe (migró a la tabla `retencion_items`).
  // Ese ALTER rompía el script antes de llegar a las FKs.

  console.log("\n=== FKs huérfanas (ON DELETE SET NULL) ===")
  for (const [name, table, col, refTable, refCol] of FKS) {
    try {
      await sql.unsafe(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${name}" ` +
        `FOREIGN KEY ("${col}") REFERENCES "${refTable}"("${refCol}") ON DELETE SET NULL`
      )
      console.log(`✓ ${name}`)
    } catch (e) {
      if (e.code === "42710" || e.code === "42P07") console.log(`— ${name}: ya existe`)
      else throw e
    }
  }

  await sql.end()
  console.log("\nOptimizaciones aplicadas ✅")
}

main().catch((e) => { console.error("Error:", e); process.exit(1) })
