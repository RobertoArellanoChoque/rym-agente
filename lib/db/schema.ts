import { pgTable, text, integer, bigint, serial, jsonb, index } from "drizzle-orm/pg-core"

// Montos en centavos ARS → bigint (int4 desborda a ~$21M ARS)
const centavos = (name: string) => bigint(name, { mode: "number" })

export const conciliaciones = pgTable("conciliaciones", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  stage: text("stage").notNull().default("new"), // new|banco-done|tango-done|done
  bancoId: text("banco_id"),
  bancoNombre: text("banco_nombre"),
  bancoConfidence: text("banco_confidence"), // high|low
  saldoAnterior: centavos("saldo_anterior"),
  saldoFinal: centavos("saldo_final"),
  movimientosCount: integer("movimientos_count"),
  asientosCount: integer("asientos_count"),
  saldoBanco: centavos("saldo_banco"),
  saldoMayor: centavos("saldo_mayor"),
  diferencia: centavos("diferencia"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [
  index("conciliaciones_created_at_idx").on(t.createdAt),
  index("conciliaciones_updated_at_idx").on(t.updatedAt),
])

export const movimientos = pgTable("movimientos", {
  id: text("id").primaryKey(),
  conciliacionId: text("conciliacion_id").notNull().references(() => conciliaciones.id, { onDelete: "cascade" }),
  fecha: text("fecha").notNull(),
  descripcion: text("descripcion").notNull(),
  referencia: text("referencia").notNull().default(""),
  monto: centavos("monto").notNull(),
  saldo: centavos("saldo"),
  categoria: text("categoria"), // impuesto|percepcion|transferencia|cheque|comision|otro
}, (t) => [
  index("movimientos_conciliacion_id_idx").on(t.conciliacionId),
])

export const asientos = pgTable("asientos", {
  id: text("id").primaryKey(),
  conciliacionId: text("conciliacion_id").notNull().references(() => conciliaciones.id, { onDelete: "cascade" }),
  fecha: text("fecha").notNull(),
  descripcion: text("descripcion").notNull(),
  referencia: text("referencia").notNull().default(""),
  monto: centavos("monto").notNull(),
  cuenta: text("cuenta").notNull(),
  debe: centavos("debe"),
  haber: centavos("haber"),
  saldo: centavos("saldo"),
}, (t) => [
  index("asientos_conciliacion_id_idx").on(t.conciliacionId),
])

export const matches = pgTable("matches", {
  id: serial("id").primaryKey(),
  conciliacionId: text("conciliacion_id").notNull().references(() => conciliaciones.id, { onDelete: "cascade" }),
  movimientoId: text("movimiento_id").notNull().references(() => movimientos.id, { onDelete: "cascade" }),
  asientoId: text("asiento_id").notNull().references(() => asientos.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  motivo: text("motivo").notNull(),
  tipo: text("tipo").notNull().default("confirmed"), // confirmed|probable|rejected
  diferenciaMonto: centavos("diferencia_monto"),
  explicacion: text("explicacion"),
}, (t) => [
  index("matches_conciliacion_id_idx").on(t.conciliacionId),
  index("matches_movimiento_id_idx").on(t.movimientoId),
  index("matches_asiento_id_idx").on(t.asientoId),
])

export const discrepancias = pgTable("discrepancias", {
  id: serial("id").primaryKey(),
  conciliacionId: text("conciliacion_id").notNull().references(() => conciliaciones.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull(), // en_extracto_no_en_mayor|en_mayor_no_en_extracto
  fecha: text("fecha").notNull(),
  descripcion: text("descripcion").notNull(),
  monto: centavos("monto").notNull(),
  movimientoId: text("movimiento_id").references(() => movimientos.id, { onDelete: "set null" }),
  asientoId: text("asiento_id").references(() => asientos.id, { onDelete: "set null" }),
}, (t) => [
  index("discrepancias_conciliacion_id_idx").on(t.conciliacionId),
])

export const saldosBanco = pgTable("saldos_banco", {
  bancoId: text("banco_id").primaryKey(),
  bancoNombre: text("banco_nombre").notNull(),
  ultimoSaldo: centavos("ultimo_saldo").notNull(),
  ultimaFecha: text("ultima_fecha").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull().default("auto"),
  saldoConciliado: centavos("saldo_conciliado"),
  fechaConciliacion: text("fecha_conciliacion"),
})

export const partidas = pgTable("partidas", {
  id: text("id").primaryKey(),
  bancoId: text("banco_id").notNull(),
  descripcion: text("descripcion").notNull(),
  monto: centavos("monto").notNull(),
  fecha: text("fecha").notNull(),
}, (t) => [
  index("partidas_banco_id_idx").on(t.bancoId),
])

export const tarjetasMaestras = pgTable("tarjetas_maestras", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull().unique(),
  banco: text("banco").notNull(),
  tipo: text("tipo").notNull(), // VISA | MASTERCARD | AMEX
  activa: integer("activa").notNull().default(1),
})

export const resumenTarjetas = pgTable("resumen_tarjetas", {
  id: text("id").primaryKey(),
  nombreTarjeta: text("nombre_tarjeta").notNull(),
  periodo: text("periodo").notNull().default(""),
  totalMonto: centavos("total_monto").notNull().default(0),
  tarjetaMaestraId: text("tarjeta_maestra_id").references(() => tarjetasMaestras.id, { onDelete: "set null" }),
  creadoEn: text("creado_en").notNull(),
}, (t) => [
  index("resumen_tarjetas_creado_en_idx").on(t.creadoEn),
])

export const lineasTarjeta = pgTable("lineas_tarjeta", {
  id: text("id").primaryKey(),
  resumenId: text("resumen_id").notNull().references(() => resumenTarjetas.id, { onDelete: "cascade" }),
  cuenta: text("cuenta").notNull().default(""),
  descripcion: text("descripcion").notNull(),
  monto: centavos("monto").notNull().default(0),
  periodo: text("periodo").notNull().default(""),
  estado: text("estado").notNull().default(""),
  tipoLinea: text("tipo_linea").notNull().default("cargo"), // cargo | impuesto | devolucion
}, (t) => [
  index("lineas_tarjeta_resumen_id_idx").on(t.resumenId),
])

export const retencionesArca = pgTable("retenciones_arca", {
  id: text("id").primaryKey(),
  loteId: text("lote_id").notNull(),
  jurisdiccion: text("jurisdiccion").notNull(), // "nacional" | "caba" | "otra"
  cuitAgente: text("cuit_agente").notNull(),
  fechaRetencion: text("fecha_retencion").notNull(), // YYYY-MM-DD
  tipo: text("tipo").notNull(),
  letra: text("letra").notNull(),
  nroComprobante: text("nro_comprobante").notNull(),
  nroComprOrigen: text("nro_compr_origen").notNull().default(""),
  importe: centavos("importe").notNull(), // centavos
  creadoEn: text("creado_en").notNull(),
}, (t) => [
  index("retenciones_arca_creado_en_idx").on(t.creadoEn),
])

export const retencionesTango = pgTable("retenciones_tango", {
  id: text("id").primaryKey(),
  loteId: text("lote_id").notNull(),
  codCta: text("cod_cta").notNull(),
  descCta: text("desc_cta").notNull(),
  fecha: text("fecha").notNull(), // YYYY-MM-DD
  codComp: text("cod_comp").notNull(),
  nComp: text("n_comp").notNull(),
  debe: centavos("debe").notNull(), // centavos
  haber: centavos("haber").notNull(), // centavos
  saldo: centavos("saldo").notNull(), // centavos
  creadoEn: text("creado_en").notNull(),
}, (t) => [
  index("retenciones_tango_creado_en_idx").on(t.creadoEn),
])

export const sesiones = pgTable("sesiones", {
  id: text("id").primaryKey(),
  modulo: text("modulo").notNull(), // 'ventas' | 'contabilidad'
  label: text("label").notNull(),
  estado: text("estado").notNull().default("activo"), // activo | completado | error
  datos: jsonb("datos").notNull().default({}).$type<Record<string, unknown>>(), // blob específico por módulo
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [
  index("sesiones_modulo_updated_at_idx").on(t.modulo, t.updatedAt),
])

export const usoApi = pgTable("uso_api", {
  id: serial("id").primaryKey(),
  ts: text("ts").notNull(),
  provider: text("provider").notNull(), // 'anthropic' | 'mistral' | 'openai'
  modelo: text("modelo").notNull(),
  operacion: text("operacion").notNull(),
  tokensIn: integer("tokens_in").notNull(),
  tokensOut: integer("tokens_out").notNull(),
  costoUsd: bigint("costo_usd", { mode: "number" }).notNull(), // micro-USD (costoUsd / 1_000_000 = USD)
})

export const retenciones = pgTable("retenciones", {
  id: text("id").primaryKey(),
  empresa: text("empresa").notNull(),
  cuit: text("cuit").notNull().default(""),
  fechaPago: text("fecha_pago").notNull(),
  concepto: text("concepto").notNull().default(""),
  nroComprobante: text("nro_comprobante").notNull().default(""),
  montoBruto: centavos("monto_bruto").notNull(),
  montoNeto: centavos("monto_neto").notNull(),
  retencionesJson: jsonb("retenciones_json").notNull().default([]).$type<Array<{ tipo: string; monto: number; porcentaje?: number }>>(), // [{tipo, monto, porcentaje?}]
  creadoEn: text("creado_en").notNull(),
}, (t) => [
  index("retenciones_creado_en_idx").on(t.creadoEn),
])
