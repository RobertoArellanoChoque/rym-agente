export type ExcelColumnsConfig = {
  fecha: number
  descripcion: number
  referencia?: number
  debito?: number
  credito?: number
  montoNeto?: number  // single amount column (positive=credit, negative=debit)
  saldo?: number
}

export type BankConfig = {
  id: string
  name: string
  aliases: string[]    // keywords for rule-based detection
  dateFormat: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD"
  decimalSeparator: "," | "."
  thousandSeparator: "." | ","
  extractionSystemPrompt: string | null
  excelColumns?: ExcelColumnsConfig
}
