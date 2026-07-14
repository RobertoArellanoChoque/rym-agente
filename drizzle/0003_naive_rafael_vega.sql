CREATE TABLE "drive_archivos" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"mime_type" text NOT NULL,
	"tamano" bigint NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"clasificacion" text,
	"error_mensaje" text,
	"procesado_en" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drive_archivos_estado_chk" CHECK (estado in ('pendiente', 'procesado', 'error'))
);
--> statement-breakpoint
CREATE TABLE "drive_sync_state" (
	"id" text PRIMARY KEY NOT NULL,
	"page_token" text,
	"channel_id" text,
	"resource_id" text,
	"channel_expiration" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movimientos_diferidos" (
	"id" text PRIMARY KEY NOT NULL,
	"banco_id" text NOT NULL,
	"periodo_destino" text NOT NULL,
	"origen_conciliacion_id" text,
	"origen_movimiento_id" text,
	"origen_discrepancia_id" integer,
	"fecha" date NOT NULL,
	"descripcion" text NOT NULL,
	"referencia" text DEFAULT '' NOT NULL,
	"monto" bigint NOT NULL,
	"categoria" text,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"conciliado_en_movimiento_id" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movimientos_diferidos_estado_chk" CHECK (estado in ('pendiente', 'conciliado', 'descartado'))
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"n" integer NOT NULL,
	"reset" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "movimientos" ADD COLUMN "diferido_a" text;--> statement-breakpoint
ALTER TABLE "movimientos_diferidos" ADD CONSTRAINT "movimientos_diferidos_origen_conciliacion_id_conciliaciones_id_fk" FOREIGN KEY ("origen_conciliacion_id") REFERENCES "public"."conciliaciones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_diferidos" ADD CONSTRAINT "movimientos_diferidos_origen_movimiento_id_movimientos_id_fk" FOREIGN KEY ("origen_movimiento_id") REFERENCES "public"."movimientos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_diferidos" ADD CONSTRAINT "movimientos_diferidos_origen_discrepancia_id_discrepancias_id_fk" FOREIGN KEY ("origen_discrepancia_id") REFERENCES "public"."discrepancias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_diferidos" ADD CONSTRAINT "movimientos_diferidos_conciliado_en_movimiento_id_movimientos_id_fk" FOREIGN KEY ("conciliado_en_movimiento_id") REFERENCES "public"."movimientos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "movimientos_diferidos_banco_periodo_estado_idx" ON "movimientos_diferidos" USING btree ("banco_id","periodo_destino","estado");--> statement-breakpoint
CREATE INDEX "conciliaciones_stage_idx" ON "conciliaciones" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "discrepancias_movimiento_id_idx" ON "discrepancias" USING btree ("movimiento_id");--> statement-breakpoint
CREATE INDEX "discrepancias_asiento_id_idx" ON "discrepancias" USING btree ("asiento_id");--> statement-breakpoint
CREATE INDEX "resumen_tarjetas_tarjeta_maestra_id_idx" ON "resumen_tarjetas" USING btree ("tarjeta_maestra_id");--> statement-breakpoint
CREATE INDEX "uso_api_ts_idx" ON "uso_api" USING btree ("ts");