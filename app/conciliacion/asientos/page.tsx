"use client"

import { Suspense, useEffect, useMemo } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { ArrowLeft, BookOpen, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { useConciliacion } from "@/lib/context/conciliacion-context"
import { AsientosTangoTable } from "@/components/modules/AsientosTangoTable"
import { construirAsientosTango, asientosToCsv } from "@/lib/conciliacion/asientos-tango"

function AsientosContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const urlId = searchParams.get("id")

  const { conciliaciones, activeId, selectConciliacion } = useConciliacion()

  useEffect(() => {
    if (urlId && conciliaciones[urlId]) selectConciliacion(urlId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlId, conciliaciones[urlId ?? ""]?.loaded])

  const active = activeId ? conciliaciones[activeId] : (urlId ? conciliaciones[urlId] : null)
  const resultado = active?.resultado

  const rows = useMemo(
    () => (resultado ? construirAsientosTango(resultado, active?.bank?.bankName) : []),
    [resultado, active?.bank?.bankName],
  )

  const volver = () => router.push(`/conciliacion?id=${urlId ?? activeId ?? ""}`)

  const copiarCsv = async () => {
    try {
      await navigator.clipboard.writeText(asientosToCsv(rows))
      toast.success("CSV copiado al portapapeles")
    } catch {
      toast.error("No se pudo copiar")
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 px-8 py-8 overflow-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Asientos a subir a Tango</h1>
            <p className="text-sm text-muted-foreground">
              {active?.bank?.bankName ? `${active.bank.bankName} — ` : ""}
              Cambios pendientes, acumulados por categoría, en formato del mayor Tango
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={volver}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver a conciliación
          </Button>
          {rows.length > 0 && (
            <Button variant="outline" size="sm" onClick={copiarCsv}>
              <Copy className="h-4 w-4 mr-2" />
              Copiar CSV
            </Button>
          )}
        </div>
      </div>

      {resultado ? (
        <AsientosTangoTable rows={rows} />
      ) : active && !active.loaded ? (
        <div className="text-sm text-muted-foreground">Cargando…</div>
      ) : (
        <div className="text-sm text-muted-foreground">
          No hay una conciliación cargada.{" "}
          <button onClick={volver} className="text-primary hover:underline">Volver</button>
        </div>
      )}
    </div>
  )
}

export default function AsientosPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Cargando…</div>}>
      <AsientosContent />
    </Suspense>
  )
}
