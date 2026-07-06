/**
 * Saldo final real de un extracto, robusto al orden de las filas.
 *
 * Algunos bancos (Banco Patagonia) listan los movimientos del MÁS RECIENTE al
 * más viejo. Tomar el saldo de la última fila da el saldo del día más viejo, no
 * el de cierre. Este helper detecta la dirección por fecha (primera vs última
 * fila con saldo) y elige el saldo de la transacción más reciente.
 */
export function saldoFinalPorFecha(
  movs: Array<{ fecha: string; saldo?: number }>,
  saldoFinalAI?: number
): number | undefined {
  const conSaldo = movs.filter((m) => m.saldo != null)
  if (conSaldo.length === 0) return saldoFinalAI
  const primera = conSaldo[0].fecha
  const ultima = conSaldo[conSaldo.length - 1].fecha
  if (primera > ultima) return conSaldo[0].saldo                        // más reciente primero (Patagonia)
  if (primera < ultima) return conSaldo[conSaldo.length - 1].saldo      // más viejo primero (normal)
  return saldoFinalAI ?? conSaldo[conSaldo.length - 1].saldo            // fechas iguales/ambiguo
}

// ── self-check ──  ./node_modules/.bin/tsx lib/extractos/saldo-final.ts
if (process.argv[1] && process.argv[1].endsWith("saldo-final.ts")) {
  const assert = (c: boolean, m: string) => { if (!c) throw new Error("FAIL: " + m) }
  // Reverse-ordered (Patagonia): primera fila = 30/01 saldo 2576, última = 05/01 saldo 917
  assert(saldoFinalPorFecha([{ fecha: "2026-01-30", saldo: 2576 }, { fecha: "2026-01-05", saldo: 917 }]) === 2576, "reverse → primera")
  // Normal: primera = 05/01 saldo 917, última = 31/01 saldo -1112
  assert(saldoFinalPorFecha([{ fecha: "2026-01-05", saldo: 917 }, { fecha: "2026-01-31", saldo: -1112 }]) === -1112, "normal → última")
  // Sin saldo → fallback AI
  assert(saldoFinalPorFecha([{ fecha: "2026-01-30" }], 555) === 555, "sin saldo → AI")
  // Fechas iguales → AI, o última si no hay AI
  assert(saldoFinalPorFecha([{ fecha: "2026-01-30", saldo: 10 }, { fecha: "2026-01-30", saldo: 20 }], 99) === 99, "ambiguo → AI")
  console.log("OK saldo-final.ts — asserts pasaron")
}
