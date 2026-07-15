"use client"

import { useEffect, Suspense, useState, useRef } from "react"
import { useSearchParams } from "next/navigation"
import {
  Upload, File, X, Loader2, CheckCircle2, AlertCircle, ShoppingCart, Plus, Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { useVentas, PagoData } from "@/lib/context/ventas-context"

function fmt(c: number) {
  const sign = c < 0 ? "-" : ""
  return `${sign}$${(Math.abs(c) / 100).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
}

type RetRow = { tipo: string; monto: string }

function ManualForm({ onSubmit, loading }: { onSubmit: (p: PagoData) => void; loading: boolean }) {
  const [empresa, setEmpresa] = useState("")
  const [cuit, setCuit] = useState("")
  const [fechaPago, setFechaPago] = useState("")
  const [concepto, setConcepto] = useState("")
  const [nroComprobante, setNroComprobante] = useState("")
  const [montoBruto, setMontoBruto] = useState("")
  const [rows, setRows] = useState<RetRow[]>([{ tipo: "", monto: "" }])

  const totalRet = rows.reduce((s, r) => s + (parseFloat(r.monto.replace(",", ".")) || 0), 0)
  const brutoNum = parseFloat(montoBruto.replace(",", ".")) || 0
  const montoNeto = brutoNum - totalRet

  function setRow(i: number, field: keyof RetRow, val: string) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!empresa || !fechaPago || !montoBruto) return
    const pago: PagoData = {
      empresa,
      cuit: cuit || undefined,
      fechaPago,
      concepto: concepto || undefined,
      nroComprobante: nroComprobante || undefined,
      montoBruto: Math.round(brutoNum * 100),
      montoNeto: Math.round(montoNeto * 100),
      retenciones: rows
        .filter(r => r.tipo.trim() && r.monto.trim())
        .map(r => ({ tipo: r.tipo.trim(), monto: Math.round((parseFloat(r.monto.replace(",", ".")) || 0) * 100) })),
    }
    onSubmit(pago)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1">
          <p className="text-xs text-muted-foreground font-medium">Empresa *</p>
          <Input value={empresa} onChange={e => setEmpresa(e.target.value)} placeholder="Nombre del cliente" required />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium">CUIT</p>
          <Input value={cuit} onChange={e => setCuit(e.target.value)} placeholder="20-12345678-9" />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium">Fecha de pago *</p>
          <Input type="date" value={fechaPago} onChange={e => setFechaPago(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium">N° comprobante</p>
          <Input value={nroComprobante} onChange={e => setNroComprobante(e.target.value)} placeholder="0001-00001234" />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium">Concepto</p>
          <Input value={concepto} onChange={e => setConcepto(e.target.value)} placeholder="Factura B 0001-00000123" />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium">Monto bruto *</p>
          <Input value={montoBruto} onChange={e => setMontoBruto(e.target.value)} placeholder="100000.00" required />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground font-medium">Retenciones</p>
          <button type="button" onClick={() => setRows(r => [...r, { tipo: "", monto: "" }])}
            className="flex items-center gap-1 text-xs text-primary hover:underline">
            <Plus className="h-3 w-3" /> Agregar
          </button>
        </div>
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2 items-center">
            <Input className="flex-1 text-xs h-8" placeholder="Tipo (ej: Ganancias, IVA, IIBB)"
              value={r.tipo} onChange={e => setRow(i, "tipo", e.target.value)} />
            <Input className="w-32 text-xs h-8 tabular-nums" placeholder="Monto"
              value={r.monto} onChange={e => setRow(i, "monto", e.target.value)} />
            {rows.length > 1 && (
              <button type="button" onClick={() => setRows(r => r.filter((_, idx) => idx !== i))}
                className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {brutoNum > 0 && (
        <div className="rounded-md bg-muted p-3 text-sm space-y-1">
          <div className="flex justify-between text-muted-foreground">
            <span>Monto bruto</span><span className="tabular-nums">{fmt(Math.round(brutoNum * 100))}</span>
          </div>
          {totalRet > 0 && (
            <div className="flex justify-between text-destructive">
              <span>Total retenciones</span><span className="tabular-nums">-{fmt(Math.round(totalRet * 100))}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold pt-1 border-t">
            <span>Neto acreditado</span><span className="tabular-nums text-emerald-700">{fmt(Math.round(montoNeto * 100))}</span>
          </div>
        </div>
      )}

      <Button type="submit" disabled={loading || !empresa || !fechaPago || !montoBruto} className="w-full">
        {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando…</> : "Guardar retenciones"}
      </Button>
    </form>
  )
}

function VentasContent() {
  const searchParams = useSearchParams()
  const urlId = searchParams.get("id")
  const { sesiones, activeId, selectSesion, uploadFile, guardarManual } = useVentas()

  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [inputMode, setInputMode] = useState<"pdf" | "manual">("pdf")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (urlId && urlId !== activeId && sesiones[urlId]) selectSesion(urlId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlId])

  const active = activeId ? sesiones[activeId] : null
  const pago = active?.pago ?? null
  const loading = active?.busy ?? false
  const error = active?.error ?? null
  const totalRetenciones = pago?.retenciones.reduce((s, r) => s + r.monto, 0) ?? 0

  async function handleUpload() {
    if (!file || !activeId) return
    await uploadFile(activeId, file)
    setFile(null)
  }

  async function handleManual(data: PagoData) {
    if (!activeId) return
    await guardarManual(activeId, data)
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-6 py-5 border-b">
        <div className="flex items-center gap-3">
          <ShoppingCart className="h-5 w-5 text-muted-foreground" />
          <div>
            <h1 className="text-lg font-bold">{active?.label ?? "Ventas — Retenciones"}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Registrá las retenciones de un comprobante de pago
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {!active ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Seleccioná o creá una sesión de ventas desde el panel derecho.
          </div>
        ) : (
          <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Input panel */}
            <div className="space-y-4">
              {/* Mode toggle */}
              <div className="flex rounded-lg border overflow-hidden text-xs font-medium">
                <button
                  onClick={() => setInputMode("pdf")}
                  className={`flex-1 py-2 transition-colors ${inputMode === "pdf" ? "bg-primary text-primary-foreground" : "hover:bg-muted/50 text-muted-foreground"}`}
                >
                  Subir PDF
                </button>
                <button
                  onClick={() => setInputMode("manual")}
                  className={`flex-1 py-2 transition-colors ${inputMode === "manual" ? "bg-primary text-primary-foreground" : "hover:bg-muted/50 text-muted-foreground"}`}
                >
                  Ingresar manualmente
                </button>
              </div>

              {inputMode === "pdf" ? (
                <>
                  <div
                    onClick={() => inputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragging(true) }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={e => {
                      e.preventDefault(); setDragging(false)
                      const f = e.dataTransfer.files[0]; if (f) setFile(f)
                    }}
                    className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors
                      ${dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"}`}
                  >
                    <input ref={inputRef} type="file" accept=".pdf,.xlsx,.xls,.csv" className="hidden"
                      onChange={e => e.target.files?.[0] && setFile(e.target.files[0])} />
                    <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-sm font-medium">Arrastrá el comprobante de pago</p>
                    <p className="text-xs text-muted-foreground mt-1">Orden de pago, recibo de retención — PDF, Excel o CSV</p>
                  </div>

                  {file && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-md text-sm">
                      <File className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">{file.name}</span>
                      <button onClick={() => setFile(null)}><X className="h-4 w-4 text-muted-foreground hover:text-foreground" /></button>
                    </div>
                  )}

                  <Button onClick={handleUpload} disabled={!file || loading} className="w-full">
                    {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Procesando PDF…</> : "Extraer retenciones"}
                  </Button>
                  {loading && <p className="text-xs text-muted-foreground text-center">OCR + IA extrayendo datos — puede demorar unos segundos</p>}
                </>
              ) : (
                <ManualForm onSubmit={handleManual} loading={loading} />
              )}

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            {/* Result panel */}
            {pago ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <h2 className="text-sm font-semibold">Datos registrados</h2>
                </div>
                <div className="rounded-lg border bg-card p-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground shrink-0">Empresa</span>
                    <span className="font-medium text-right">{pago.empresa}</span>
                  </div>
                  {pago.cuit && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">CUIT</span>
                      <span className="tabular-nums">{pago.cuit}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fecha de pago</span>
                    <span className="tabular-nums">{pago.fechaPago}</span>
                  </div>
                  {pago.nroComprobante && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">N° comprobante</span>
                      <span className="tabular-nums">{pago.nroComprobante}</span>
                    </div>
                  )}
                  {pago.concepto && (
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground shrink-0">Concepto</span>
                      <span className="text-right">{pago.concepto}</span>
                    </div>
                  )}
                </div>
                {pago.retenciones.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Retenciones</p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tipo</TableHead>
                          <TableHead className="text-right">%</TableHead>
                          <TableHead className="text-right">Monto</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pago.retenciones.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-sm py-2"><Badge variant="secondary" className="text-xs">{r.tipo}</Badge></TableCell>
                            <TableCell className="text-right tabular-nums text-sm py-2 text-muted-foreground">{r.porcentaje != null ? `${r.porcentaje}%` : "—"}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm py-2 text-destructive">-{fmt(r.monto)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                <Separator />
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Monto bruto</span>
                    <span className="tabular-nums font-medium">{fmt(pago.montoBruto)}</span>
                  </div>
                  {totalRetenciones > 0 && (
                    <div className="flex justify-between text-destructive">
                      <span>Total retenciones</span>
                      <span className="tabular-nums">-{fmt(totalRetenciones)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold pt-1 border-t">
                    <span>Neto acreditado</span>
                    <span className="tabular-nums text-emerald-700">{fmt(pago.montoNeto)}</span>
                  </div>
                </div>
              </div>
            ) : (
              !loading && (
                <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-12 text-muted-foreground">
                  <div className="p-4 rounded-full bg-muted"><ShoppingCart className="h-8 w-8" /></div>
                  <p className="text-sm">Los datos registrados aparecerán acá</p>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function VentasPage() {
  return <Suspense><VentasContent /></Suspense>
}
