import postgres from "postgres"
process.loadEnvFile(".env.local")
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 5 })
try {
  // simula 3 requests previos (list, tasks, sesiones)
  await sql`SELECT * FROM conciliaciones`
  await sql`SELECT id FROM sesiones WHERE modulo='ventas'`
  await sql`SELECT 1`
  console.log("3 seriales OK")
  // simula dashboard: 9 concurrentes con queries variadas
  const t0 = Date.now()
  await Promise.all([
    sql`SELECT * FROM conciliaciones`,
    sql`SELECT count(*)::int FROM resumen_tarjetas`,
    sql`SELECT count(*)::int FROM movimientos`,
    sql`SELECT * FROM saldos_banco`,
    sql`SELECT banco_id, label FROM conciliaciones WHERE stage <> 'done'`,
    sql`SELECT COALESCE(SUM(tokens_in),0)::bigint FROM uso_api`,
    sql`SELECT provider, COALESCE(SUM(costo_usd),0)::bigint FROM uso_api GROUP BY provider, modelo ORDER BY SUM(costo_usd) DESC`,
    sql`SELECT DATE(ts::timestamptz)::text FROM uso_api WHERE ts::timestamptz >= now() - interval '6 days' GROUP BY DATE(ts::timestamptz) ORDER BY DATE(ts::timestamptz)`,
    sql`SELECT 1`,
  ])
  console.log(`dashboard 9-concurrentes OK en ${Date.now()-t0}ms`)
  // otra ronda para ver si el pool sigue sano
  await sql`SELECT 1`
  console.log("post-dashboard query OK — pool sano")
} catch(e) { console.log(`FAIL ${e.code||''}: ${e.message?.slice(0,80)}`) }
finally { await sql.end({timeout:5}) }
