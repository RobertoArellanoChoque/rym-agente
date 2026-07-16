"use client"

import { useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { BookOpen, CheckCircle2, AlertTriangle, X } from "lucide-react"
import { UploadDropzone } from "@/components/modules/UploadDropzone"
import { useContabilidad } from "@/lib/context/contabilidad-context"

function fmt(n: number) {
  return `${n < 0 ? "-" : ""}$${(Math.abs(n) / 100).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
}

function ContabilidadContent() {
  const searchParams = useSearchParams()
  const urlId = searchParams.get("id")
  const { sesiones, activeId, selectSesion, uploadFiles } = useContabilidad()

  useEffect(() => {
    if (urlId && urlId !== activeId && sesiones[urlId]) selectSesion(urlId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlId])

  const active = activeId ? sesiones[activeId] : null
  const arca = active?.arca ?? null
  const tango = active?.tango ?? null
  const loading = active?.busy ?? false
  const error = active?.error ?? null

  const totalArca = arca?.filas.reduce((s, r) => s + r.importe, 0) ?? 0
  const totalHaber = tango?.filas.reduce((s, r) => s + r.haber, 0) ?? 0
  const delta = Math.abs(totalArca - totalHaber)
  const balanced = arca && tango && delta === 0

  return (
    <div className="flex flex-1 flex-col px-8 py-6 gap-4 min-h-0 overflow-auto">
      <div className="flex items-center gap-3">
        <BookOpen className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-bold">{active?.label ?? "Contabilidad — Retenciones"}</h1>
      </div>

      {!active ? (
        <div className="flex items-center justify-center flex-1 text-sm text-muted-foreground">
          Seleccioná o creá una sesión de contabilidad desde el panel derecho.
        </div>
      ) : (
        <>
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
              <button className="ml-auto" onClick={() => {/* clear via context if needed */}}><X className="h-3.5 w-3.5" /></button>
            </div>
          )}

          {!arca && !tango && (
            <div className="flex-1 flex items-center justify-center">
              <UploadDropzone
                accept=".xlsx,.xls"
                multiple
                title="Arrastrá los archivos"
                hint="ARCA y/o Tango (.xlsx, .xls)"
                processing={loading}
                onUpload={files => uploadFiles(active.id, files)}
              />
            </div>
          )}

          {(arca || tango) && (
            <div className="flex flex-col gap-4">
              {arca && tango && (
                <div className="flex items-center gap-6 px-4 py-3 rounded-lg border bg-card text-sm">
                  <div><p className="text-[11px] text-muted-foreground">ARCA total</p><p className="font-bold tabular-nums">{fmt(totalArca)}</p></div>
                  <div className="h-8 w-px bg-border" />
                  <div><p className="text-[11px] text-muted-foreground">Tango haber</p><p className="font-bold tabular-nums">{fmt(totalHaber)}</p></div>
                  <div className="h-8 w-px bg-border" />
                  <div className={balanced ? "text-emerald-600" : "text-amber-600"}>
                    <p className="text-[11px] opacity-70">Diferencia</p>
                    <p className="font-bold tabular-nums flex items-center gap-1">
                      {balanced && <CheckCircle2 className="h-3.5 w-3.5" />}
                      {balanced ? "Sin diferencia" : fmt(delta)}
                    </p>
                  </div>
                </div>
              )}

              {arca && (
                <div className="rounded-lg border bg-card">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">ARCA</span>
                      <span className="text-xs bg-muted px-2 py-0.5 rounded-full capitalize">{arca.jurisdiccion}</span>
                    </div>
                    <span className="flex items-center gap-1.5 text-xs text-emerald-600">
                      <CheckCircle2 className="h-3.5 w-3.5" />{arca.count} registros · {fmt(totalArca)}
                    </span>
                  </div>
                  <div className="overflow-auto max-h-64">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted/80">
                        <tr>{["CUIT","Fecha","Tipo","Letra","Comprobante","Importe"].map(h =>
                          <th key={h} className={`px-3 py-2 text-left font-medium text-muted-foreground ${h==="Importe"?"text-right":""}`}>{h}</th>
                        )}</tr>
                      </thead>
                      <tbody className="divide-y">
                        {arca.filas.map((r, i) => (
                          <tr key={i} className="hover:bg-muted/30">
                            <td className="px-3 py-1.5 font-mono">{r.cuitAgente}</td>
                            <td className="px-3 py-1.5">{r.fechaRetencion}</td>
                            <td className="px-3 py-1.5">{r.tipo}</td>
                            <td className="px-3 py-1.5">{r.letra}</td>
                            <td className="px-3 py-1.5 font-mono text-[11px]">{r.nroComprobante}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{fmt(r.importe)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t bg-muted/30">
                        <tr><td colSpan={5} className="px-3 py-2 text-xs font-semibold">Total</td><td className="px-3 py-2 text-right text-xs font-bold tabular-nums">{fmt(totalArca)}</td></tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {tango && (
                <div className="rounded-lg border bg-card">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b">
                    <span className="text-sm font-semibold">Tango</span>
                    <span className="flex items-center gap-1.5 text-xs text-emerald-600">
                      <CheckCircle2 className="h-3.5 w-3.5" />{tango.count} registros · Haber: {fmt(totalHaber)}
                    </span>
                  </div>
                  <div className="overflow-auto max-h-64">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted/80">
                        <tr>{["Cuenta","Descripción","Fecha","Comprobante","Debe","Haber","Saldo"].map(h =>
                          <th key={h} className={`px-3 py-2 text-left font-medium text-muted-foreground ${["Debe","Haber","Saldo"].includes(h)?"text-right":""}`}>{h}</th>
                        )}</tr>
                      </thead>
                      <tbody className="divide-y">
                        {tango.filas.map((r, i) => (
                          <tr key={i} className="hover:bg-muted/30">
                            <td className="px-3 py-1.5 font-mono">{r.codCta}</td>
                            <td className="px-3 py-1.5 max-w-[120px] truncate" title={r.descCta}>{r.descCta}</td>
                            <td className="px-3 py-1.5">{r.fecha}</td>
                            <td className="px-3 py-1.5 font-mono text-[11px]">{r.nComp}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{r.debe ? fmt(r.debe) : "—"}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{r.haber ? fmt(r.haber) : "—"}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fmt(r.saldo)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t bg-muted/30">
                        <tr>
                          <td colSpan={4} className="px-3 py-2 text-xs font-semibold">Total Haber</td>
                          <td className="px-3 py-2 text-right text-xs font-bold tabular-nums">—</td>
                          <td className="px-3 py-2 text-right text-xs font-bold tabular-nums">{fmt(totalHaber)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {!tango && (
                <UploadDropzone
                  accept=".xlsx,.xls"
                  title="Ahora subí el exportado de Tango"
                  hint="Excel (.xlsx, .xls)"
                  processing={loading}
                  onUpload={files => uploadFiles(active.id, files)}
                />
              )}
              {!arca && (
                <UploadDropzone
                  accept=".xlsx,.xls"
                  title="Ahora subí el exportado de ARCA"
                  hint="Excel (.xlsx, .xls)"
                  processing={loading}
                  onUpload={files => uploadFiles(active.id, files)}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function ContabilidadPage() {
  return <Suspense><ContabilidadContent /></Suspense>
}
