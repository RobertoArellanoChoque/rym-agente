// Agrupa líneas de préstamo (por grupoId) y resuelve su asiento en Tango.
// Compartido por el tool del agente (server, formatea a strings) y ResultTable
// (client, usa los objetos crudos). Genérico sobre filas DB o tipos de dominio.
type PrestamoMov = { id: string; grupoId?: string | null; categoria?: string | null; fecha: string; monto: number; descripcion: string }
type PrestamoMatch = { movimientoId: string; asientoId: string; tipo: string }
type PrestamoAsiento = { id: string; fecha: string; descripcion: string }

export function agruparPrestamos<M extends PrestamoMov, Mt extends PrestamoMatch, A extends PrestamoAsiento>(
  movimientos: M[],
  matches: Mt[],
  asientos: A[]
): { fecha: string; amort?: M; impuestos: M[]; items: M[]; total: number; asiento?: A }[] {
  const porGrupo = new Map<string, M[]>()
  for (const m of movimientos) {
    if (!m.grupoId) continue
    const arr = porGrupo.get(m.grupoId) ?? []
    arr.push(m)
    porGrupo.set(m.grupoId, arr)
  }
  const matchByMov = new Map(matches.filter(mt => mt.tipo !== "rejected").map(mt => [mt.movimientoId, mt]))
  const asiById = new Map(asientos.map(a => [a.id, a]))

  return [...porGrupo.values()]
    .map(items => {
      const amort = items.find(i => i.categoria === "prestamo")
      const mt = amort ? matchByMov.get(amort.id) : undefined
      const asiento = mt ? asiById.get(mt.asientoId) : undefined
      return {
        fecha: amort?.fecha ?? items[0].fecha,
        amort,
        impuestos: items.filter(i => i.categoria === "prestamo_iva"),
        items,
        total: items.reduce((s, i) => s + i.monto, 0),
        asiento,
      }
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
}

// ── self-check ──  ./node_modules/.bin/tsx lib/conciliacion/prestamos.ts
if (process.argv[1] && process.argv[1].endsWith("prestamos.ts")) {
  const assert = (c: boolean, m: string) => { if (!c) throw new Error("FAIL: " + m) }
  const mov = (id: string, grupoId: string | null, categoria: string | null, fecha: string, monto: number) =>
    ({ id, grupoId, categoria, fecha, monto, descripcion: id })

  const movs = [
    mov("a1", "g1", "prestamo", "2026-02-10", -100000),
    mov("i1", "g1", "prestamo_iva", "2026-02-10", -21000),
    mov("a2", "g2", "prestamo", "2026-01-05", -50000),
    mov("x1", null, "otro", "2026-03-01", -9999), // sin grupo → ignorado
  ]
  const matches = [
    { movimientoId: "a1", asientoId: "as1", tipo: "confirmed" },
    { movimientoId: "a2", asientoId: "as2", tipo: "rejected" }, // rejected → no cuenta
  ]
  const asientos = [{ id: "as1", fecha: "2026-02-11", descripcion: "AJUSTE PRESTAMO" }]

  const r = agruparPrestamos(movs, matches, asientos)
  assert(r.length === 2, "2 grupos (x1 sin grupoId excluido)")
  assert(r[0].fecha === "2026-01-05", "ordenado por fecha asc (g2 primero)")
  const g1 = r.find(g => g.amort?.id === "a1")!
  assert(g1.impuestos.length === 1 && g1.total === -121000, "g1: 1 impuesto, total suma amort+iva")
  assert(g1.asiento?.id === "as1", "g1 resuelve asiento via match confirmado")
  const g2 = r.find(g => g.amort?.id === "a2")!
  assert(g2.asiento === undefined, "g2: match rejected → sin asiento")
  console.log("OK prestamos.ts — todos los asserts pasaron")
}
