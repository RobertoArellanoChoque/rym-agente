import {
  conciliaciones, movimientos, asientos, matches, discrepancias,
  saldosBanco, partidas, sesiones,
  retencionesArca, retencionesTango, retenciones, retencionItems,
  usoApi,
} from "@/lib/db/schema"

// Tablas que se vacían en un reset (TODO menos las de tarjetas).
// Orden: hijos antes que padres, para poder borrar sin CASCADE explícito.
// Fuente única compartida por app/api/admin/reset-db y scripts/reset-db.
export const RESET_TABLES = [
  matches, discrepancias, asientos, movimientos, partidas, conciliaciones,
  saldosBanco, sesiones, retencionesArca, retencionesTango, retencionItems,
  retenciones, usoApi,
]
