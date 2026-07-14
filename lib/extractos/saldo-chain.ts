import type { Movimiento } from "@/lib/types"

/**
 * Validación y reparación del extracto por cadena de saldos.
 *
 * Cada fila trae un saldo corriente, con DOS convenciones posibles según banco:
 *  - "post": saldo DESPUÉS de la operación → saldo previo = saldo − monto
 *  - "pre":  saldo ANTES de la operación (Banco Patagonia) → saldo siguiente = saldo + monto
 * La convención se detecta automáticamente: gana la que valida más filas.
 *
 * Con la convención detectada, para cada fila:
 *  - condición(monto) cumple → fila OK.
 *  - condición(−monto) cumple → SIGNO INVERTIDO por OCR (columna débito/crédito
 *    confundida, ej: TRANSFERENCIA ENTRE CUENTAS Patagonia 01/2026). Se corrige.
 *  - ninguna → falta la fila vecina (OCR perdió movimientos): inconsistencia.
 *
 * También reconstruye el orden real del extracto encadenando saldos,
 * necesario para agrupar préstamos por adyacencia.
 */

export type ResultadoCadena = {
  movimientos: Movimiento[] // orden reconstruido, signos corregidos
  convencion: "pre" | "post"
  correcciones: Array<{ id: string; descripcion: string; fecha: string; montoAntes: number; montoDespues: number }>
  inconsistencias: Array<{ fecha: string; descripcion: string; saldoVecinoEsperado: number }>
  residual: number // (saldoFinal − saldoAnterior) − Σ montos corregidos; 0 = extracto cierra
}

export function repararConCadenaDeSaldos(
  movimientos: Movimiento[],
  saldoAnterior?: number,
  saldoFinal?: number,
): ResultadoCadena {
  const conSaldo = movimientos.filter(m => m.saldo != null)
  const saldos = new Set<number>(conSaldo.map(m => m.saldo as number))

  // post: el saldo previo (s−m) debe ser el saldo de otra fila o el inicial
  const validaPost = (s: number, m: number) => saldos.has(s - m) || s - m === saldoAnterior
  // pre: el saldo siguiente (s+m) debe ser el saldo de otra fila o el final
  const validaPre = (s: number, m: number) => saldos.has(s + m) || s + m === saldoFinal

  // ── Detectar convención: gana la que valida más filas tal cual vienen ──
  let okPost = 0, okPre = 0
  for (const m of conSaldo) {
    if (validaPost(m.saldo as number, m.monto)) okPost++
    if (validaPre(m.saldo as number, m.monto)) okPre++
  }
  const convencion: "pre" | "post" = okPre > okPost ? "pre" : "post"
  const valida = convencion === "pre" ? validaPre : validaPost

  const correcciones: ResultadoCadena["correcciones"] = []
  const inconsistencias: ResultadoCadena["inconsistencias"] = []

  const corregidos = movimientos.map(m => {
    if (m.saldo == null) return m
    const s = m.saldo
    // ponytail: set-membership, no cadena estricta — si ambas direcciones validan
    // (montos chicos duplicados) gana no-flip: conservador, nunca rompe un
    // extracto sano. Upgrade: encadenado secuencial con backtracking.
    if (valida(s, m.monto)) return m
    if (valida(s, -m.monto)) {
      correcciones.push({ id: m.id, descripcion: m.descripcion, fecha: m.fecha, montoAntes: m.monto, montoDespues: -m.monto })
      return { ...m, monto: -m.monto }
    }
    inconsistencias.push({
      fecha: m.fecha, descripcion: m.descripcion,
      saldoVecinoEsperado: convencion === "pre" ? s + m.monto : s - m.monto,
    })
    return m
  })

  // ── Reconstruir orden real encadenando saldos ──
  // Cada fila tiene un "from" y un "to"; B sigue a A si B.from === A.to.
  //   post: from = saldo − monto, to = saldo
  //   pre:  from = saldo,          to = saldo + monto
  const from = (m: Movimiento) => convencion === "pre" ? (m.saldo as number) : (m.saldo as number) - m.monto
  const to = (m: Movimiento) => convencion === "pre" ? (m.saldo as number) + m.monto : (m.saldo as number)

  const porFrom = new Map<number, Movimiento[]>()
  const tos = new Set<number>()
  for (const m of corregidos) {
    if (m.saldo == null) continue
    const arr = porFrom.get(from(m)) ?? []
    arr.push(m)
    porFrom.set(from(m), arr)
    tos.add(to(m))
  }

  const ordenados: Movimiento[] = []
  const usados = new Set<string>()
  // arranques de cadena: saldoAnterior + todo from que no es el to de otra fila
  const arranques: number[] = []
  if (saldoAnterior != null) arranques.push(saldoAnterior)
  for (const m of corregidos) {
    if (m.saldo == null) continue
    const f = from(m)
    if (!tos.has(f) && f !== saldoAnterior) arranques.push(f)
  }
  for (const inicio of arranques) {
    let cursor: number | undefined = inicio
    while (cursor !== undefined) {
      const candidatos: Movimiento[] = (porFrom.get(cursor) ?? []).filter((m: Movimiento) => !usados.has(m.id))
      const sig: Movimiento | undefined = candidatos[0]
      if (!sig) break
      usados.add(sig.id)
      ordenados.push(sig)
      cursor = to(sig)
    }
  }
  // filas sin saldo o fuera de cadena: al final, en su posición por fecha
  const sueltos = corregidos.filter(m => !usados.has(m.id))
  const resultado = [...ordenados, ...sueltos].sort((a, b) => a.fecha.localeCompare(b.fecha) || 0)
  // ponytail: sort estable por fecha preserva el orden de cadena dentro del día

  const suma = corregidos.reduce((s, m) => s + m.monto, 0)
  const residual = saldoFinal != null && saldoAnterior != null
    ? (saldoFinal - saldoAnterior) - suma
    : 0

  return { movimientos: resultado, convencion, correcciones, inconsistencias, residual }
}

// ── self-check ──  ./node_modules/.bin/tsx lib/extractos/saldo-chain.ts
if (process.argv[1] && process.argv[1].endsWith("saldo-chain.ts")) {
  const assert = (c: boolean, m: string) => { if (!c) throw new Error("FAIL: " + m) }
  const mov = (id: string, monto: number, saldo: number, fecha = "2026-01-15"): Movimiento =>
    ({ id, fecha, descripcion: id, referencia: "", monto, saldo })

  // POST-OP: saldo después de la op. 1000 → +100=1100 → −300=800 → +250=1050
  const post = [mov("a", 100, 1100), mov("b", -300, 800), mov("c", 250, 1050)]
  const r1 = repararConCadenaDeSaldos(post, 1000, 1050)
  assert(r1.convencion === "post", "detecta post-op")
  assert(r1.correcciones.length === 0 && r1.inconsistencias.length === 0, "post limpia sin correcciones")
  assert(r1.residual === 0 && r1.movimientos.map(m => m.id).join("") === "abc", "post: cierra y ordena")

  // POST-OP con signo invertido: b debería ser −300 pero OCR lo puso +300
  const postInv = [mov("a", 100, 1100), mov("b", 300, 800), mov("c", 250, 1050)]
  const r2 = repararConCadenaDeSaldos(postInv, 1000, 1050)
  assert(r2.correcciones.length === 1 && r2.movimientos.find(m => m.id === "b")!.monto === -300, "post: flip aplicado")
  assert(r2.residual === 0, "post: cierra tras flip")

  // PRE-OP (Patagonia): saldo ANTES de la op. a(+100) desde 1000, b(−300) desde 1100, c(+250) desde 800 → final 1050
  const pre = [mov("a", 100, 1000), mov("b", -300, 1100), mov("c", 250, 800)]
  const r3 = repararConCadenaDeSaldos(pre, 1000, 1050)
  assert(r3.convencion === "pre", "detecta pre-op")
  assert(r3.correcciones.length === 0 && r3.inconsistencias.length === 0, "pre limpia sin correcciones")
  assert(r3.movimientos.map(m => m.id).join("") === "abc", "pre: ordena por cadena")

  // PRE-OP con signo invertido: b real −300, OCR +300 → 1100+300=1400 ∉; 1100−300=800 ∈ → flip
  const preInv = [mov("a", 100, 1000), mov("b", 300, 1100), mov("c", 250, 800)]
  const r4 = repararConCadenaDeSaldos(preInv, 1000, 1050)
  assert(r4.convencion === "pre", "pre-inv: detecta pre-op")
  assert(r4.correcciones.length === 1 && r4.movimientos.find(m => m.id === "b")!.monto === -300, "pre: flip aplicado")
  assert(r4.residual === 0, "pre: cierra tras flip")

  // PRE-OP: crédito legítimo NO se flipea (el bug que motivó la detección)
  const preCredito = [mov("deb", -50, 1000), mov("cred", 200, 950), mov("deb2", -30, 1150)]
  const r5 = repararConCadenaDeSaldos(preCredito, 1000, 1120)
  assert(r5.correcciones.length === 0, "pre: crédito legítimo intacto")

  // Fila perdida detectada (post): d cuelga sin vecino
  const conHueco = [mov("a", 100, 1100), mov("d", 30, 1110)]
  const r6 = repararConCadenaDeSaldos(conHueco, 1000, 1110)
  assert(r6.inconsistencias.length === 1, "detecta hueco OCR")
  assert(r6.residual === (1110 - 1000) - 130, "residual reporta lo que falta")

  console.log("OK saldo-chain.ts — todos los asserts pasaron")
}
