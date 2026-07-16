"use client"

import { createContext, useContext, useState, useEffect } from "react"

export type FilaArca = {
  cuitAgente: string; fechaRetencion: string; tipo: string; letra: string
  nroComprobante: string; nroComprOrigen: string; importe: number
}
export type FilaTango = {
  codCta: string; descCta: string; fecha: string; codComp: string
  nComp: string; debe: number; haber: number; saldo: number
}
export type ArcaDatos = { jurisdiccion: string; count: number; filas: FilaArca[] }
export type TangoDatos = { count: number; filas: FilaTango[] }

export type ContabilidadSesionUI = {
  id: string
  label: string
  estado: "activo" | "completado" | "error"
  busy: boolean
  error: string | null
  arca: ArcaDatos | null
  tango: TangoDatos | null
}

type ContabilidadContextValue = {
  sesiones: Record<string, ContabilidadSesionUI>
  activeId: string | null
  selectSesion: (id: string) => void
  nuevaSesion: () => Promise<string | null>
  deleteSesion: (id: string) => Promise<void>
  renameSesion: (id: string, label: string) => Promise<void>
  uploadFile: (id: string, file: File) => Promise<void>
  uploadFiles: (id: string, files: File[]) => Promise<void>
}

const Ctx = createContext<ContabilidadContextValue | null>(null)

export function useContabilidad() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useContabilidad must be used within ContabilidadProvider")
  return ctx
}

export function ContabilidadProvider({ children }: { children: React.ReactNode }) {
  const [sesiones, setSesiones] = useState<Record<string, ContabilidadSesionUI>>({})
  const [activeId, setActiveId] = useState<string | null>(null)

  function patch(id: string, p: Partial<ContabilidadSesionUI>) {
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
        body: JSON.stringify({ modulo: "contabilidad" }),
      })
      const d = await res.json()
      if (!d.id) return null
      const sesion: ContabilidadSesionUI = { id: d.id, label: d.label, estado: "activo", busy: false, error: null, arca: null, tango: null }
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

  async function uploadFile(id: string, file: File) {
    patch(id, { busy: true, error: null })
    const form = new FormData()
    form.append("file", file)
    form.append("sesionId", id)
    try {
      const res = await fetch("/api/contabilidad/upload", { method: "POST", body: form })
      const data = await res.json()
      if (!res.ok) {
        patch(id, { busy: false, error: data.error ?? "Error procesando el archivo" })
        return
      }
      if (data.tipo === "tango") {
        patch(id, { busy: false, tango: { count: data.count, filas: data.filas }, error: null })
      } else {
        patch(id, { busy: false, arca: { jurisdiccion: data.jurisdiccion, count: data.count, filas: data.filas }, error: null })
      }
      // Check if both loaded → completado
      setSesiones(prev => {
        const s = prev[id]
        if (s?.arca && s?.tango) {
          fetch(`/api/sesiones/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ estado: "completado" }),
          }).catch(() => {})
          return { ...prev, [id]: { ...s, estado: "completado" } }
        }
        return prev
      })
    } catch {
      patch(id, { busy: false, error: "Error de red. Verificá tu conexión." })
    }
  }

  // Soltar ARCA+Tango juntos completa la sesión de una; dos archivos del mismo tipo, el segundo pisa al primero (comportamiento actual de la ruta).
  async function uploadFiles(id: string, files: File[]) {
    for (const file of files) await uploadFile(id, file)
  }

  useEffect(() => {
    fetch("/api/sesiones?modulo=contabilidad")
      .then(r => r.json())
      .then((rows: { id: string; label: string; estado: string; datos: { arca?: ArcaDatos; tango?: TangoDatos } }[]) => {
        if (!Array.isArray(rows) || rows.length === 0) {
          nuevaSesion()
          return
        }
        const map: Record<string, ContabilidadSesionUI> = {}
        for (const row of rows) {
          const arca: ArcaDatos | null = row.datos?.arca ?? null
          const tango: TangoDatos | null = row.datos?.tango ?? null
          map[row.id] = {
            id: row.id, label: row.label,
            estado: (row.estado as ContabilidadSesionUI["estado"]) ?? "activo",
            busy: false, error: null, arca, tango,
          }
        }
        setSesiones(map)
        setActiveId(rows[0].id)
      })
      .catch(() => nuevaSesion())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Ctx.Provider value={{ sesiones, activeId, selectSesion, nuevaSesion, deleteSesion, renameSesion, uploadFile, uploadFiles }}>
      {children}
    </Ctx.Provider>
  )
}
