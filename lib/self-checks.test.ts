import { describe, it, expect } from "vitest"
import { execFileSync } from "node:child_process"
import path from "node:path"

// Archivos con self-check standalone (bloque `if (process.argv[1]...)` con
// asserts + console.log("OK...")), confirmados listando lib/conciliacion/ y
// lib/extractos/. Los 10 corren limpio con tsx: contabilizar.ts importa
// @/lib/db, pero el cliente postgres ahí es lazy (Proxy que no conecta ni
// exige DATABASE_URL hasta la primera query real) y su self-check solo
// verifica que las funciones exportadas existan y sean async, sin tocar la DB.
const SELF_CHECK_FILES = [
  "lib/conciliacion/agrupar-categorias.ts",
  "lib/conciliacion/asientos-tango.ts",
  "lib/conciliacion/contabilizar.ts",
  "lib/conciliacion/explicar-gap.ts",
  "lib/conciliacion/periodo.ts",
  "lib/conciliacion/prestamos.ts",
  "lib/extractos/impuestos.ts",
  "lib/extractos/prestamos.ts",
  "lib/extractos/saldo-chain.ts",
  "lib/extractos/saldo-final.ts",
]

const tsx = path.resolve(process.cwd(), "node_modules/.bin/tsx")

describe("self-checks", () => {
  it.each(SELF_CHECK_FILES)("%s corre sin errores (exit 0)", (file) => {
    const out = execFileSync(tsx, [file], { cwd: process.cwd(), encoding: "utf8" })
    expect(out).toMatch(/^OK /m)
  })
})
