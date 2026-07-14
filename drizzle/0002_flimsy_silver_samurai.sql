ALTER TABLE "conciliaciones" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "conciliaciones" ADD COLUMN "updated_by" text;--> statement-breakpoint
ALTER TABLE "partidas" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "resumen_tarjetas" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "retenciones" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "retenciones_arca" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "retenciones_tango" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "saldos_banco" ADD COLUMN "updated_by_user" text;--> statement-breakpoint
ALTER TABLE "sesiones" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "sesiones" ADD COLUMN "updated_by" text;--> statement-breakpoint
ALTER TABLE "tarjetas_maestras" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "tarjetas_maestras" ADD COLUMN "updated_by" text;