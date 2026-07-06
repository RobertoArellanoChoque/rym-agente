import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import * as schema from "./schema"

type Drizzle = ReturnType<typeof drizzle<typeof schema>>

// Singleton lazy — no conecta ni exige DATABASE_URL hasta la primera query
// (permite `next build` sin env) y sobrevive hot-reload de Next.js
const g = global as unknown as { _rymDb?: Drizzle }

function getDb(): Drizzle {
  if (!g._rymDb) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error("DATABASE_URL no configurada. Agregala en .env.local")
    // Usar el SESSION pooler de Supabase (puerto 5432), no el transaction pooler (6543):
    // este es un server Node persistente con pool propio; el transaction pooler deadlockea
    // bajo ráfagas concurrentes (Promise.all) sobre conexiones tibias. El transaction pooler
    // (6543) es solo para serverless. En 6543 hay que forzar prepare:false (pgbouncer no lo soporta).
    const isTransactionPooler = url.includes(":6543")
    // max:15 para las ráfagas Promise.all; idle_timeout/max_lifetime reciclan
    // conexiones antes de que Supabase las cierre server-side (evita socket muerto).
    const client = postgres(url, {
      prepare: !isTransactionPooler,
      max: 15,
      idle_timeout: 20,      // segundos
      max_lifetime: 60 * 30, // 30 min
    })
    g._rymDb = drizzle(client, { schema })
  }
  return g._rymDb
}

export const db: Drizzle = new Proxy({} as Drizzle, {
  get(_, prop) {
    const value = getDb()[prop as keyof Drizzle]
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(getDb()) : value
  },
})

export type Db = Drizzle
