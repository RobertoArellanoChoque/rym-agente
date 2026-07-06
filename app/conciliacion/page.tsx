"use client"

import { useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { ArrowLeftRight, ArrowLeft, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { StepIndicator } from "@/components/modules/StepIndicator"
import { BancoUpload } from "@/components/modules/BancoUpload"
import { TangoUpload } from "@/components/modules/TangoUpload"
import { MovimientosPreview } from "@/components/modules/MovimientosPreview"
import { AsientosPreview } from "@/components/modules/AsientosPreview"
import { PartidasEditor } from "@/components/modules/PartidasEditor"
import { ResultTable } from "@/components/modules/ResultTable"
import { LoadingSteps, buildSteps } from "@/components/modules/LoadingSteps"
import { centavosAString } from "@/lib/conciliacion/matching"
import { useConciliacion } from "@/lib/context/conciliacion-context"

function ConciliacionContent() {
  const searchParams = useSearchParams()
  const urlId = searchParams.get("id")

  const {
    conciliaciones, activeId, saldos, partidas, sessionError,
    selectConciliacion, patchConc, uploadBanco, uploadTango, comparar, savePartidas, back,
  } = useConciliacion()

  // Sync URL param → active conciliation
  useEffect(() => {
    if (urlId && urlId !== activeId && conciliaciones[urlId]) {
      selectConciliacion(urlId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlId])

  const active = activeId ? conciliaciones[activeId] : null

  return (
    <div className="flex flex-col flex-1 min-h-0 px-8 py-8 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <ArrowLeftRight className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">{active?.label ?? "Conciliación Bancaria"}</h1>
            <p className="text-sm text-muted-foreground">Cruzá extractos contra el mayor de Tango</p>
            {Object.values(saldos).map((s) =>
              s.saldoConciliado !== undefined ? (
                <p key={s.bankId} className="text-xs text-muted-foreground mt-0.5">
                  Último saldo conciliado {s.bankName}:{" "}
                  <span className="font-semibold text-foreground">{centavosAString(s.saldoConciliado)}</span>{" "}
                  al {s.fechaConciliacion}
                </p>
              ) : null
            )}
          </div>
        </div>
        {active && active.stage !== "new" && !active.busy && (
          <Button variant="outline" size="sm" onClick={() => back(active.id)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Atrás
          </Button>
        )}
      </div>

      {sessionError && <p className="text-sm text-destructive mb-4">{sessionError}</p>}

      {!active ? (
        <p className="text-sm text-muted-foreground">Seleccioná o creá una conciliación desde el panel derecho.</p>
      ) : (
        <>
          <div className="mb-6">
            <StepIndicator stage={active.stage} />
          </div>
          <Separator className="mb-6" />

          {active.stage === "new" && (
            active.movimientos.length > 0 && active.bank && !active.wantsBancoChange ? (
              <div className="space-y-6 max-w-2xl">
                <MovimientosPreview
                  bank={active.bank}
                  movimientos={active.movimientos}
                  saldoAnterior={active.saldoAnterior}
                  saldoFinal={active.saldoFinal}
                />
                <div className="flex items-center gap-3">
                  <Button onClick={() => patchConc(active.id, { stage: "banco-done" })}>
                    Usar este extracto → Continuar
                  </Button>
                  <Button variant="outline" onClick={() => patchConc(active.id, { wantsBancoChange: true })}>
                    Cambiar extracto
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {active.movimientos.length} movimientos listos
                  </span>
                </div>
              </div>
            ) : (
              <BancoUpload
                processing={active.busy === "banco"}
                stepIndex={active.stepIndex}
                stepLabels={active.stepLabels}
                error={active.error}
                onUpload={(file) => uploadBanco(active.id, file)}
              />
            )
          )}

          {active.stage === "banco-done" && (
            active.wantsTango || active.busy === "tango" ? (
              <TangoUpload
                processing={active.busy === "tango"}
                stepIndex={active.stepIndex}
                stepLabels={active.stepLabels}
                error={active.error}
                onUpload={(file) => uploadTango(active.id, file)}
              />
            ) : active.asientos.length > 0 && active.bank ? (
              <div className="space-y-6 max-w-2xl">
                <div>
                  <h3 className="text-sm font-semibold mb-3">Extracto bancario (cargado)</h3>
                  <MovimientosPreview
                    bank={active.bank}
                    movimientos={active.movimientos}
                    saldoAnterior={active.saldoAnterior}
                    saldoFinal={active.saldoFinal}
                  />
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-3">Mayor Tango (cargado)</h3>
                  <AsientosPreview asientos={active.asientos} />
                </div>
                <div className="flex items-center gap-3">
                  <Button onClick={() => patchConc(active.id, { stage: "tango-done" })}>
                    Continuar → Conciliar
                  </Button>
                  <Button variant="outline" onClick={() => patchConc(active.id, { wantsTango: true })}>
                    Cambiar mayor
                  </Button>
                </div>
              </div>
            ) : active.bank ? (
              <div className="space-y-6 max-w-2xl">
                <MovimientosPreview
                  bank={active.bank}
                  movimientos={active.movimientos}
                  saldoAnterior={active.saldoAnterior}
                  saldoFinal={active.saldoFinal}
                />
                <div className="flex items-center gap-3">
                  <Button onClick={() => patchConc(active.id, { wantsTango: true })}>
                    Continuar → Cargar Mayor Tango
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {active.movimientos.length} movimientos listos
                  </span>
                </div>
              </div>
            ) : null
          )}

          {active.stage === "tango-done" && (
            <div className="space-y-6 max-w-2xl">
              <AsientosPreview asientos={active.asientos} />
              <div className="flex items-center gap-2 p-3 rounded-md bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Archivos cargados</p>
                  <p className="text-xs mt-0.5">
                    {active.movimientos.length} movimientos del banco · {active.asientos.length} asientos de Tango
                  </p>
                </div>
              </div>
              {active.bank && (
                <PartidasEditor
                  bankId={active.bank.bankId}
                  partidas={partidas[active.bank.bankId] ?? []}
                  onChange={(nuevasPartidas) => savePartidas(active.bank!.bankId, nuevasPartidas)}
                />
              )}
              {active.error && <p className="text-sm text-destructive">{active.error}</p>}
              {active.busy === "comparar" ? (
                <div className="rounded-lg border bg-muted/20 px-5 py-4 max-w-xs">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                    Conciliando…
                  </p>
                  <LoadingSteps steps={buildSteps(active.stepLabels, active.stepIndex)} />
                </div>
              ) : (
                <Button onClick={() => comparar(active.id)} className="w-full max-w-md">
                  Ejecutar comparación
                </Button>
              )}
            </div>
          )}

          {active.stage === "done" && active.resultado && <ResultTable resultado={active.resultado} sessionId={active.id} />}
        </>
      )}
    </div>
  )
}

export default function ConciliacionPage() {
  return (
    <Suspense>
      <ConciliacionContent />
    </Suspense>
  )
}
