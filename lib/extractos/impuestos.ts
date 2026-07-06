import type { Categoria } from "@/lib/types"

// Lista cerrada de buckets de impuestos/gastos que maneja RyM.
// El orden de las claves importa: el primero que matchea gana (ver clasificarImpuesto).
export type BucketImpuesto =
  | "Percepción IVA"
  | "IVA"
  | "Gastos bancarios"
  | "Impuesto Ley crédito"
  | "Impuesto Ley débito"
  | "SICREP"
  | "Ingresos Brutos CABA"
  | "Retención Ingresos Brutos"
  | "Sellos"

// ponytail: los keywords son la perilla de calibración. Las leyendas varían por
// banco (BBVA vs Santander escriben distinto); se ajustan acá sin tocar lógica.
// Orden = prioridad: los específicos ANTES que los genéricos (Percepción IVA
// antes que IVA; CABA antes que Retención IIBB).
const KW: Array<[BucketImpuesto, string[]]> = [
  ["Percepción IVA", ["perc iva", "percep iva", "perc.iva", "percepcion iva", "perc. iva"]],
  ["Ingresos Brutos CABA", ["iibb caba", "ib caba", "agip", "ingresos brutos caba", "ing.brutos caba", "ingr.brutos caba"]],
  ["Retención Ingresos Brutos", ["ret iibb", "ret.iibb", "retencion ingresos brutos", "ret ing.brutos", "ret.ing.brutos", "arba", "dgr", "iibb", "ingr.brutos", "ingresos brutos"]],
  ["Sellos", ["sellos", "imp.sellos", "impuesto de sellos", "sello"]],
  ["SICREP", ["sicrep"]],
  ["Gastos bancarios", ["comision", "mantenimiento", "cargo", "servicio", "arancel", "gasto"]],
  ["IVA", ["iva", "i.v.a", "valor agregado"]],
]

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

const KW_LEY = ["ley 25413", "imp.ley", "impuesto ley", "25413", "imp ley", "ley nro", "ley.25413"]

/**
 * Clasifica una leyenda en uno de los 9 buckets, o null si no es impuesto/gasto.
 * `monto` en centavos (positivo=crédito, negativo=débito) — usado para partir
 * el Impuesto Ley 25413 en crédito/débito.
 */
export function clasificarImpuesto(descripcion: string, monto: number): BucketImpuesto | null {
  const t = normalizar(descripcion)

  // Impuesto Ley 25413 tiene prioridad de detección propia por el split cred/deb.
  if (KW_LEY.some((kw) => t.includes(kw))) {
    if (t.includes("cred")) return "Impuesto Ley crédito"
    if (t.includes("deb")) return "Impuesto Ley débito"
    // Fallback por signo: crédito = ingreso (+), débito = egreso (−)
    return monto >= 0 ? "Impuesto Ley crédito" : "Impuesto Ley débito"
  }

  for (const [bucket, keywords] of KW) {
    if (keywords.some((kw) => t.includes(kw))) return bucket
  }
  return null
}

/**
 * Clave de agrupación única para banco y mayor. Impuesto → bucket fino;
 * el resto (no-impuesto) → label legible de su Categoria.
 */
const CATEGORIA_LABEL: Record<Categoria, string> = {
  impuesto: "Otros impuestos",
  percepcion: "Otras percepciones",
  transferencia: "Transferencias",
  cheque: "Cheques",
  comision: "Gastos bancarios",
  otro: "Otros",
}

export function bucketConcepto(descripcion: string, monto: number, categoria?: Categoria): string {
  const bucket = clasificarImpuesto(descripcion, monto)
  if (bucket) return bucket
  return CATEGORIA_LABEL[categoria ?? "otro"]
}

export type AcumuladoBucket = { bucket: string; total: number; n: number }

/** Acumula ítems por bucket de impuesto (montos en centavos). Ordena por |total| desc. */
export function acumularPorBucket(
  items: Array<{ descripcion: string; monto: number; categoria?: Categoria }>
): AcumuladoBucket[] {
  const map = new Map<string, AcumuladoBucket>()
  for (const it of items) {
    const bucket = bucketConcepto(it.descripcion, it.monto, it.categoria)
    const prev = map.get(bucket)
    if (prev) { prev.total += it.monto; prev.n += 1 }
    else map.set(bucket, { bucket, total: it.monto, n: 1 })
  }
  return [...map.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
}

// ── self-check ────────────────────────────────────────────────────────────
// Corre con: npx tsx lib/extractos/impuestos.ts
if (process.argv[1] && process.argv[1].endsWith("impuestos.ts")) {
  const assert = (c: boolean, msg: string) => { if (!c) { throw new Error("FAIL: " + msg) } }

  assert(clasificarImpuesto("IVA RG 2408", -100) === "IVA", "IVA")
  assert(clasificarImpuesto("PERC IVA CABA", -50) === "Percepción IVA", "Percepción IVA no debe caer en IVA")
  assert(clasificarImpuesto("IMP LEY 25413 DEBITO", -30) === "Impuesto Ley débito", "Ley débito por keyword")
  assert(clasificarImpuesto("IMP LEY 25413 CREDITO", 30) === "Impuesto Ley crédito", "Ley crédito por keyword")
  assert(clasificarImpuesto("IMPUESTO LEY 25413", -30) === "Impuesto Ley débito", "Ley por signo negativo → débito")
  assert(clasificarImpuesto("IMPUESTO LEY 25413", 30) === "Impuesto Ley crédito", "Ley por signo positivo → crédito")
  assert(clasificarImpuesto("SICREP RETENCION", -10) === "SICREP", "SICREP")
  assert(clasificarImpuesto("IIBB CABA AGIP", -10) === "Ingresos Brutos CABA", "IIBB CABA")
  assert(clasificarImpuesto("RET IIBB ARBA", -10) === "Retención Ingresos Brutos", "Ret IIBB")
  assert(clasificarImpuesto("IMP SELLOS", -10) === "Sellos", "Sellos")
  assert(clasificarImpuesto("COMISION MANTENIMIENTO CUENTA", -10) === "Gastos bancarios", "Gastos bancarios")
  assert(clasificarImpuesto("TRANSFERENCIA CBU 123", 5000) === null, "no-impuesto → null")

  const acc = acumularPorBucket([
    { descripcion: "IVA RG 2408", monto: -100 },
    { descripcion: "iva percep? no", monto: -200 }, // "iva" → IVA
    { descripcion: "TRANSFERENCIA", monto: 5000, categoria: "transferencia" },
  ])
  const iva = acc.find((a) => a.bucket === "IVA")
  assert(iva !== undefined && iva.total === -300 && iva.n === 2, "acumula 2 IVA = -300")

  console.log("OK impuestos.ts — todos los asserts pasaron")
}
