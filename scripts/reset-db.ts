/**
 * Vacía la base de datos EXCEPTO las tablas de tarjetas.
 *   ./node_modules/.bin/tsx scripts/reset-db.ts
 *
 * Conserva: tarjetas_maestras, resumen_tarjetas, lineas_tarjeta.
 * Vacía el resto. DESTRUCTIVO e irreversible.
 */
import { sql, getTableName } from "drizzle-orm"
import { db } from "@/lib/db"
import { RESET_TABLES } from "@/lib/db/reset-tables"

process.loadEnvFile(".env.local")

const TRUNCATE = RESET_TABLES.map(getTableName)

async function main() {
  await db.execute(sql.raw(`TRUNCATE ${TRUNCATE.join(", ")} RESTART IDENTITY CASCADE`))
  console.log(`✓ Vaciadas ${TRUNCATE.length} tablas. Tarjetas conservadas.`)

  // Confirmación: tarjetas intactas, resto en 0
  const check = await db.execute(sql.raw(`
    SELECT 'tarjetas_maestras' t, count(*) n FROM tarjetas_maestras
    UNION ALL SELECT 'resumen_tarjetas', count(*) FROM resumen_tarjetas
    UNION ALL SELECT 'lineas_tarjeta', count(*) FROM lineas_tarjeta
    UNION ALL SELECT 'conciliaciones', count(*) FROM conciliaciones
    UNION ALL SELECT 'retenciones', count(*) FROM retenciones
    UNION ALL SELECT 'sesiones', count(*) FROM sesiones
  `))
  console.table(check)
  process.exit(0)
}

main().catch((e) => { console.error("Error:", e); process.exit(1) })
