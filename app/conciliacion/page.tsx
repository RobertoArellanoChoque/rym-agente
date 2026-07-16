"use client"

import { useEffect, Suspense, useState } from "react"
import { useSearchParams } from "next/navigation"
import { ArrowLeftRight, ArrowLeft, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { StepIndicator } from "@/components/modules/StepIndicator"
import { UploadDropzone } from "@/components/modules/UploadDropzone"
import { MovimientosPreview } from "@/components/modules/MovimientosPreview"
import { AsientosPreview } from "@/components/modules/AsientosPreview"
import { ComparativaPreview } from "@/components/modules/ComparativaPreview"
import { PartidasEditor } from "@/components/modules/PartidasEditor"
import { ResultTable } from "@/components/modules/ResultTable"
import { DiferidosPanel } from "@/components/modules/DiferidosPanel"
import { LoadingSteps, buildSteps } from "@/components/modules/LoadingSteps"
import { centavosAString } from "@/lib/conciliacion/matching"
import { periodoDeFechas } from "@/lib/conciliacion/periodo"
import { useConciliacion } from "@/lib/context/conciliacion-context"

function ConciliacionContent() {
  const searchParams = useSearchParams()
  const urlId = searchParams.get("id")

  const {
    conciliaciones, activeId, saldos, partidas, sessionError,
    selectConciliacion, patchConc, uploadBanco, uploadBatch, uploadBancoYTango, uploadTango, comparar, savePartidas, back,
  } = useConciliacion()

  const [batchBusy, setBatchBusy] = useState(false)
  const [batchResumen, setBatchResumen] = useState<string | null>(null)

  // Sync URL param → active conciliation
  useEffect(() => {
    if (urlId && urlId !== activeId) {
      selectConciliacion(urlId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlId])

  const active = activeId ? conciliaciones[activeId] : null

  // 1 archivo → flujo de preview de a 1; 2 → banco+tango juntos en esta misma conciliación;
  // 3+ → batch (agrupa por banco+período server-side, sesiones propias).
  async function handleBancoUpload(files: File[]) {
    if (!active) return
    setBatchResumen(null)
    if (files.length === 1) { uploadBanco(active.id, files[0]); return }
    if (files.length === 2) { uploadBancoYTango(active.id, files); return }
    setBatchBusy(true)
    const result = await uploadBatch(files)
    setBatchBusy(false)
    if (!result) return
    const fmtDif = (c?: number) => c == null ? "" : ` — dif $${(Math.abs(c) / 100).toLocaleString("es-AR")}${c === 0 ? " (cuadra)" : ""}`
    const lines = result.sesiones.map((s) =>
      `• ${s.label ?? "Conciliación"}${s.banco && s.tango ? fmtDif(s.diferencia) : s.banco ? " — solo banco (falta mayor)" : " — solo mayor (falta extracto)"}`)
    const errs = result.errores.map((e) => `Error — ${e.file}: ${e.error}`)
    setBatchResumen(`Listo. ${result.sesiones.length} conciliación(es):\n${lines.join("\n")}${errs.length ? `\n\n${errs.join("\n")}` : ""}`)
  }
  // Período del extracto recién cargado (misma lógica que el backend: moda de las fechas).
  const periodo = active && active.movimientos.length > 0
    ? periodoDeFechas(active.movimientos.map(m => m.fecha))
    : undefined

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

          {batchResumen && (
            <div className="relative mb-6 rounded-lg border bg-muted/20 p-4 pr-9 text-sm whitespace-pre-wrap max-w-md">
              <button
                onClick={() => setBatchResumen(null)}
                className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
              {batchResumen}
            </div>
          )}

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
              <UploadDropzone
                accept=".pdf,.xlsx,.xls,.csv"
                multiple
                title="Arrastrá extractos bancarios"
                hint="PDF o Excel — subí el extracto y el mayor de Tango juntos, o varios extractos a la vez"
                buttonLabel="Procesar"
                processing={active.busy === "banco" || active.busy === "banco-tango" || batchBusy}
                stepIndex={active.stepIndex}
                stepLabels={batchBusy ? undefined : active.stepLabels}
                error={active.error}
                onUpload={handleBancoUpload}
              />
            )
          )}

          {active.stage === "banco-done" && (
            active.wantsTango || active.busy === "tango" ? (
              <UploadDropzone
                accept=".xlsx,.xls,.csv"
                multiple={false}
                title="Arrastrá el mayor de Tango"
                hint="Excel (.xlsx, .xls) o CSV"
                buttonLabel="Cargar mayor de Tango"
                processing={active.busy === "tango"}
                stepIndex={active.stepIndex}
                stepLabels={active.stepLabels}
                error={active.error}
                onUpload={(files) => uploadTango(active.id, files[0])}
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
                {periodo && (
                  <DiferidosPanel bankId={active.bank.bankId} periodo={periodo} movimientos={active.movimientos} />
                )}
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
            <div className="space-y-6 max-w-4xl">
              {active.bank && (
                <ComparativaPreview
                  bank={active.bank}
                  movimientos={active.movimientos}
                  saldoAnterior={active.saldoAnterior}
                  saldoFinal={active.saldoFinal}
                  asientos={active.asientos}
                />
              )}
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
