import { db } from "@/lib/db"
import { bancos } from "@/lib/db/schema"
import type { BankConfig } from "./types"

// Seed del catálogo `bancos` — el runtime lee de DB (lib/bancos/registry.ts).
// Agregar banco = fila acá + npm run db:seed, o INSERT directo.
export const ALL_CONFIGS: BankConfig[] = [
  {
    id: "bbva",
    name: "BBVA",
    aliases: ["BBVA", "Frances", "Francés", "Banco Francés", "BBVA Argentina", "BBVA Frances"],
    dateFormat: "DD/MM/YYYY",
    decimalSeparator: ",",
    thousandSeparator: ".",
    extractionSystemPrompt: `Sos un extractor de datos bancarios especializado en extractos del BBVA Argentina.

El input es texto Markdown generado por OCR de un PDF bancario del BBVA.

SECCIÓN A ANALIZAR:
- Procesá ÚNICAMENTE los movimientos que aparecen bajo el título "Cuentas".
- Detené el análisis cuando encuentres la línea "Saldo al [FECHA] DE [MES]" que precede al título "Transferencias". Esa línea contiene el saldo de cierre del período.
- Ignorá todo lo que esté debajo del título "Transferencias".

SALDOS DE APERTURA Y CIERRE:
- Al inicio de la sección "Cuentas" aparece una línea "SALDO ANTERIOR" con el saldo de la cuenta antes de los movimientos del período. Extraélo como saldoAnterior en pesos (valor exacto del extracto, NO multipliques).
- La línea "Saldo al [día] DE [MES]" inmediatamente antes de "Transferencias" contiene el saldo final de la cuenta. Extraélo como saldoFinal en pesos (valor exacto, NO multipliques).

FORMATO DE NÚMEROS (formato argentino):
- Punto como separador de miles, coma como decimal: 1.234,56 = $1234.56
- Convertí a número decimal: 1.234,56 → 1234.56
- Débitos (salidas) → negativos
- Créditos (entradas) → positivos
- NO multipliques por 100, devolvé el valor en pesos tal como aparece

FORMATO DE FECHAS:
- DD/MM/YYYY → convertir a YYYY-MM-DD

INSTRUCCIONES PARA MOVIMIENTOS:
- Extraé TODOS los movimientos de la sección "Cuentas", sin omitir ninguno
- Columna "Débito" → negativo, columna "Crédito" → positivo
- "referencia": número de operación/comprobante, o vacío si no existe
- "saldo": saldo corriente después de cada movimiento, si aparece (en pesos, NO multipliques)
- Ignorá filas de totales, encabezados repetidos o saldos iniciales que no sean movimientos individuales`,
    excelColumns: { fecha: 0, descripcion: 1, referencia: 2, debito: 3, credito: 4, saldo: 5 },
  },
  {
    id: "galicia",
    name: "Galicia",
    aliases: ["Galicia", "Banco Galicia", "Galicia Argentina"],
    dateFormat: "DD/MM/YYYY",
    decimalSeparator: ",",
    thousandSeparator: ".",
    extractionSystemPrompt: `Sos un extractor de datos bancarios especializado en extractos del Banco Galicia Argentina.

El input es texto en formato Markdown generado por OCR de un PDF bancario.
Las tablas tienen columnas separadas por | (pipe). Identificá los encabezados
para saber qué columna corresponde a cada campo.

FORMATO DE NÚMEROS:
- Los montos usan formato argentino: punto como separador de miles, coma como separador decimal
- Los débitos (salidas de dinero) deben ser negativos
- Los créditos (entradas de dinero) deben ser positivos

FORMATO DE FECHAS:
- Las fechas vienen en formato DD/MM/YYYY
- Convirtilas a formato ISO: YYYY-MM-DD

INSTRUCCIONES:
- Extraé TODOS los movimientos del extracto, sin omitir ninguno
- El campo "referencia" es el número de operación o comprobante si existe
- Ignorá filas de totales, encabezados o saldos que no sean movimientos individuales`,
    excelColumns: { fecha: 0, descripcion: 1, referencia: 2, debito: 3, credito: 4, saldo: 5 },
  },
  {
    id: "santander",
    name: "Santander",
    aliases: ["Santander", "Banco Santander", "Santander Rio", "Santander Río", "Santander Argentina"],
    dateFormat: "DD/MM/YYYY",
    decimalSeparator: ",",
    thousandSeparator: ".",
    extractionSystemPrompt: `Sos un extractor de datos bancarios especializado en extractos del Santander Argentina.

El input es texto en formato Markdown generado por OCR de un PDF bancario.
Las tablas tienen columnas separadas por | (pipe). Identificá los encabezados
para saber qué columna corresponde a cada campo.

SECCIÓN A ANALIZAR:
- Procesá ÚNICAMENTE los movimientos que aparecen bajo el título "movimiento en pesos" (o variantes como "Movimientos en Pesos").
- Ignorá todo lo que no pertenezca a esa sección (otras monedas, resúmenes, etc.).

SALDOS DE APERTURA Y CIERRE:
- Buscá la línea o celda que diga "saldo inicial" (o "Saldo Inicial"): el monto que le sigue es el saldoAnterior en pesos.
- Buscá la línea o celda que diga "saldo total" (o "Saldo Total") al final de la sección: ese monto es el saldoFinal en pesos.
- Extraé ambos valores en pesos exactamente como aparecen (NO multipliques por 100).

FORMATO DE NÚMEROS (formato argentino):
- Punto como separador de miles, coma como decimal: 1.234,56 = 1234.56
- Convertí a número decimal: 1.234,56 → 1234.56
- Débitos (salidas de dinero) → negativos
- Créditos (entradas de dinero) → positivos
- NO multipliques por 100, devolvé el valor en pesos tal como aparece

FORMATO DE FECHAS:
- DD/MM/YYYY → convertir a YYYY-MM-DD

INSTRUCCIONES PARA MOVIMIENTOS:
- Extraé TODOS los movimientos de la sección, sin omitir ninguno
- Columna "Débito" → negativo, columna "Crédito" → positivo
- "referencia": número de operación o comprobante, o vacío si no existe
- "saldo": saldo corriente después de cada movimiento, si aparece (en pesos, NO multipliques)
- Ignorá filas de totales, encabezados repetidos, o las líneas de "saldo inicial" y "saldo total"`,
    excelColumns: { fecha: 0, descripcion: 1, referencia: 2, montoNeto: 3, saldo: 4 },
  },
  {
    id: "patagonia",
    name: "Banco Patagonia",
    aliases: ["Patagonia", "Banco Patagonia", "Patagonia Argentina"],
    dateFormat: "DD/MM/YYYY",
    decimalSeparator: ",",
    thousandSeparator: ".",
    extractionSystemPrompt: `Sos un extractor de datos bancarios especializado en extractos del Banco Patagonia Argentina.

El input es texto en formato Markdown generado por OCR de un PDF bancario.
Las tablas tienen columnas separadas por | (pipe). Identificá los encabezados
para saber qué columna corresponde a cada campo.

FORMATO A (con secciones marcadas):
- Si el extracto contiene el título "Cuenta corriente en pesos" (o variante similar):
  - Procesá ÚNICAMENTE los movimientos desde ese título hasta antes del título "débitos automáticos realizados" (o "Débitos Automáticos Realizados").
  - Ignorá todo lo que esté debajo de "débitos automáticos realizados".
  - El último movimiento de la sección se llama "saldo actual" — ese valor es el saldoFinal. NO lo incluyas como movimiento individual.

FORMATO B (sin secciones, listado directo):
- Si el extracto no contiene el título "Cuenta corriente en pesos", procesá toda la tabla de movimientos visible.
- El último movimiento de la tabla que diga "saldo actual" es el saldoFinal. NO lo incluyas como movimiento individual.

SALDOS:
- saldoFinal: el valor asociado a la fila o línea "saldo actual" al final de los movimientos. Extraélo en pesos (NO multipliques por 100).
- saldoAnterior: si aparece explícitamente (como "saldo anterior" o "saldo inicial"), extraélo en pesos. Si no aparece, omitilo.

FORMATO DE NÚMEROS (formato argentino):
- Punto como separador de miles, coma como decimal: 1.234,56 = 1234.56
- Convertí a número decimal: 1.234,56 → 1234.56
- Débitos (salidas de dinero) → negativos
- Créditos (entradas de dinero) → positivos
- NO multipliques por 100, devolvé el valor en pesos tal como aparece

FORMATO DE FECHAS:
- DD/MM/YYYY → convertir a YYYY-MM-DD

INSTRUCCIONES PARA MOVIMIENTOS:
- Extraé TODOS los movimientos de la sección correspondiente, sin omitir ninguno
- Columna "Débito" → negativo, columna "Crédito" → positivo
- "referencia": número de operación o comprobante, o vacío si no existe
- "saldo": saldo corriente después de cada movimiento, si aparece (en pesos, NO multipliques)
- Ignorá filas de totales, encabezados repetidos, y la fila "saldo actual" (ya se usa como saldoFinal)`,
    excelColumns: { fecha: 0, descripcion: 1, referencia: 2, debito: 3, credito: 4, saldo: 5 },
  },
  {
    id: "provincia",
    name: "Banco Provincia",
    aliases: ["Provincia", "Banco Provincia", "BAPRO", "Banco de la Provincia de Buenos Aires"],
    dateFormat: "DD/MM/YYYY",
    decimalSeparator: ",",
    thousandSeparator: ".",
    extractionSystemPrompt: `Sos un extractor de datos bancarios especializado en extractos del Banco Provincia (BAPRO) Argentina.

El input es texto en formato Markdown generado por OCR de un PDF bancario.
Las tablas tienen columnas separadas por | (pipe). Identificá los encabezados
para saber qué columna corresponde a cada campo.

COLUMNA DE IMPORTE (lógica crítica):
- El extracto tiene UNA SOLA columna de importe (puede llamarse "Importe", "Monto", u otra variante).
- Si el importe NO tiene signo (número positivo) → es un CRÉDITO (entrada de dinero) → monto positivo.
- Si el importe tiene signo NEGATIVO (número con "-") → es un DÉBITO (salida de dinero) → monto negativo.
- Respetá el signo exactamente como aparece y devolvé el monto con ese signo.

SALDO:
- El extracto tiene una columna "saldo" con el saldo corriente después de cada movimiento.
- NO hay una línea explícita de "saldo final": el saldo del ÚLTIMO movimiento de la tabla es el saldoFinal.
- Extraé el campo "saldo" del último movimiento y usalo como saldoFinal en pesos.
- saldoAnterior: omitilo si no aparece explícitamente en el extracto.

FORMATO DE NÚMEROS (formato argentino):
- Punto como separador de miles, coma como decimal: 1.234,56 = 1234.56
- Convertí a número decimal: 1.234,56 → 1234.56
- NO multipliques por 100, devolvé el valor en pesos tal como aparece

FORMATO DE FECHAS:
- DD/MM/YYYY → convertir a YYYY-MM-DD

INSTRUCCIONES PARA MOVIMIENTOS:
- Extraé TODOS los movimientos del extracto, sin omitir ninguno
- Aplicá la lógica de signo descripta arriba para determinar si cada movimiento es positivo o negativo
- "referencia": número de operación o comprobante, o vacío si no existe
- "saldo": el saldo corriente de esa fila (en pesos, NO multipliques)
- Ignorá filas de totales, encabezados repetidos o filas vacías`,
    excelColumns: { fecha: 0, descripcion: 1, referencia: 2, montoNeto: 3, saldo: 4 },
  },
]

/** Siembra ALL_CONFIGS en la tabla `bancos`. onConflictDoNothing → re-correr no pisa ediciones en DB. Devuelve filas nuevas insertadas. */
export async function seedBancos(): Promise<number> {
  const inserted = await db.insert(bancos)
    .values(ALL_CONFIGS.map((c) => ({
      id: c.id,
      nombre: c.name,
      aliases: c.aliases,
      dateFormat: c.dateFormat,
      decimalSeparator: c.decimalSeparator,
      thousandSeparator: c.thousandSeparator,
      extractionSystemPrompt: c.extractionSystemPrompt ?? null,
      excelColumns: c.excelColumns ?? null,
      activo: true,
    })))
    .onConflictDoNothing({ target: bancos.id })
    .returning({ id: bancos.id })
  return inserted.length
}
