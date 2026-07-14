import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

// Fixed-window rate limit sobre Postgres (multi-instancia, Seenode no tiene Redis gestionado).
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  // reset se calcula en Postgres (now() + intervalo) para que todo el cálculo de tiempo
  // viva en un solo reloj — antes se mezclaba Date.now() (JS) con now() (Postgres).
  const rows = await db.execute<{ n: number }>(sql`
    INSERT INTO rate_limits (key, n, reset) VALUES (${key}, 1, now() + ${windowMs} * interval '1 millisecond')
    ON CONFLICT (key) DO UPDATE SET
      n = CASE WHEN rate_limits.reset < now() THEN 1 ELSE rate_limits.n + 1 END,
      reset = CASE WHEN rate_limits.reset < now() THEN now() + ${windowMs} * interval '1 millisecond' ELSE rate_limits.reset END
    RETURNING n
  `)
  const n = Number(rows[0]?.n ?? 1)

  // ponytail: cleanup probabilístico fire-and-forget, no bloquea la respuesta
  if (Math.random() < 0.01) {
    db.execute(sql`DELETE FROM rate_limits WHERE reset < now()`).catch(() => {})
  }

  return n <= limit
}

export const ipOf = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
