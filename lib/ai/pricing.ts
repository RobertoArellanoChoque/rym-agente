// Precios en USD por MTok. Actualizar si cambian tarifas.
// Fuente: páginas de pricing de cada proveedor — revisado 2026-07-01
const PRICING: Record<string, { in: number; out: number }> = {
  "claude-sonnet-4-6":    { in: 3,   out: 15  },
  "mistral-large-latest": { in: 2,   out: 6   },
  "gpt-4o":               { in: 2.5, out: 10  },
}

// Retorna micro-USD (divide por 1_000_000 para obtener USD)
export function calcCosto(modelo: string, tokensIn: number, tokensOut: number): number {
  const p = PRICING[modelo]
  if (!p) return 0
  return Math.round(tokensIn * p.in + tokensOut * p.out)
}
