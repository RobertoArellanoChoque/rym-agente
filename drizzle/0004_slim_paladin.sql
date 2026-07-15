ALTER TABLE "tarjetas_maestras" DROP CONSTRAINT "tarjetas_maestras_nombre_unique";--> statement-breakpoint
ALTER TABLE "conciliaciones" ADD COLUMN "org_id" text;--> statement-breakpoint
ALTER TABLE "movimientos_diferidos" ADD COLUMN "org_id" text;--> statement-breakpoint
ALTER TABLE "partidas" ADD COLUMN "org_id" text;--> statement-breakpoint
ALTER TABLE "resumen_tarjetas" ADD COLUMN "org_id" text;--> statement-breakpoint
ALTER TABLE "retenciones" ADD COLUMN "org_id" text;--> statement-breakpoint
ALTER TABLE "retenciones_arca" ADD COLUMN "org_id" text;--> statement-breakpoint
ALTER TABLE "retenciones_tango" ADD COLUMN "org_id" text;--> statement-breakpoint
ALTER TABLE "saldos_banco" ADD COLUMN "org_id" text;--> statement-breakpoint
ALTER TABLE "sesiones" ADD COLUMN "org_id" text;--> statement-breakpoint
ALTER TABLE "tarjetas_maestras" ADD COLUMN "org_id" text;--> statement-breakpoint
ALTER TABLE "uso_api" ADD COLUMN "org_id" text;--> statement-breakpoint
CREATE INDEX "conciliaciones_org_id_created_at_idx" ON "conciliaciones" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "movimientos_diferidos_org_id_banco_periodo_estado_idx" ON "movimientos_diferidos" USING btree ("org_id","banco_id","periodo_destino","estado");--> statement-breakpoint
CREATE INDEX "partidas_org_id_banco_id_idx" ON "partidas" USING btree ("org_id","banco_id");--> statement-breakpoint
CREATE INDEX "resumen_tarjetas_org_id_creado_en_idx" ON "resumen_tarjetas" USING btree ("org_id","creado_en");--> statement-breakpoint
CREATE INDEX "retenciones_org_id_creado_en_idx" ON "retenciones" USING btree ("org_id","creado_en");--> statement-breakpoint
CREATE INDEX "retenciones_arca_org_id_creado_en_idx" ON "retenciones_arca" USING btree ("org_id","creado_en");--> statement-breakpoint
CREATE INDEX "retenciones_tango_org_id_creado_en_idx" ON "retenciones_tango" USING btree ("org_id","creado_en");--> statement-breakpoint
CREATE INDEX "saldos_banco_org_id_idx" ON "saldos_banco" USING btree ("org_id","banco_id");--> statement-breakpoint
CREATE INDEX "sesiones_org_id_modulo_updated_at_idx" ON "sesiones" USING btree ("org_id","modulo","updated_at");--> statement-breakpoint
CREATE INDEX "uso_api_org_id_ts_idx" ON "uso_api" USING btree ("org_id","ts");--> statement-breakpoint
ALTER TABLE "tarjetas_maestras" ADD CONSTRAINT "tarjetas_maestras_org_id_nombre_unique" UNIQUE("org_id","nombre");