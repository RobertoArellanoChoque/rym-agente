// ponytail: Map en memoria, instancia única en AWS; cambiar a Redis/Upstash si hay múltiples instancias
const buckets = new Map<string, { n: number; reset: number }>()

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k)
  }
  const b = buckets.get(key)
  if (!b || now > b.reset) {
    buckets.set(key, { n: 1, reset: now + windowMs })
    return true
  }
  return ++b.n <= limit
}

export const ipOf = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
