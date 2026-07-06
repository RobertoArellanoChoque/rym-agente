export type Categoria =
  | "impuesto"
  | "percepcion"
  | "transferencia"
  | "cheque"
  | "comision"
  | "otro"

export type Movimiento = {
  id: string
  fecha: string // ISO YYYY-MM-DD
  descripcion: string
  referencia: string
  monto: number // centavos, positivo=crédito, negativo=débito
  saldo?: number // saldo corriente del extracto
  categoria?: Categoria
}

export type Asiento = {
  id: string
  fecha: string // ISO YYYY-MM-DD
  descripcion: string
  referencia: string
  monto: number // centavos — neto (haber - debe)
  cuenta: string
  debe?: number  // centavos — columna debe original
  haber?: number // centavos — columna haber original
  saldo?: number // centavos — saldo acumulado del mayor
}

export type MatchTipo = "confirmed" | "probable" | "rejected"

export type Match = {
  id?: number             // DB row id (only present after persist)
  movimientoId: string
  asientoId: string
  score: number           // 0-100
  motivo: string
  tipo: MatchTipo
  diferenciaMonto?: number // centavos, si montos difieren
  explicacion?: string    // razón LLM para probables
}

export type TipoDiscrepancia =
  | "en_extracto_no_en_mayor"
  | "en_mayor_no_en_extracto"

export type Discrepancia = {
  tipo: TipoDiscrepancia
  fecha: string
  descripcion: string
  monto: number // centavos
  movimientoId?: string
  asientoId?: string
}

export type ResultadoConciliacion = {
  matches: Match[]
  discrepancias: Discrepancia[]
  movimientos: Movimiento[]
  asientos: Asiento[]
  saldoBanco: number // centavos — del extracto bancario
  saldoMayor: number // centavos — último saldo columna K del mayor Tango
  conceptosPendientes: number // centavos — Σ movimientos banco no contabilizados en Tango
  conceptosPendientesTango: number // centavos — Σ asientos Tango no en banco
  diferencia: number // centavos — 0 = conciliado (fórmula: saldoBanco - saldoMayor - conceptosPendientes + conceptosPendientesTango)
  candidatosAConciliarIds: string[] // ids de discrepancias que explican la diferencia residual
  sumaPartidas?: number // centavos — partidas manuales adicionales
  diferenciaAjustada?: number // centavos — diferencia - sumaPartidas
}

// UI: una conciliación en el cliente (puede haber varias a la vez)
export type ConcStage = "new" | "banco-done" | "tango-done" | "done"
export type ConcBusy = null | "banco" | "tango" | "comparar"

export type ConciliacionUI = {
  id: string            // = sessionId
  label: string
  createdAt: string
  stage: ConcStage
  busy: ConcBusy
  stepIndex: number
  stepLabels: string[]
  bank?: BankDetectionResult
  movimientos: Movimiento[]
  asientos: Asiento[]
  saldoAnterior?: number
  saldoFinal?: number
  resultado?: ResultadoConciliacion | null
  error?: string | null
  wantsTango?: boolean  // efímero: usuario pasó del preview banco al upload tango
  wantsBancoChange?: boolean // efímero: usuario quiere cambiar el extracto
  loaded: boolean       // estado completo traído del backend
}

// Bank detection
export type BankDetectionResult = {
  bankId: string      // "bbva" | "galicia" | "santander" | "unknown"
  bankName: string    // "BBVA" | "Galicia" | "Banco desconocido"
  confidence: "high" | "low"
}

