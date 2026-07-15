import { pgTable, text, integer, bigint, serial, jsonb, index, boolean, date, timestamp, check, unique } from "drizzle-orm/pg-core"
import { sql, relations } from "drizzle-orm"
import type { Categoria, ConcStage, MatchTipo, TipoDiscrepancia } from "../types"

// Montos en centavos ARS → bigint (int4 desborda a ~$21M ARS)
const centavos = (name: string) => bigint(name, { mode: "number" })
// Fechas/timestamps nativos pero expuestos como string (menor churn: sorts localeCompare, new Date(), render directo siguen igual)
const fecha = (name: string) => date(name, { mode: "string" })
const ts = (name: string) => timestamp(name, { mode: "string", withTimezone: true })
// helper CHECK "columna IN (...)" para enums text
const inList = (col: string, vals: readonly string[]) =>
  sql.raw(`${col} in (${vals.map((v) => `'${v}'`).join(", ")})`)

export const conciliaciones = pgTable("conciliaciones", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  stage: text("stage").$type<ConcStage>().notNull().default("new"), // new|banco-done|tango-done|done|aprobada
  periodo: text("periodo"), // "YYYY-MM" mes dominante de los movimientos (nullable) — se mantiene text (equality YYYY-MM)
  bancoId: text("banco_id"),
  bancoNombre: text("banco_nombre"),
  bancoConfidence: text("banco_confidence").$type<"high" | "low">(),
  saldoAnterior: centavos("saldo_anterior"),
  saldoFinal: centavos("saldo_final"),
  movimientosCount: integer("movimientos_count"),
  asientosCount: integer("asientos_count"),
  saldoBanco: centavos("saldo_banco"),
  saldoMayor: centavos("saldo_mayor"),
  diferencia: centavos("diferencia"),
  createdAt: ts("created_at").notNull(),
  updatedAt: ts("updated_at").notNull(),
  createdBy: text("created_by"), // Clerk userId de quien la creó (nullable — filas viejas / writes fuera de request)
  updatedBy: text("updated_by"), // Clerk userId del último editor
  orgId: text("org_id"), // Clerk organization id (nullable hasta backfill; NOT NULL en migración de seguimiento)
}, (t) => [
  index("conciliaciones_created_at_idx").on(t.createdAt),
  index("conciliaciones_updated_at_idx").on(t.updatedAt),
  index("conciliaciones_stage_idx").on(t.stage),
  index("conciliaciones_org_id_created_at_idx").on(t.orgId, t.createdAt),
  check("conciliaciones_stage_chk", inList("stage", ["new", "banco-done", "tango-done", "done", "aprobada"])),
  check("conciliaciones_banco_confidence_chk", sql`banco_confidence is null or ${inList("banco_confidence", ["high", "low"])}`),
])

export const movimientos = pgTable("movimientos", {
  id: text("id").primaryKey(),
  conciliacionId: text("conciliacion_id").notNull().references(() => conciliaciones.id, { onDelete: "cascade" }),
  fecha: fecha("fecha").notNull(),
  descripcion: text("descripcion").notNull(),
  referencia: text("referencia").notNull().default(""),
  monto: centavos("monto").notNull(),
  saldo: centavos("saldo"),
  categoria: text("categoria").$type<Categoria>(), // impuesto|percepcion|transferencia|cheque|comision|prestamo|prestamo_iva|otro
  grupoId: text("grupo_id"), // agrupa amortización préstamo + impuestos relacionados
  diferidoA: text("diferido_a"), // período (YYYY-MM) al que fue diferido este movimiento (nullable); excluye de discrepancias en re-matching de la misma conciliación
}, (t) => [
  index("movimientos_conciliacion_id_idx").on(t.conciliacionId),
  check("movimientos_categoria_chk", sql`categoria is null or ${inList("categoria", ["impuesto", "percepcion", "transferencia", "cheque", "comision", "prestamo", "prestamo_iva", "otro"])}`),
])

export const asientos = pgTable("asientos", {
  id: text("id").primaryKey(),
  conciliacionId: text("conciliacion_id").notNull().references(() => conciliaciones.id, { onDelete: "cascade" }),
  fecha: fecha("fecha").notNull(),
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
  tipo: text("tipo").$type<MatchTipo>().notNull().default("confirmed"), // confirmed|probable|rejected
  diferenciaMonto: centavos("diferencia_monto"),
  explicacion: text("explicacion"),
}, (t) => [
  index("matches_conciliacion_id_idx").on(t.conciliacionId),
  index("matches_movimiento_id_idx").on(t.movimientoId),
  index("matches_asiento_id_idx").on(t.asientoId),
  check("matches_tipo_chk", inList("tipo", ["confirmed", "probable", "rejected"])),
])

export const discrepancias = pgTable("discrepancias", {
  id: serial("id").primaryKey(),
  conciliacionId: text("conciliacion_id").notNull().references(() => conciliaciones.id, { onDelete: "cascade" }),
  tipo: text("tipo").$type<TipoDiscrepancia>().notNull(), // en_extracto_no_en_mayor|en_mayor_no_en_extracto
  fecha: fecha("fecha").notNull(),
  descripcion: text("descripcion").notNull(),
  monto: centavos("monto").notNull(),
  movimientoId: text("movimiento_id").references(() => movimientos.id, { onDelete: "set null" }),
  asientoId: text("asiento_id").references(() => asientos.id, { onDelete: "set null" }),
  bucketOverride: text("bucket_override"), // categoría elegida manualmente por el usuario
  revisar: boolean("revisar"), // marca de duda del usuario (nullable)
}, (t) => [
  index("discrepancias_conciliacion_id_idx").on(t.conciliacionId),
  index("discrepancias_movimiento_id_idx").on(t.movimientoId),
  index("discrepancias_asiento_id_idx").on(t.asientoId),
  check("discrepancias_tipo_chk", inList("tipo", ["en_extracto_no_en_mayor", "en_mayor_no_en_extracto"])),
])

// Movimiento sin match diferido al mes siguiente (snapshot de los campos originales + origen para trazabilidad)
export const movimientosDiferidos = pgTable("movimientos_diferidos", {
  id: text("id").primaryKey(),
  bancoId: text("banco_id").notNull(),
  periodoDestino: text("periodo_destino").notNull(), // "YYYY-MM"
  origenConciliacionId: text("origen_conciliacion_id").references(() => conciliaciones.id, { onDelete: "set null" }),
  origenMovimientoId: text("origen_movimiento_id").references(() => movimientos.id, { onDelete: "set null" }),
  origenDiscrepanciaId: integer("origen_discrepancia_id").references(() => discrepancias.id, { onDelete: "set null" }),
  fecha: fecha("fecha").notNull(), // snapshot del campo original
  descripcion: text("descripcion").notNull(), // snapshot
  referencia: text("referencia").notNull().default(""), // snapshot
  monto: centavos("monto").notNull(), // snapshot
  categoria: text("categoria").$type<Categoria>(), // impuesto|percepcion|transferencia|cheque|comision|prestamo|prestamo_iva|otro
  estado: text("estado").notNull().default("pendiente"), // pendiente|conciliado|descartado
  conciliadoEnMovimientoId: text("conciliado_en_movimiento_id").references(() => movimientos.id, { onDelete: "set null" }),
  createdBy: text("created_by"), // Clerk userId de quien lo difirió, o "drive-sync"
  createdAt: ts("created_at").notNull().defaultNow(),
  orgId: text("org_id"), // Clerk organization id (nullable hasta backfill; NOT NULL en migración de seguimiento)
}, (t) => [
  index("movimientos_diferidos_banco_periodo_estado_idx").on(t.bancoId, t.periodoDestino, t.estado),
  index("movimientos_diferidos_org_id_banco_periodo_estado_idx").on(t.orgId, t.bancoId, t.periodoDestino, t.estado),
  check("movimientos_diferidos_estado_chk", inList("estado", ["pendiente", "conciliado", "descartado"])),
])

export const saldosBanco = pgTable("saldos_banco", {
  bancoId: text("banco_id").notNull(),
  bancoNombre: text("banco_nombre").notNull(),
  ultimoSaldo: centavos("ultimo_saldo").notNull(),
  ultimaFecha: fecha("ultima_fecha").notNull(),
  updatedAt: ts("updated_at").notNull(),
  updatedBy: text("updated_by").$type<"auto" | "manual">().notNull().default("auto"),
  saldoConciliado: centavos("saldo_conciliado"),
  fechaConciliacion: ts("fecha_conciliacion"),
  updatedByUser: text("updated_by_user"), // Clerk userId (updatedBy de arriba es flag auto|manual, no usuario)
  orgId: text("org_id"), // Clerk organization id (nullable hasta backfill; NOT NULL en migración de seguimiento)
}, (t) => [
  // bancoId ya no es PK global (colisionaba entre orgs) — unique compuesto (org_id, banco_id).
  unique("saldos_banco_org_id_banco_id_unique").on(t.orgId, t.bancoId),
  check("saldos_banco_updated_by_chk", inList("updated_by", ["auto", "manual"])),
])

export const partidas = pgTable("partidas", {
  id: text("id").primaryKey(),
  bancoId: text("banco_id").notNull(),
  descripcion: text("descripcion").notNull(),
  monto: centavos("monto").notNull(),
  fecha: fecha("fecha").notNull(),
  createdBy: text("created_by"), // Clerk userId de quien la cargó
  orgId: text("org_id"), // Clerk organization id (nullable hasta backfill; NOT NULL en migración de seguimiento)
}, (t) => [
  index("partidas_banco_id_idx").on(t.bancoId),
  index("partidas_org_id_banco_id_idx").on(t.orgId, t.bancoId),
])

export const tarjetasMaestras = pgTable("tarjetas_maestras", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull(),
  banco: text("banco").notNull(),
  tipo: text("tipo").$type<"VISA" | "MASTERCARD" | "AMEX">().notNull(), // VISA | MASTERCARD | AMEX
  activa: boolean("activa").notNull().default(true),
  createdBy: text("created_by"), // Clerk userId de quien la creó
  updatedBy: text("updated_by"), // Clerk userId del último editor
  orgId: text("org_id"), // Clerk organization id (nullable hasta backfill; NOT NULL en migración de seguimiento)
}, (t) => [
  unique("tarjetas_maestras_org_id_nombre_unique").on(t.orgId, t.nombre), // antes: unique simple en nombre — dos orgs pueden repetir nombre
  check("tarjetas_maestras_tipo_chk", inList("tipo", ["VISA", "MASTERCARD", "AMEX"])),
])

export const resumenTarjetas = pgTable("resumen_tarjetas", {
  id: text("id").primaryKey(),
  nombreTarjeta: text("nombre_tarjeta").notNull(),
  periodo: text("periodo").notNull().default(""), // rango libre ("31/03/26 AL 28/04/26") — se mantiene text
  totalMonto: centavos("total_monto").notNull().default(0),
  tarjetaMaestraId: text("tarjeta_maestra_id").references(() => tarjetasMaestras.id, { onDelete: "set null" }),
  creadoEn: ts("creado_en").notNull(),
  createdBy: text("created_by"), // Clerk userId de quien lo procesó
  orgId: text("org_id"), // Clerk organization id (nullable hasta backfill; NOT NULL en migración de seguimiento)
}, (t) => [
  index("resumen_tarjetas_creado_en_idx").on(t.creadoEn),
  index("resumen_tarjetas_tarjeta_maestra_id_idx").on(t.tarjetaMaestraId),
  index("resumen_tarjetas_org_id_creado_en_idx").on(t.orgId, t.creadoEn),
])

export const lineasTarjeta = pgTable("lineas_tarjeta", {
  id: text("id").primaryKey(),
  resumenId: text("resumen_id").notNull().references(() => resumenTarjetas.id, { onDelete: "cascade" }),
  cuenta: text("cuenta").notNull().default(""),
  descripcion: text("descripcion").notNull(),
  monto: centavos("monto").notNull().default(0),
  periodo: text("periodo").notNull().default(""), // rango libre — se mantiene text
  estado: text("estado").notNull().default(""),
  tipoLinea: text("tipo_linea").$type<"cargo" | "impuesto" | "devolucion">().notNull().default("cargo"), // cargo | impuesto | devolucion
}, (t) => [
  index("lineas_tarjeta_resumen_id_idx").on(t.resumenId),
  check("lineas_tarjeta_tipo_linea_chk", inList("tipo_linea", ["cargo", "impuesto", "devolucion"])),
])

export const retencionesArca = pgTable("retenciones_arca", {
  id: text("id").primaryKey(),
  loteId: text("lote_id").notNull(),
  jurisdiccion: text("jurisdiccion").$type<"nacional" | "caba" | "otra">().notNull(), // "nacional" | "caba" | "otra"
  cuitAgente: text("cuit_agente").notNull(),
  fechaRetencion: fecha("fecha_retencion").notNull(), // YYYY-MM-DD
  tipo: text("tipo").notNull(),
  letra: text("letra").notNull(),
  nroComprobante: text("nro_comprobante").notNull(),
  nroComprOrigen: text("nro_compr_origen").notNull().default(""),
  importe: centavos("importe").notNull(), // centavos
  creadoEn: ts("creado_en").notNull(),
  createdBy: text("created_by"), // Clerk userId de quien lo cargó
  orgId: text("org_id"), // Clerk organization id (nullable hasta backfill; NOT NULL en migración de seguimiento)
}, (t) => [
  index("retenciones_arca_creado_en_idx").on(t.creadoEn),
  index("retenciones_arca_org_id_creado_en_idx").on(t.orgId, t.creadoEn),
  check("retenciones_arca_jurisdiccion_chk", inList("jurisdiccion", ["nacional", "caba", "otra"])),
])

export const retencionesTango = pgTable("retenciones_tango", {
  id: text("id").primaryKey(),
  loteId: text("lote_id").notNull(),
  codCta: text("cod_cta").notNull(),
  descCta: text("desc_cta").notNull(),
  fecha: fecha("fecha").notNull(), // YYYY-MM-DD
  codComp: text("cod_comp").notNull(),
  nComp: text("n_comp").notNull(),
  debe: centavos("debe").notNull(), // centavos
  haber: centavos("haber").notNull(), // centavos
  saldo: centavos("saldo").notNull(), // centavos
  creadoEn: ts("creado_en").notNull(),
  createdBy: text("created_by"), // Clerk userId de quien lo cargó
  orgId: text("org_id"), // Clerk organization id (nullable hasta backfill; NOT NULL en migración de seguimiento)
}, (t) => [
  index("retenciones_tango_creado_en_idx").on(t.creadoEn),
  index("retenciones_tango_org_id_creado_en_idx").on(t.orgId, t.creadoEn),
])

export const sesiones = pgTable("sesiones", {
  id: text("id").primaryKey(),
  modulo: text("modulo").$type<"ventas" | "contabilidad">().notNull(), // 'ventas' | 'contabilidad'
  label: text("label").notNull(),
  estado: text("estado").$type<"activo" | "completado" | "error">().notNull().default("activo"), // activo | completado | error
  datos: jsonb("datos").notNull().default({}).$type<Record<string, unknown>>(), // blob específico por módulo
  createdAt: ts("created_at").notNull(),
  updatedAt: ts("updated_at").notNull(),
  createdBy: text("created_by"), // Clerk userId de quien la creó
  updatedBy: text("updated_by"), // Clerk userId del último editor
  orgId: text("org_id"), // Clerk organization id (nullable hasta backfill; NOT NULL en migración de seguimiento)
}, (t) => [
  index("sesiones_modulo_updated_at_idx").on(t.modulo, t.updatedAt),
  index("sesiones_org_id_modulo_updated_at_idx").on(t.orgId, t.modulo, t.updatedAt),
  check("sesiones_modulo_chk", inList("modulo", ["ventas", "contabilidad"])),
  check("sesiones_estado_chk", inList("estado", ["activo", "completado", "error"])),
])

export const usoApi = pgTable("uso_api", {
  id: serial("id").primaryKey(),
  ts: ts("ts").notNull(),
  provider: text("provider").$type<"anthropic" | "mistral" | "openai">().notNull(), // 'anthropic' | 'mistral' | 'openai'
  modelo: text("modelo").notNull(),
  operacion: text("operacion").notNull(),
  tokensIn: integer("tokens_in").notNull(),
  tokensOut: integer("tokens_out").notNull(),
  costoUsd: bigint("costo_usd", { mode: "number" }).notNull(), // micro-USD (costoUsd / 1_000_000 = USD)
  orgId: text("org_id"), // Clerk organization id (nullable hasta backfill; NOT NULL en migración de seguimiento)
}, (t) => [
  index("uso_api_ts_idx").on(t.ts),
  index("uso_api_org_id_ts_idx").on(t.orgId, t.ts),
  check("uso_api_provider_chk", inList("provider", ["anthropic", "mistral", "openai"])),
])

export const retenciones = pgTable("retenciones", {
  id: text("id").primaryKey(),
  empresa: text("empresa").notNull(),
  cuit: text("cuit").notNull().default(""),
  fechaPago: fecha("fecha_pago").notNull(),
  concepto: text("concepto").notNull().default(""),
  nroComprobante: text("nro_comprobante").notNull().default(""),
  montoBruto: centavos("monto_bruto").notNull(),
  montoNeto: centavos("monto_neto").notNull(),
  creadoEn: ts("creado_en").notNull(),
  createdBy: text("created_by"), // Clerk userId de quien la cargó
  orgId: text("org_id"), // Clerk organization id (nullable hasta backfill; NOT NULL en migración de seguimiento)
}, (t) => [
  index("retenciones_creado_en_idx").on(t.creadoEn),
  index("retenciones_org_id_creado_en_idx").on(t.orgId, t.creadoEn),
])

// Detalle de retenciones (antes retenciones.retencionesJson jsonb)
export const retencionItems = pgTable("retencion_items", {
  id: text("id").primaryKey(),
  retencionId: text("retencion_id").notNull().references(() => retenciones.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull(),
  monto: centavos("monto").notNull(),
  porcentaje: text("porcentaje"), // nullable; raw para preservar valor exacto (ej "1.5")
}, (t) => [
  index("retencion_items_retencion_id_idx").on(t.retencionId),
])

// Rate limiting compartido multi-instancia (ventana fija: n requests hasta reset)
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  n: integer("n").notNull(),
  reset: ts("reset").notNull(),
})

// Idempotencia de sync de Google Drive (id = Google Drive file id)
export const driveArchivos = pgTable("drive_archivos", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull(),
  mimeType: text("mime_type").notNull(),
  tamano: bigint("tamano", { mode: "number" }).notNull(),
  estado: text("estado").notNull().default("pendiente"), // pendiente|procesado|error
  clasificacion: text("clasificacion"),
  errorMensaje: text("error_mensaje"),
  procesadoEn: ts("procesado_en"),
  createdAt: ts("created_at").notNull().defaultNow(),
}, () => [
  check("drive_archivos_estado_chk", inList("estado", ["pendiente", "procesado", "error"])),
])

// Config singleton del canal de webhook de Google Drive (id fijo "default")
export const driveSyncState = pgTable("drive_sync_state", {
  id: text("id").primaryKey(),
  pageToken: text("page_token"),
  channelId: text("channel_id"),
  resourceId: text("resource_id"),
  channelExpiration: ts("channel_expiration"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
})

// ── Relations (Drizzle Relations API) ──────────────────────────────
// Construcción solo-TypeScript: habilita db.query.<tabla>.findFirst/findMany({ with: {...} }).
// No genera SQL — los FKs ya existen vía .references() arriba.

export const conciliacionesRelations = relations(conciliaciones, ({ many }) => ({
  movimientos: many(movimientos),
  asientos: many(asientos),
  matches: many(matches),
  discrepancias: many(discrepancias),
  movimientosDiferidos: many(movimientosDiferidos),
}))

export const movimientosRelations = relations(movimientos, ({ one, many }) => ({
  conciliacion: one(conciliaciones, { fields: [movimientos.conciliacionId], references: [conciliaciones.id] }),
  matches: many(matches),
  discrepancias: many(discrepancias),
  movimientosDiferidosOrigen: many(movimientosDiferidos, { relationName: "movimientos_diferidos_origen" }),
  movimientosDiferidosConciliadoEn: many(movimientosDiferidos, { relationName: "movimientos_diferidos_conciliado_en" }),
}))

export const asientosRelations = relations(asientos, ({ one, many }) => ({
  conciliacion: one(conciliaciones, { fields: [asientos.conciliacionId], references: [conciliaciones.id] }),
  matches: many(matches),
  discrepancias: many(discrepancias),
}))

export const matchesRelations = relations(matches, ({ one }) => ({
  conciliacion: one(conciliaciones, { fields: [matches.conciliacionId], references: [conciliaciones.id] }),
  movimiento: one(movimientos, { fields: [matches.movimientoId], references: [movimientos.id] }),
  asiento: one(asientos, { fields: [matches.asientoId], references: [asientos.id] }),
}))

export const discrepanciasRelations = relations(discrepancias, ({ one, many }) => ({
  conciliacion: one(conciliaciones, { fields: [discrepancias.conciliacionId], references: [conciliaciones.id] }),
  // movimientoId/asientoId son nullable (onDelete: set null) → relación opcional
  movimiento: one(movimientos, { fields: [discrepancias.movimientoId], references: [movimientos.id] }),
  asiento: one(asientos, { fields: [discrepancias.asientoId], references: [asientos.id] }),
  movimientosDiferidos: many(movimientosDiferidos),
}))

export const movimientosDiferidosRelations = relations(movimientosDiferidos, ({ one }) => ({
  origenConciliacion: one(conciliaciones, { fields: [movimientosDiferidos.origenConciliacionId], references: [conciliaciones.id] }),
  origenMovimiento: one(movimientos, {
    fields: [movimientosDiferidos.origenMovimientoId],
    references: [movimientos.id],
    relationName: "movimientos_diferidos_origen",
  }),
  conciliadoEnMovimiento: one(movimientos, {
    fields: [movimientosDiferidos.conciliadoEnMovimientoId],
    references: [movimientos.id],
    relationName: "movimientos_diferidos_conciliado_en",
  }),
  origenDiscrepancia: one(discrepancias, { fields: [movimientosDiferidos.origenDiscrepanciaId], references: [discrepancias.id] }),
}))

export const tarjetasMaestrasRelations = relations(tarjetasMaestras, ({ many }) => ({
  resumenTarjetas: many(resumenTarjetas),
}))

export const resumenTarjetasRelations = relations(resumenTarjetas, ({ one, many }) => ({
  tarjetaMaestra: one(tarjetasMaestras, { fields: [resumenTarjetas.tarjetaMaestraId], references: [tarjetasMaestras.id] }),
  lineas: many(lineasTarjeta),
}))

export const lineasTarjetaRelations = relations(lineasTarjeta, ({ one }) => ({
  resumen: one(resumenTarjetas, { fields: [lineasTarjeta.resumenId], references: [resumenTarjetas.id] }),
}))

export const retencionesRelations = relations(retenciones, ({ many }) => ({
  items: many(retencionItems),
}))

export const retencionItemsRelations = relations(retencionItems, ({ one }) => ({
  retencion: one(retenciones, { fields: [retencionItems.retencionId], references: [retenciones.id] }),
}))
