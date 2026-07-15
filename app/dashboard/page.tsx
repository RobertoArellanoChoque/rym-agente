import { LayoutDashboard, ArrowLeftRight, CreditCard, Receipt, TrendingUp, Building2, CheckCircle2, Clock, AlertCircle, Cpu } from "lucide-react"
import { db } from "@/lib/db"
import { conciliaciones, resumenTarjetas, movimientos, usoApi } from "@/lib/db/schema"
import { getSaldos } from "@/lib/saldos/manager"
import { centavosAString } from "@/lib/conciliacion/matching"
import { requireOrgId } from "@/lib/auth/current-user"
import { and, eq, inArray, sql, notInArray } from "drizzle-orm"

// Lee la DB en cada request — no prerenderizar en build
export const dynamic = "force-dynamic"

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "var(--primary)",
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  label: string
  value: string
  sub?: string
  color?: string
}) {
  return (
    <div className="rounded-xl border bg-card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <div className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ background: `color-mix(in oklch, ${color} 12%, transparent)` }}>
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
    </div>
  )
}

export default async function DashboardPage() {
  const orgId = await requireOrgId()
  const conciliacionesDeLaOrg = db.select({ id: conciliaciones.id }).from(conciliaciones).where(eq(conciliaciones.orgId, orgId))

  // Server component — todas las lecturas independientes corren en paralelo
  // (cada una es un round-trip a Supabase; en serie pagábamos N×RTT)
  const [
    allConciliaciones,
    tarjetasCount,
    movimientosCount,
    saldos,
    enProceso,
    usoTotalesRows,
    usoPorModelo,
    usoPorDia,
  ] = await Promise.all([
    db.select().from(conciliaciones).where(eq(conciliaciones.orgId, orgId)),
    db.$count(resumenTarjetas, eq(resumenTarjetas.orgId, orgId)),
    // movimientos no tiene orgId propio (hijo de conciliaciones) — se scopea vía conciliacionId
    db.$count(movimientos, inArray(movimientos.conciliacionId, conciliacionesDeLaOrg)),
    getSaldos(orgId),
    db.select({
      bancoId: conciliaciones.bancoId,
      label: conciliaciones.label,
      // "aprobada" es terminal (más que done): no cuenta como en-proceso.
    }).from(conciliaciones).where(and(eq(conciliaciones.orgId, orgId), notInArray(conciliaciones.stage, ["done", "aprobada"]))),
    db.select({
      tokensIn: sql<number>`COALESCE(SUM(tokens_in), 0)::bigint`.mapWith(Number),
      tokensOut: sql<number>`COALESCE(SUM(tokens_out), 0)::bigint`.mapWith(Number),
      costoUsd: sql<number>`COALESCE(SUM(costo_usd), 0)::bigint`.mapWith(Number),
      llamadas: sql<number>`COUNT(*)::int`,
    }).from(usoApi).where(eq(usoApi.orgId, orgId)),
    db.select({
      provider: usoApi.provider,
      modelo: usoApi.modelo,
      tokensIn: sql<number>`COALESCE(SUM(tokens_in), 0)::bigint`.mapWith(Number),
      tokensOut: sql<number>`COALESCE(SUM(tokens_out), 0)::bigint`.mapWith(Number),
      costoUsd: sql<number>`COALESCE(SUM(costo_usd), 0)::bigint`.mapWith(Number),
      llamadas: sql<number>`COUNT(*)::int`,
    }).from(usoApi).where(eq(usoApi.orgId, orgId)).groupBy(usoApi.provider, usoApi.modelo).orderBy(sql`SUM(costo_usd) DESC`),
    // ts es timestamptz nativo — se agrupa por día
    db.select({
      dia: sql<string>`DATE(ts)::text`,
      costoUsd: sql<number>`COALESCE(SUM(costo_usd), 0)::bigint`.mapWith(Number),
      tokensTotal: sql<number>`COALESCE(SUM(tokens_in + tokens_out), 0)::bigint`.mapWith(Number),
    }).from(usoApi)
      .where(and(eq(usoApi.orgId, orgId), sql`ts >= now() - interval '6 days'`))
      .groupBy(sql`DATE(ts)`)
      .orderBy(sql`DATE(ts)`),
  ])

  const doneConciliaciones = allConciliaciones.filter(c => c.stage === "done" || c.stage === "aprobada")
  const lastConc = [...allConciliaciones].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  const bancosConSaldo = Object.values(saldos)
  const totalSaldos = bancosConSaldo.reduce((s, b) => s + b.ultimoSaldo, 0)

  const enProcesoByBanco = new Map<string, string>()
  for (const s of enProceso) {
    if (s.bancoId) enProcesoByBanco.set(s.bancoId, s.label)
  }

  const difPromedio = doneConciliaciones.length > 0
    ? doneConciliaciones.reduce((s, c) => s + Math.abs(c.diferencia ?? 0), 0) / doneConciliaciones.length
    : 0

  const usoTotales = usoTotalesRows[0] ?? { tokensIn: 0, tokensOut: 0, costoUsd: 0, llamadas: 0 }
  const costoTotal = usoTotales.costoUsd / 1_000_000
  const maxDiaCosto = Math.max(...usoPorDia.map(d => d.costoUsd), 1)

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="px-6 py-5 border-b bg-card">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0" style={{ background: "color-mix(in oklch, var(--primary) 10%, transparent)" }}>
            <LayoutDashboard className="h-4 w-4" style={{ color: "var(--primary)" }} />
          </div>
          <div>
            <h1 className="text-lg font-bold">Dashboard</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Métricas del sistema</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">

          {/* KPI Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <MetricCard
              icon={ArrowLeftRight}
              label="Conciliaciones totales"
              value={String(allConciliaciones.length)}
              sub={`${doneConciliaciones.length} completadas`}
              color="var(--chart-1)"
            />
            <MetricCard
              icon={TrendingUp}
              label="Movimientos procesados"
              value={movimientosCount.toLocaleString("es-AR")}
              sub="extractos bancarios"
              color="var(--chart-4)"
            />
            <MetricCard
              icon={CreditCard}
              label="Resúmenes de tarjeta"
              value={String(tarjetasCount)}
              sub="procesados por el agente"
              color="var(--chart-5)"
            />
            <MetricCard
              icon={Building2}
              label="Saldo total en bancos"
              value={bancosConSaldo.length > 0 ? centavosAString(totalSaldos) : "—"}
              sub={`${bancosConSaldo.length} bancos registrados`}
              color="var(--chart-2)"
            />
            <MetricCard
              icon={Receipt}
              label="Diferencia promedio"
              value={doneConciliaciones.length > 0 ? centavosAString(Math.round(difPromedio)) : "—"}
              sub="en conciliaciones cerradas"
              color="var(--chart-3)"
            />
            <MetricCard
              icon={ArrowLeftRight}
              label="Último banco conciliado"
              value={lastConc?.bancoNombre ?? "—"}
              sub={lastConc ? new Date(lastConc.createdAt).toLocaleDateString("es-AR") : "Sin actividad aún"}
              color="var(--chart-1)"
            />
          </div>

          {/* Mis bancos — registro completo */}
          {bancosConSaldo.length > 0 && (
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="px-5 py-4 border-b flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Mis bancos</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Banco</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Saldo extracto</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Último conciliado</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fecha conc.</th>
                      <th className="px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {bancosConSaldo.map(b => {
                      const pendiente = enProcesoByBanco.get(b.bankId)
                      const conciliado = b.saldoConciliado != null
                      return (
                        <tr key={b.bankId} className="hover:bg-muted/20 transition-colors">
                          <td className="px-5 py-3">
                            <p className="font-medium">{b.bankName}</p>
                            <p className="text-xs text-muted-foreground">{b.ultimaFecha}</p>
                          </td>
                          <td className="px-4 py-3 text-right font-mono">
                            {centavosAString(b.ultimoSaldo)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                            {b.saldoConciliado != null ? centavosAString(b.saldoConciliado) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                            {b.fechaConciliacion ?? "—"}
                          </td>
                          <td className="px-5 py-3">
                            {pendiente ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
                                <Clock className="h-3 w-3" />
                                En proceso
                              </span>
                            ) : conciliado ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                                <CheckCircle2 className="h-3 w-3" />
                                Conciliado
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-full">
                                <AlertCircle className="h-3 w-3" />
                                Sin conciliar
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {allConciliaciones.length === 0 && tarjetasCount === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <LayoutDashboard className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">Sin actividad registrada aún</p>
              <p className="text-xs mt-1">Las métricas aparecerán cuando el agente procese documentos</p>
            </div>
          )}

          {/* Consumo IA */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Consumo IA</h2>
              </div>
              {usoTotales.llamadas > 0 && (
                <span className="text-xs text-muted-foreground">{usoTotales.llamadas} llamadas · {(usoTotales.tokensIn + usoTotales.tokensOut).toLocaleString("es-AR")} tokens totales</span>
              )}
            </div>

            {usoTotales.llamadas === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                Sin uso registrado aún — las métricas aparecen después del primer procesamiento.
              </div>
            ) : (
              <div className="p-5 space-y-5">
                {/* Costo total */}
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold tabular-nums">${costoTotal.toFixed(4)}</span>
                  <span className="text-xs text-muted-foreground">USD estimado acumulado</span>
                </div>

                {/* Mini gráfico últimos 7 días */}
                {usoPorDia.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Últimos 7 días</p>
                    <div className="flex items-end gap-1 h-16">
                      {usoPorDia.map(d => (
                        <div key={d.dia} className="flex-1 flex flex-col items-center gap-1">
                          <div
                            className="w-full rounded-sm bg-primary/70"
                            style={{ height: `${Math.max(4, Math.round((d.costoUsd / maxDiaCosto) * 52))}px` }}
                            title={`${d.dia}: $${(d.costoUsd / 1_000_000).toFixed(4)}`}
                          />
                          <span className="text-[10px] text-muted-foreground">{d.dia.slice(5)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tabla por modelo */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 font-semibold text-muted-foreground">Proveedor</th>
                        <th className="text-left py-2 font-semibold text-muted-foreground">Modelo</th>
                        <th className="text-right py-2 font-semibold text-muted-foreground">Llamadas</th>
                        <th className="text-right py-2 font-semibold text-muted-foreground">Tokens in</th>
                        <th className="text-right py-2 font-semibold text-muted-foreground">Tokens out</th>
                        <th className="text-right py-2 font-semibold text-muted-foreground">Costo USD</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {usoPorModelo.map(r => (
                        <tr key={`${r.provider}-${r.modelo}`} className="hover:bg-muted/20">
                          <td className="py-2 capitalize">{r.provider}</td>
                          <td className="py-2 font-mono text-[11px] text-muted-foreground">{r.modelo}</td>
                          <td className="py-2 text-right tabular-nums">{r.llamadas}</td>
                          <td className="py-2 text-right tabular-nums">{r.tokensIn.toLocaleString("es-AR")}</td>
                          <td className="py-2 text-right tabular-nums">{r.tokensOut.toLocaleString("es-AR")}</td>
                          <td className="py-2 text-right tabular-nums font-medium">${(r.costoUsd / 1_000_000).toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t">
                      <tr>
                        <td colSpan={5} className="py-2 font-semibold">Total</td>
                        <td className="py-2 text-right font-bold tabular-nums">${costoTotal.toFixed(4)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="text-[11px] text-muted-foreground">Estimado según tarifas publicadas al 2026-07-01. Actualizar en <code className="font-mono">lib/ai/pricing.ts</code> si cambian.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
