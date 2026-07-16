"use client"

import { createContext, useContext, useState, useEffect } from "react"

export type Retencion = { tipo: string; porcentaje?: number; monto: number }
export type PagoData = {
  empresa: string
  cuit?: string
  fechaPago: string
  concepto?: string
  nroComprobante?: string
  montoBruto: number
  retenciones: Retencion[]
  montoNeto: number
}

export type VentasSesionUI = {
  id: string
  label: string
  estado: "activo" | "completado" | "error"
  busy: boolean
  error: string | null
  pago: PagoData | null
}

type VentasContextValue = {
  sesiones: Record<string, VentasSesionUI>
  activeId: string | null
  selectSesion: (id: string) => void
  nuevaSesion: () => Promise<string | null>
  deleteSesion: (id: string) => Promise<void>
  renameSesion: (id: string, label: string) => Promise<void>
  uploadFile: (id: string, file: File) => Promise<void>
  uploadFiles: (files: File[]) => Promise<void>
  guardarManual: (id: string, pago: PagoData) => Promise<void>
}

const Ctx = createContext<VentasContextValue | null>(null)

export function useVentas() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useVentas must be used within VentasProvider")
  return ctx
}

export function VentasProvider({ children }: { children: React.ReactNode }) {
  const [sesiones, setSesiones] = useState<Record<string, VentasSesionUI>>({})
  const [activeId, setActiveId] = useState<string | null>(null)

  function patch(id: string, p: Partial<VentasSesionUI>) {
    setSesiones(prev => prev[id] ? { ...prev, [id]: { ...prev[id], ...p } } : prev)
  }

  function selectSesion(id: string) {
    setActiveId(id)
  }

  async function nuevaSesion(): Promise<string | null> {
    try {
      const res = await fetch("/api/sesiones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modulo: "ventas" }),
      })
      const d = await res.json()
      if (!d.id) return null
      const sesion: VentasSesionUI = { id: d.id, label: d.label, estado: "activo", busy: false, error: null, pago: null }
      setSesiones(prev => ({ ...prev, [d.id]: sesion }))
      setActiveId(d.id)
      return d.id
    } catch {
      return null
    }
  }

  async function deleteSesion(id: string) {
    await fetch(`/api/sesiones/${id}`, { method: "DELETE" }).catch(() => {})
    setSesiones(prev => {
      const next = { ...prev }
      delete next[id]
      if (activeId === id) {
        const remaining = Object.keys(next)
        setActiveId(remaining[0] ?? null)
      }
      return next
    })
  }

  async function renameSesion(id: string, label: string) {
    patch(id, { label })
    await fetch(`/api/sesiones/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    }).catch(() => {})
  }

  async function guardarManual(id: string, pago: PagoData) {
    patch(id, { busy: true, error: null })
    try {
      const newLabel = `${pago.empresa} — ${pago.fechaPago}`
      await fetch(`/api/sesiones/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datos: { pago }, estado: "completado", label: newLabel }),
      })
      patch(id, { busy: false, estado: "completado", pago, error: null, label: newLabel })
    } catch {
      patch(id, { busy: false, error: "Error al guardar los datos" })
    }
  }

  async function uploadFile(id: string, file: File) {
    patch(id, { busy: true, error: null })
    const form = new FormData()
    form.append("file", file)
    form.append("sesionId", id)
    try {
      const res = await fetch("/api/ventas/retenciones", { method: "POST", body: form })
      const data = await res.json()
      if (!res.ok) {
        patch(id, { busy: false, error: data.error ?? "Error procesando el archivo" })
        return
      }
      patch(id, { busy: false, estado: "completado", pago: data, error: null })
      // Update label with empresa if available
      if (data.empresa) {
        const newLabel = `${data.empresa} — ${data.fechaPago}`
        renameSesion(id, newLabel)
      }
    } catch {
      patch(id, { busy: false, error: "Error de red. Verificá tu conexión." })
    }
  }

  // Bulk: 1 comprobante = 1 sesión. El primero usa la activa; el resto crea sesión nueva.
  async function uploadFiles(files: File[]) {
    const [first, ...rest] = files
    if (!first) return
    const firstId = activeId ?? (await nuevaSesion())
    if (!firstId) return
    await uploadFile(firstId, first)
    for (const file of rest) {
      const id = await nuevaSesion()
      if (id) await uploadFile(id, file)
    }
  }

  useEffect(() => {
    fetch("/api/sesiones?modulo=ventas")
      .then(r => r.json())
      .then((rows: { id: string; label: string; estado: string; datos: { pago?: PagoData } }[]) => {
        if (!Array.isArray(rows) || rows.length === 0) {
          nuevaSesion()
          return
        }
        const map: Record<string, VentasSesionUI> = {}
        for (const row of rows) {
          const pago: PagoData | null = row.datos?.pago ?? null
          map[row.id] = {
            id: row.id, label: row.label,
            estado: (row.estado as VentasSesionUI["estado"]) ?? "activo",
            busy: false, error: null, pago,
          }
        }
        setSesiones(map)
        setActiveId(rows[0].id)
      })
      .catch(() => nuevaSesion())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Ctx.Provider value={{ sesiones, activeId, selectSesion, nuevaSesion, deleteSesion, renameSesion, uploadFile, uploadFiles, guardarManual }}>
      {children}
    </Ctx.Provider>
  )
}
