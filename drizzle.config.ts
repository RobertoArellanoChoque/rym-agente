import { defineConfig } from "drizzle-kit"

try { process.loadEnvFile(".env.local") } catch { /* env ya cargado */ }

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
