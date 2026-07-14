# RyM Agente

Agente de conciliación bancaria para contadores (Argentina): concilia extractos bancarios contra el mayor de Tango, procesa resúmenes de tarjeta y retenciones. Next.js 16 + React 19, Postgres (Drizzle ORM), auth con Clerk, OCR/IA con Mistral + OpenAI + Anthropic.

## Requisitos

- Node.js 20+
- Un Postgres (deploy actual: Seenode)
- Cuentas/keys de Clerk, Anthropic, Mistral, OpenAI

## Setup

1. **Variables de entorno** — copiar `.env.example` a `.env.local` y completar. Todas son requeridas salvo `SESSION_BASE`:
   - `DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `ANTHROPIC_API_KEY`, `MISTRAL_API_KEY`, `OPENAI_API_KEY`.

2. **Base de datos (setup fresco)** — crear el schema y aplicar índices/FKs:
   ```bash
   npm run db:push                     # crea tablas + índices + FKs desde lib/db/schema.ts
   node scripts/apply-optimizations.mjs # refuerza índices/FKs (belt-and-suspenders)
   ```
   > ⚠️ **No usar `npm run db:migrate`** — el journal de migraciones de Drizzle está desincronizado en este repo (bug de introspección de `drizzle-kit`). El schema se mantiene vía `db:push` + el script de optimizaciones, no vía `migrate`. Para cambios de schema: editar `lib/db/schema.ts`, correr `db:push`, y agregar los índices/FKs nuevos a `scripts/apply-optimizations.mjs`.

3. **Rol admin** — las operaciones destructivas (reset de la base) requieren rol admin. En el dashboard de Clerk, setear en el usuario elegido:
   ```json
   publicMetadata = { "role": "admin" }
   ```

4. **Dev**:
   ```bash
   npm run dev   # http://localhost:3000
   ```

## Build / Deploy (Seenode)

```bash
npm run build
npm run start   # sirve en $PORT
```

- Build command: `npm run build` · Start command: `npm run start`.
- Setear todas las env vars de `.env.example` en el dashboard de Seenode (`.env.local` no se deploya).
- **Health check:** `GET /api/health` → `200 {"status":"ok"}` (público, sin auth). Devuelve `503` si la DB no responde. Usarlo como liveness/readiness probe.

## Notas de arquitectura

- Middleware de auth en `proxy.ts` (Next.js 16 renombró `middleware.ts` → `proxy.ts`): protege todo salvo `/sign-in` y `/api/health`.
- Rate limiting in-memory (`lib/rate-limit.ts`) en las rutas de OCR/IA — asume instancia única; migrar a Redis/Upstash si se escala a múltiples réplicas.
- Sistema de diseño: ver `DESIGN.md`.
