import type { Categoria } from "@/lib/types"

const RULES: Array<{ categoria: Categoria; keywords: string[] }> = [
  {
    categoria: "impuesto",
    keywords: ["afip", "arba", "agip", "iva", "iibb", "ganancias", "retencion imp", "suss", "dgr", "rentas", "impuesto", "imp.ley", "ley nro", "ingr.brutos", "ret.", "retencion"],
  },
  {
    categoria: "percepcion",
    keywords: ["percepcion", "percep", "perc.", "per.ingr", "perc.caba", "perc.iibb", "ing.brutos perc"],
  },
  {
    categoria: "transferencia",
    keywords: ["transferencia", "tef ", "cbu", "acreditacion", "debito inmediato", "interbank", "echeq", "debin"],
  },
  {
    categoria: "cheque",
    keywords: ["cheque", " chq", "chq."],
  },
  {
    categoria: "comision",
    keywords: ["comision", "mantenimiento", "costo servicio", "cargo", "cuota", "arancel"],
  },
]

export function categorizarMovimiento(descripcion: string): Categoria {
  const lower = descripcion
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
  for (const { categoria, keywords } of RULES) {
    if (keywords.some((kw) => lower.includes(kw))) return categoria
  }
  return "otro"
}

export function normalizeConcepto(descripcion: string): string {
  return descripcion
    .toUpperCase()
    .replace(/\b\d{1,2}\/\d{2,4}\b/g, "")  // strip dates like 01/26, 12/2025
    .replace(/\s{2,}/g, " ")
    .trim()
}
