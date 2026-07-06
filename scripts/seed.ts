/**
 * Siembra las tarjetas maestras en Supabase (idempotente).
 *   npm run db:seed
 *
 * La lista fuente vive en lib/tarjetas/catalog.ts (TARJETAS_MAESTRAS).
 * Insert con ON CONFLICT (nombre) DO NOTHING — re-correr no duplica ni pisa ediciones.
 */
import { seedTarjetasMaestras } from "@/lib/tarjetas/catalog"
import { db } from "@/lib/db"
import { tarjetasMaestras } from "@/lib/db/schema"

process.loadEnvFile(".env.local")

async function main() {
  await seedTarjetasMaestras()
  const rows = await db.select().from(tarjetasMaestras)
  console.log(`✓ tarjetas_maestras en Supabase: ${rows.length}`)
  process.exit(0)
}

main().catch((e) => { console.error("Error sembrando:", e); process.exit(1) })
