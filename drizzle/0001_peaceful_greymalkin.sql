CREATE TABLE "retencion_items" (
	"id" text PRIMARY KEY NOT NULL,
	"retencion_id" text NOT NULL,
	"tipo" text NOT NULL,
	"monto" bigint NOT NULL,
	"porcentaje" text
);
--> statement-breakpoint
ALTER TABLE "asientos" ALTER COLUMN "fecha" SET DATA TYPE date;--> statement-breakpoint
ALTER TABLE "conciliaciones" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conciliaciones" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "discrepancias" ALTER COLUMN "fecha" SET DATA TYPE date;--> statement-breakpoint
ALTER TABLE "movimientos" ALTER COLUMN "fecha" SET DATA TYPE date;--> statement-breakpoint
ALTER TABLE "partidas" ALTER COLUMN "fecha" SET DATA TYPE date;--> statement-breakpoint
ALTER TABLE "resumen_tarjetas" ALTER COLUMN "creado_en" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "retenciones" ALTER COLUMN "fecha_pago" SET DATA TYPE date;--> statement-breakpoint
ALTER TABLE "retenciones" ALTER COLUMN "creado_en" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "retenciones_arca" ALTER COLUMN "fecha_retencion" SET DATA TYPE date;--> statement-breakpoint
ALTER TABLE "retenciones_arca" ALTER COLUMN "creado_en" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "retenciones_tango" ALTER COLUMN "fecha" SET DATA TYPE date;--> statement-breakpoint
ALTER TABLE "retenciones_tango" ALTER COLUMN "creado_en" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "saldos_banco" ALTER COLUMN "ultima_fecha" SET DATA TYPE date;--> statement-breakpoint
ALTER TABLE "saldos_banco" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "saldos_banco" ALTER COLUMN "fecha_conciliacion" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sesiones" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sesiones" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tarjetas_maestras" ALTER COLUMN "activa" SET DATA TYPE boolean;--> statement-breakpoint
ALTER TABLE "tarjetas_maestras" ALTER COLUMN "activa" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "uso_api" ALTER COLUMN "ts" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conciliaciones" ADD COLUMN "periodo" text;--> statement-breakpoint
ALTER TABLE "discrepancias" ADD COLUMN "bucket_override" text;--> statement-breakpoint
ALTER TABLE "discrepancias" ADD COLUMN "revisar" boolean;--> statement-breakpoint
ALTER TABLE "movimientos" ADD COLUMN "grupo_id" text;--> statement-breakpoint
ALTER TABLE "retencion_items" ADD CONSTRAINT "retencion_items_retencion_id_retenciones_id_fk" FOREIGN KEY ("retencion_id") REFERENCES "public"."retenciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "retencion_items_retencion_id_idx" ON "retencion_items" USING btree ("retencion_id");--> statement-breakpoint
ALTER TABLE "retenciones" DROP COLUMN "retenciones_json";--> statement-breakpoint
ALTER TABLE "conciliaciones" ADD CONSTRAINT "conciliaciones_stage_chk" CHECK (stage in ('new', 'banco-done', 'tango-done', 'done', 'aprobada'));--> statement-breakpoint
ALTER TABLE "conciliaciones" ADD CONSTRAINT "conciliaciones_banco_confidence_chk" CHECK (banco_confidence is null or banco_confidence in ('high', 'low'));--> statement-breakpoint
ALTER TABLE "discrepancias" ADD CONSTRAINT "discrepancias_tipo_chk" CHECK (tipo in ('en_extracto_no_en_mayor', 'en_mayor_no_en_extracto'));--> statement-breakpoint
ALTER TABLE "lineas_tarjeta" ADD CONSTRAINT "lineas_tarjeta_tipo_linea_chk" CHECK (tipo_linea in ('cargo', 'impuesto', 'devolucion'));--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_tipo_chk" CHECK (tipo in ('confirmed', 'probable', 'rejected'));--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_categoria_chk" CHECK (categoria is null or categoria in ('impuesto', 'percepcion', 'transferencia', 'cheque', 'comision', 'prestamo', 'prestamo_iva', 'otro'));--> statement-breakpoint
ALTER TABLE "retenciones_arca" ADD CONSTRAINT "retenciones_arca_jurisdiccion_chk" CHECK (jurisdiccion in ('nacional', 'caba', 'otra'));--> statement-breakpoint
ALTER TABLE "saldos_banco" ADD CONSTRAINT "saldos_banco_updated_by_chk" CHECK (updated_by in ('auto', 'manual'));--> statement-breakpoint
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_modulo_chk" CHECK (modulo in ('ventas', 'contabilidad'));--> statement-breakpoint
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_estado_chk" CHECK (estado in ('activo', 'completado', 'error'));--> statement-breakpoint
ALTER TABLE "tarjetas_maestras" ADD CONSTRAINT "tarjetas_maestras_tipo_chk" CHECK (tipo in ('VISA', 'MASTERCARD', 'AMEX'));--> statement-breakpoint
ALTER TABLE "uso_api" ADD CONSTRAINT "uso_api_provider_chk" CHECK (provider in ('anthropic', 'mistral', 'openai'));