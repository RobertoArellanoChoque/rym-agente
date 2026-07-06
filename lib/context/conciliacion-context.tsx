"use client"

import { createContext, useContext, useState, useEffect, useRef } from "react"
import type { ConciliacionUI, Movimiento, Discrepancia } from "@/lib/types"
import type { SaldoBanco } from "@/lib/saldos/manager"
import type { Partida } from "@/lib/partidas/manager"

const STEPS_PDF = ["Subiendo archivo", "Procesando PDF con OCR (Mistral)", "Detectando banco", "Extrayendo movimientos con IA", "Guardando resultados"]
const STEPS_EXCEL = ["Subiendo archivo", "Leyendo datos del archivo", "Detectando banco", "Guardando resultados"]
const TIMINGS_PDF = [800, 7000, 11000, 18000]
const TIMINGS_EXCEL = [300, 800, 1500]
const TANGO_STEPS = ["Subiendo archivo", "Detectando formato y columnas", "Procesando asientos"]
const TANGO_TIMINGS = [500, 1500]
const COMPARE_STEPS = ["Leyendo movimientos del banco", "Leyendo asientos de Tango", "Ejecutando algoritmo de matching", "Calculando discrepancias"]
const COMPARE_TIMINGS = [300, 700, 1500]

type ListItem = {
  id: string; label: string; createdAt: string; stage: ConciliacionUI["stage"]
  bankId?: string; bankName?: string; confidence?: "high" | "low"
  saldoAnterior?: number; saldoFinal?: number
}

export type ConciliacionContextValue = {
  conciliaciones: Record<string, ConciliacionUI>
  activeId: string | null
  saldos: Record<string, SaldoBanco>
  partidas: Record<string, Partida[]>
  sessionError: string | null
  setActiveId: (id: string | null) => void
  patchConc: (id: string, patch: Partial<ConciliacionUI>) => void
  selectConciliacion: (id: string) => void
  nuevaConciliacion: (label?: string) => Promise<string | null>
  renameConciliacion: (id: string, label: string) => Promise<void>
  deleteConciliacion: (id: string) => Promise<void>
  uploadBanco: (id: string, file: File) => Promise<void>
  uploadTango: (id: string, file: File) => Promise<void>
  comparar: (id: string) => Promise<void>
  savePartidas: (bankId: string, items: Partida[]) => Promise<void>
  back: (id: string) => void
}

const Ctx = createContext<ConciliacionContextValue | null>(null)

export function useConciliacion() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useConciliacion must be used within ConciliacionProvider")
  return ctx
}

export function ConciliacionProvider({ children }: { children: React.ReactNode }) {
  const [conciliaciones, setConciliaciones] = useState<Record<string, ConciliacionUI>>({})
  const [activeId, setActiveId] = useState<string | null>(null)
  const [saldos, setSaldos] = useState<Record<string, SaldoBanco>>({})
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [partidas, setPartidas] = useState<Record<string, Partida[]>>({})

  const aborters = useRef<Record<string, AbortController>>({})
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>[]>>({})

  function patchConc(id: string, patch: Partial<ConciliacionUI>) {
    setConciliaciones((prev) =>
      prev[id] ? { ...prev, [id]: { ...prev[id], ...patch } } : prev
    )
  }

  function clearSteps(id: string) {
    ;(timers.current[id] ?? []).forEach(clearTimeout)
    timers.current[id] = []
  }

  function startSteps(id: string, timing: number[]) {
    clearSteps(id)
    patchConc(id, { stepIndex: 0 })
    timers.current[id] = timing.map((t, i) =>
      setTimeout(() => patchConc(id, { stepIndex: i + 1 }), t)
    )
  }

  function fetchSaldos() {
    fetch("/api/saldos").then((r) => r.json()).then(setSaldos).catch(() => {})
  }

  async function loadPartidas(bankId: string) {
    try {
      const res = await fetch(`/api/partidas?bankId=${encodeURIComponent(bankId)}`)
      if (res.ok) {
        const data = await res.json()
        setPartidas((prev) => ({ ...prev, [bankId]: data }))
      }
    } catch { /* silenciar */ }
  }

  async function savePartidas(bankId: string, items: Partida[]) {
    try {
      await fetch("/api/partidas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankId, partidas: items }),
      })
      setPartidas((prev) => ({ ...prev, [bankId]: items }))
    } catch { /* silenciar */ }
  }

  async function loadState(id: string) {
    try {
      const res = await fetch(`/api/conciliacion/state?sessionId=${id}`)
      const d = await res.json()
      if (d.expired) {
        patchConc(id, { loaded: true, error: "Sesión expirada — datos no disponibles" })
        return
      }
      patchConc(id, {
        loaded: true, stage: d.stage, bank: d.bank ?? undefined,
        movimientos: d.movimientos ?? [], asientos: d.asientos ?? [],
        saldoAnterior: d.saldoAnterior, saldoFinal: d.saldoFinal,
        resultado: d.resultado ?? null, error: null,
      })
    } catch {
      patchConc(id, { loaded: true, error: "Error cargando la conciliación" })
    }
  }

  function selectConciliacion(id: string) {
    setActiveId(id)
    setConciliaciones((prev) => {
      const c = prev[id]
      if (c && !c.loaded && !c.busy) {
        loadState(id)
      }
      return prev
    })
  }

  async function nuevaConciliacion(label?: string): Promise<string | null> {
    try {
      const r = await fetch("/api/conciliacion/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(label ? { label } : {}),
      })
      const d = await r.json()
      if (!d.sessionId) { setSessionError("No se pudo iniciar la conciliación"); return null }
      const conc: ConciliacionUI = {
        id: d.sessionId, label: d.label ?? label ?? "Conciliación",
        createdAt: new Date().toISOString(), stage: "new", busy: null,
        stepIndex: -1, stepLabels: [], movimientos: [], asientos: [], loaded: true,
      }
      setConciliaciones((prev) => ({ ...prev, [conc.id]: conc }))
      setActiveId(conc.id)
      setSessionError(null)
      return conc.id
    } catch {
      setSessionError("Error de red al crear la conciliación")
      return null
    }
  }

  async function renameConciliacion(id: string, label: string) {
    patchConc(id, { label })
    await fetch(`/api/conciliacion/${id}/label`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    }).catch(console.error)
  }

  async function deleteConciliacion(id: string) {
    aborters.current[id]?.abort()
    delete aborters.current[id]
    clearSteps(id)
    // Borrar en DB PRIMERO — solo sacarla de la UI si Supabase confirmó,
    // así una conciliación nunca desaparece de pantalla quedando viva en la base.
    const res = await fetch("/api/conciliacion/cleanup", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: id }),
    }).catch(() => null)
    if (!res || !res.ok) {
      console.error("[deleteConciliacion] no se pudo borrar en la base:", id, res?.status)
      return
    }
    setConciliaciones((prev) => {
      const next = { ...prev }
      delete next[id]
      if (activeId === id) {
        const remaining = Object.keys(next)
        setActiveId(remaining[0] ?? null)
        if (remaining[0]) loadState(remaining[0])
      }
      return next
    })
  }

  async function uploadBanco(id: string, file: File) {
    const isPdf = file.name.toLowerCase().endsWith(".pdf")
    const labels = isPdf ? STEPS_PDF : STEPS_EXCEL
    patchConc(id, { busy: "banco", error: null, stepLabels: labels })
    startSteps(id, isPdf ? TIMINGS_PDF : TIMINGS_EXCEL)

    const ac = new AbortController()
    aborters.current[id] = ac
    const form = new FormData()
    form.append("file", file)
    form.append("sessionId", id)

    try {
      const res = await fetch("/api/conciliacion/banco", { method: "POST", body: form, signal: ac.signal })
      const data = await res.json()
      clearSteps(id)
      if (!res.ok) {
        patchConc(id, { busy: null, stepIndex: -1, error: data.error ?? "Error procesando extracto" })
        return
      }
      patchConc(id, {
        busy: null, stepIndex: -1, stage: "banco-done", bank: data.bank,
        movimientos: data.movimientos, saldoAnterior: data.saldoAnterior,
        saldoFinal: data.saldoFinal, error: null,
        ...(data.label && { label: data.label }),
      })
      fetchSaldos()
    } catch (e) {
      clearSteps(id)
      if ((e as Error).name === "AbortError") return
      patchConc(id, { busy: null, stepIndex: -1, error: "Error de red. Verificá tu conexión." })
    }
  }

  async function uploadTango(id: string, file: File) {
    patchConc(id, { busy: "tango", error: null, stepLabels: TANGO_STEPS })
    startSteps(id, TANGO_TIMINGS)

    const ac = new AbortController()
    aborters.current[id] = ac
    const form = new FormData()
    form.append("file", file)
    form.append("sessionId", id)

    try {
      const res = await fetch("/api/conciliacion/tango", { method: "POST", body: form, signal: ac.signal })
      const data = await res.json()
      clearSteps(id)
      if (!res.ok) {
        patchConc(id, { busy: null, stepIndex: -1, error: data.error ?? "Error procesando mayor de Tango" })
        return
      }
      patchConc(id, {
        busy: null, stepIndex: -1, stage: "tango-done",
        asientos: data.asientos, wantsTango: false, error: null,
      })
    } catch (e) {
      clearSteps(id)
      if ((e as Error).name === "AbortError") return
      patchConc(id, { busy: null, stepIndex: -1, error: "Error de red. Verificá tu conexión." })
    }
  }

  async function comparar(id: string) {
    patchConc(id, { busy: "comparar", error: null, stepLabels: COMPARE_STEPS })
    startSteps(id, COMPARE_TIMINGS)

    const ac = new AbortController()
    aborters.current[id] = ac

    try {
      const res = await fetch("/api/conciliacion/comparar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: id }),
        signal: ac.signal,
      })
      const data = await res.json()
      clearSteps(id)
      if (!res.ok) {
        patchConc(id, { busy: null, stepIndex: -1, error: data.error ?? "Error ejecutando comparación" })
        return
      }
      patchConc(id, { busy: null, stepIndex: -1, stage: "done", resultado: data, error: null })

      // Persistir saldo conciliado
      setConciliaciones((prev) => {
        const conc = prev[id]
        if (conc?.bank) {
          const lastFecha =
            [...data.movimientos].sort((a: Movimiento, b: Movimiento) => a.fecha.localeCompare(b.fecha)).pop()?.fecha ??
            new Date().toISOString().slice(0, 10)
          const unmatched = (data.discrepancias as Discrepancia[])
            .filter((d) => d.tipo === "en_extracto_no_en_mayor")
            .reduce((s, d) => s + d.monto, 0)
          const saldoConciliado = data.saldoBanco - unmatched
          fetch("/api/saldos", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bankId: conc.bank.bankId, saldoConciliado, fechaConciliacion: lastFecha }),
          })
            .then(() => setSaldos((prev2) => ({
              ...prev2,
              [conc.bank!.bankId]: { ...prev2[conc.bank!.bankId], saldoConciliado, fechaConciliacion: lastFecha },
            })))
            .catch(() => {})
        }
        return prev
      })
    } catch (e) {
      clearSteps(id)
      if ((e as Error).name === "AbortError") return
      patchConc(id, { busy: null, stepIndex: -1, error: "Error de red. Verificá tu conexión." })
    }
  }

  function back(id: string) {
    setConciliaciones((prev) => {
      const c = prev[id]
      if (!c || c.busy) return prev
      if (c.stage === "done") return { ...prev, [id]: { ...c, stage: "tango-done", resultado: null } }
      if (c.stage === "tango-done") return { ...prev, [id]: { ...c, stage: "banco-done", wantsTango: false } }
      if (c.stage === "banco-done") return { ...prev, [id]: { ...c, stage: "new", wantsBancoChange: false } }
      return prev
    })
  }

  // Mount: load list + saldos
  useEffect(() => {
    fetchSaldos()
    fetch("/api/conciliacion/list")
      .then((r) => r.json())
      .then((items: ListItem[]) => {
        if (!Array.isArray(items)) return
        const map: Record<string, ConciliacionUI> = {}
        for (const it of items) {
          map[it.id] = {
            id: it.id, label: it.label, createdAt: it.createdAt, stage: it.stage,
            busy: null, stepIndex: -1, stepLabels: [],
            bank: it.bankId ? { bankId: it.bankId, bankName: it.bankName ?? "", confidence: it.confidence ?? "low" } : undefined,
            movimientos: [], asientos: [],
            saldoAnterior: it.saldoAnterior, saldoFinal: it.saldoFinal, loaded: false,
          }
        }
        setConciliaciones(map)
        const first = items[0]?.id ?? null
        if (first) { setActiveId(first); loadState(first) }
        else nuevaConciliacion()
      })
      .catch(() => nuevaConciliacion())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load partidas when entering tango-done
  const activeConcWithBank = activeId ? conciliaciones[activeId] : null
  useEffect(() => {
    if (activeConcWithBank?.stage === "tango-done" && activeConcWithBank.bank && !partidas[activeConcWithBank.bank.bankId]) {
      loadPartidas(activeConcWithBank.bank.bankId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConcWithBank?.stage, activeConcWithBank?.bank?.bankId])

  return (
    <Ctx.Provider value={{
      conciliaciones, activeId, saldos, partidas, sessionError,
      setActiveId, patchConc, selectConciliacion, nuevaConciliacion,
      renameConciliacion, deleteConciliacion, uploadBanco, uploadTango,
      comparar, savePartidas, back,
    }}>
      {children}
    </Ctx.Provider>
  )
}
