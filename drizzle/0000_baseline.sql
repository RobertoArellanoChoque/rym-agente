CREATE TABLE "asientos" (
	"id" text PRIMARY KEY NOT NULL,
	"conciliacion_id" text NOT NULL,
	"fecha" text NOT NULL,
	"descripcion" text NOT NULL,
	"referencia" text DEFAULT '' NOT NULL,
	"monto" bigint NOT NULL,
	"cuenta" text NOT NULL,
	"debe" bigint,
	"haber" bigint,
	"saldo" bigint
);
--> statement-breakpoint
CREATE TABLE "conciliaciones" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"stage" text DEFAULT 'new' NOT NULL,
	"banco_id" text,
	"banco_nombre" text,
	"banco_confidence" text,
	"saldo_anterior" bigint,
	"saldo_final" bigint,
	"movimientos_count" integer,
	"asientos_count" integer,
	"saldo_banco" bigint,
	"saldo_mayor" bigint,
	"diferencia" bigint,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discrepancias" (
	"id" serial PRIMARY KEY NOT NULL,
	"conciliacion_id" text NOT NULL,
	"tipo" text NOT NULL,
	"fecha" text NOT NULL,
	"descripcion" text NOT NULL,
	"monto" bigint NOT NULL,
	"movimiento_id" text,
	"asiento_id" text
);
--> statement-breakpoint
CREATE TABLE "lineas_tarjeta" (
	"id" text PRIMARY KEY NOT NULL,
	"resumen_id" text NOT NULL,
	"cuenta" text DEFAULT '' NOT NULL,
	"descripcion" text NOT NULL,
	"monto" bigint DEFAULT 0 NOT NULL,
	"periodo" text DEFAULT '' NOT NULL,
	"estado" text DEFAULT '' NOT NULL,
	"tipo_linea" text DEFAULT 'cargo' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"conciliacion_id" text NOT NULL,
	"movimiento_id" text NOT NULL,
	"asiento_id" text NOT NULL,
	"score" integer NOT NULL,
	"motivo" text NOT NULL,
	"tipo" text DEFAULT 'confirmed' NOT NULL,
	"diferencia_monto" bigint,
	"explicacion" text
);
--> statement-breakpoint
CREATE TABLE "movimientos" (
	"id" text PRIMARY KEY NOT NULL,
	"conciliacion_id" text NOT NULL,
	"fecha" text NOT NULL,
	"descripcion" text NOT NULL,
	"referencia" text DEFAULT '' NOT NULL,
	"monto" bigint NOT NULL,
	"saldo" bigint,
	"categoria" text
);
--> statement-breakpoint
CREATE TABLE "partidas" (
	"id" text PRIMARY KEY NOT NULL,
	"banco_id" text NOT NULL,
	"descripcion" text NOT NULL,
	"monto" bigint NOT NULL,
	"fecha" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resumen_tarjetas" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre_tarjeta" text NOT NULL,
	"periodo" text DEFAULT '' NOT NULL,
	"total_monto" bigint DEFAULT 0 NOT NULL,
	"tarjeta_maestra_id" text,
	"creado_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retenciones" (
	"id" text PRIMARY KEY NOT NULL,
	"empresa" text NOT NULL,
	"cuit" text DEFAULT '' NOT NULL,
	"fecha_pago" text NOT NULL,
	"concepto" text DEFAULT '' NOT NULL,
	"nro_comprobante" text DEFAULT '' NOT NULL,
	"monto_bruto" bigint NOT NULL,
	"monto_neto" bigint NOT NULL,
	"retenciones_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"creado_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retenciones_arca" (
	"id" text PRIMARY KEY NOT NULL,
	"lote_id" text NOT NULL,
	"jurisdiccion" text NOT NULL,
	"cuit_agente" text NOT NULL,
	"fecha_retencion" text NOT NULL,
	"tipo" text NOT NULL,
	"letra" text NOT NULL,
	"nro_comprobante" text NOT NULL,
	"nro_compr_origen" text DEFAULT '' NOT NULL,
	"importe" bigint NOT NULL,
	"creado_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retenciones_tango" (
	"id" text PRIMARY KEY NOT NULL,
	"lote_id" text NOT NULL,
	"cod_cta" text NOT NULL,
	"desc_cta" text NOT NULL,
	"fecha" text NOT NULL,
	"cod_comp" text NOT NULL,
	"n_comp" text NOT NULL,
	"debe" bigint NOT NULL,
	"haber" bigint NOT NULL,
	"saldo" bigint NOT NULL,
	"creado_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saldos_banco" (
	"banco_id" text PRIMARY KEY NOT NULL,
	"banco_nombre" text NOT NULL,
	"ultimo_saldo" bigint NOT NULL,
	"ultima_fecha" text NOT NULL,
	"updated_at" text NOT NULL,
	"updated_by" text DEFAULT 'auto' NOT NULL,
	"saldo_conciliado" bigint,
	"fecha_conciliacion" text
);
--> statement-breakpoint
CREATE TABLE "sesiones" (
	"id" text PRIMARY KEY NOT NULL,
	"modulo" text NOT NULL,
	"label" text NOT NULL,
	"estado" text DEFAULT 'activo' NOT NULL,
	"datos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tarjetas_maestras" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"banco" text NOT NULL,
	"tipo" text NOT NULL,
	"activa" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "tarjetas_maestras_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "uso_api" (
	"id" serial PRIMARY KEY NOT NULL,
	"ts" text NOT NULL,
	"provider" text NOT NULL,
	"modelo" text NOT NULL,
	"operacion" text NOT NULL,
	"tokens_in" integer NOT NULL,
	"tokens_out" integer NOT NULL,
	"costo_usd" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asientos" ADD CONSTRAINT "asientos_conciliacion_id_conciliaciones_id_fk" FOREIGN KEY ("conciliacion_id") REFERENCES "public"."conciliaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discrepancias" ADD CONSTRAINT "discrepancias_conciliacion_id_conciliaciones_id_fk" FOREIGN KEY ("conciliacion_id") REFERENCES "public"."conciliaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discrepancias" ADD CONSTRAINT "discrepancias_movimiento_id_movimientos_id_fk" FOREIGN KEY ("movimiento_id") REFERENCES "public"."movimientos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discrepancias" ADD CONSTRAINT "discrepancias_asiento_id_asientos_id_fk" FOREIGN KEY ("asiento_id") REFERENCES "public"."asientos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineas_tarjeta" ADD CONSTRAINT "lineas_tarjeta_resumen_id_resumen_tarjetas_id_fk" FOREIGN KEY ("resumen_id") REFERENCES "public"."resumen_tarjetas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_conciliacion_id_conciliaciones_id_fk" FOREIGN KEY ("conciliacion_id") REFERENCES "public"."conciliaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_movimiento_id_movimientos_id_fk" FOREIGN KEY ("movimiento_id") REFERENCES "public"."movimientos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_asiento_id_asientos_id_fk" FOREIGN KEY ("asiento_id") REFERENCES "public"."asientos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_conciliacion_id_conciliaciones_id_fk" FOREIGN KEY ("conciliacion_id") REFERENCES "public"."conciliaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resumen_tarjetas" ADD CONSTRAINT "resumen_tarjetas_tarjeta_maestra_id_tarjetas_maestras_id_fk" FOREIGN KEY ("tarjeta_maestra_id") REFERENCES "public"."tarjetas_maestras"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asientos_conciliacion_id_idx" ON "asientos" USING btree ("conciliacion_id");--> statement-breakpoint
CREATE INDEX "conciliaciones_created_at_idx" ON "conciliaciones" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "conciliaciones_updated_at_idx" ON "conciliaciones" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "discrepancias_conciliacion_id_idx" ON "discrepancias" USING btree ("conciliacion_id");--> statement-breakpoint
CREATE INDEX "lineas_tarjeta_resumen_id_idx" ON "lineas_tarjeta" USING btree ("resumen_id");--> statement-breakpoint
CREATE INDEX "matches_conciliacion_id_idx" ON "matches" USING btree ("conciliacion_id");--> statement-breakpoint
CREATE INDEX "matches_movimiento_id_idx" ON "matches" USING btree ("movimiento_id");--> statement-breakpoint
CREATE INDEX "matches_asiento_id_idx" ON "matches" USING btree ("asiento_id");--> statement-breakpoint
CREATE INDEX "movimientos_conciliacion_id_idx" ON "movimientos" USING btree ("conciliacion_id");--> statement-breakpoint
CREATE INDEX "partidas_banco_id_idx" ON "partidas" USING btree ("banco_id");--> statement-breakpoint
CREATE INDEX "resumen_tarjetas_creado_en_idx" ON "resumen_tarjetas" USING btree ("creado_en");--> statement-breakpoint
CREATE INDEX "retenciones_creado_en_idx" ON "retenciones" USING btree ("creado_en");--> statement-breakpoint
CREATE INDEX "retenciones_arca_creado_en_idx" ON "retenciones_arca" USING btree ("creado_en");--> statement-breakpoint
CREATE INDEX "retenciones_tango_creado_en_idx" ON "retenciones_tango" USING btree ("creado_en");--> statement-breakpoint
CREATE INDEX "sesiones_modulo_updated_at_idx" ON "sesiones" USING btree ("modulo","updated_at");