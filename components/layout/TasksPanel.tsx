"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  CheckCircle2, Clock, AlertTriangle, Loader2, CreditCard, ArrowLeftRight,
  CheckCheck, Plus, Trash2, ShoppingCart, BookOpen, Pencil,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useConciliacion } from "@/lib/context/conciliacion-context"
import { useVentas } from "@/lib/context/ventas-context"
import { useContabilidad } from "@/lib/context/contabilidad-context"

// ── Types ────────────────────────────────────────────────────────────────────

type ConciliacionTask = {
  id: string; label: string; stage: string; bancoNombre: string | null
  diferencia: number | null; movimientosCount: number | null; updatedAt: string
}
type TarjetaTask = {
  id: string; nombreTarjeta: string; periodo: string; totalMonto: number; creadoEn: string
}
type SesionTask = { id: string; label: string; estado: string; updatedAt: string }
type TasksData = {
  conciliaciones: ConciliacionTask[]
  tarjetas: TarjetaTask[]
  ventasSesiones: SesionTask[]
  contabilidadSesiones: SesionTask[]
}

// ── Config ───────────────────────────────────────────────────────────────────

const STAGE_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  "new":        { label: "Nuevo",               color: "border-slate-400",   icon: Clock },
  "banco-done": { label: "Banco cargado",       color: "border-blue-400",    icon: Clock },
  "tango-done": { label: "Listo para comparar", color: "border-amber-400",   icon: AlertTriangle },
  "done":       { label: "Completado",           color: "border-emerald-400", icon: CheckCircle2 },
}
const SESION_CONFIG: Record<string, { label: string; color: string }> = {
  "activo":     { label: "En progreso", color: "border-blue-400" },
  "completado": { label: "Completado",  color: "border-emerald-400" },
  "error":      { label: "Error",       color: "border-destructive" },
}

function fmtMonto(centavos: number) {
  const sign = centavos < 0 ? "-" : ""
  return `${sign}$${(Math.abs(centavos) / 100).toLocaleString("es-AR", { minimumFractionDigits: 0 })}`
}
function relDate(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "ahora"
  if (mins < 60) return `${mins}m`
  const hs = Math.floor(mins / 60)
  if (hs < 24) return `${hs}h`
  return `${Math.floor(hs / 24)}d`
}

// ── Inline rename input ───────────────────────────────────────────────────────

function RenameInput({
  initialValue, onSave, onCancel,
}: { initialValue: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [val, setVal] = useState(initialValue)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])
  return (
    <input
      ref={ref}
      value={val}
      onChange={e => setVal(e.target.value)}
      onKeyDown={e => {
        if (e.key === "Enter") { e.preventDefault(); onSave(val.trim() || initialValue) }
        if (e.key === "Escape") { e.preventDefault(); onCancel() }
      }}
      onBlur={() => onSave(val.trim() || initialValue)}
      onClick={e => e.stopPropagation()}
      className="w-full text-xs font-semibold bg-background border border-primary/40 rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-primary/30"
    />
  )
}

// ── SectionHeader ─────────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon, label, onNew, creating,
}: { icon: React.ComponentType<{ className?: string }>; label: string; onNew: () => void; creating: boolean }) {
  return (
    <div className="flex items-center gap-1.5 px-4 py-2 border-b" style={{ borderColor: "var(--border)" }}>
      <Icon className="h-3 w-3 text-muted-foreground" />
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex-1">{label}</span>
      <button
        onClick={onNew}
        disabled={creating}
        className="h-4 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
        title={`Nueva sesión de ${label.toLowerCase()}`}
      >
        {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function TasksPanel() {
  const router = useRouter()
  const { activeId: activeConcId, nuevaConciliacion, deleteConciliacion, renameConciliacion } = useConciliacion()
  const { activeId: activeVentasId, nuevaSesion: nuevaVenta, deleteSesion: deleteVenta, renameSesion: renameVenta } = useVentas()
  const { activeId: activeContabId, nuevaSesion: nuevaContab, deleteSesion: deleteContab, renameSesion: renameContab } = useContabilidad()

  const [data, setData] = useState<TasksData | null>(null)
  const [approving, setApproving] = useState<string | null>(null)
  const [creating, setCreating] = useState<"conc" | "ventas" | "contab" | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks")
      if (res.ok) setData(await res.json())
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchTasks()
    const id = setInterval(fetchTasks, 10000)
    return () => clearInterval(id)
  }, [fetchTasks])

  async function handleApprove(sessionId: string) {
    setApproving(sessionId)
    try {
      await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, aceptarDiferencia: false }) })
      await fetchTasks()
    } finally { setApproving(null) }
  }

  async function handleNuevaConc() {
    setCreating("conc")
    try {
      const id = await nuevaConciliacion()
      if (id) router.push(`/conciliacion?id=${id}`)
      else router.push("/conciliacion")
      await fetchTasks()
    } finally { setCreating(null) }
  }

  async function handleNuevaVenta() {
    setCreating("ventas")
    try {
      const id = await nuevaVenta()
      if (id) router.push(`/ventas?id=${id}`)
      else router.push("/ventas")
      await fetchTasks()
    } finally { setCreating(null) }
  }

  async function handleNuevaContab() {
    setCreating("contab")
    try {
      const id = await nuevaContab()
      if (id) router.push(`/contabilidad?id=${id}`)
      else router.push("/contabilidad")
      await fetchTasks()
    } finally { setCreating(null) }
  }

  async function handleDeleteTarjeta(id: string) {
    await fetch(`/api/proveedores/tarjeta/${id}`, { method: "DELETE" })
    await fetchTasks()
  }

  async function handleRenameTarjeta(id: string, label: string) {
    await fetch(`/api/proveedores/tarjeta/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label }) })
    await fetchTasks()
    setEditingId(null)
  }

  const total = (data?.conciliaciones.length ?? 0) + (data?.tarjetas.length ?? 0) +
    (data?.ventasSesiones.length ?? 0) + (data?.contabilidadSesiones.length ?? 0)
  const isEmpty = total === 0

  return (
    <aside className="w-80 shrink-0 h-screen flex flex-col border-l" style={{ borderColor: "var(--border)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tareas activas</span>
        <div className="flex items-center gap-2">
          {total > 0 && (
            <span className="text-xs font-medium text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">{total}</span>
          )}
          <Button
            variant="ghost" size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={handleNuevaConc} disabled={creating !== null} title="Nueva conciliación"
          >
            {creating === "conc" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!data && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {data && isEmpty && (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <CheckCheck className="h-6 w-6 text-muted-foreground/40 mb-2" />
            <p className="text-xs text-muted-foreground">Sin tareas activas</p>
            <button onClick={handleNuevaConc} disabled={creating !== null} className="mt-3 text-xs text-primary hover:underline disabled:opacity-50">
              + Nueva conciliación
            </button>
          </div>
        )}

        {/* ── Conciliaciones ── */}
        {(data?.conciliaciones.length ?? 0) > 0 && (
          <div>
            <SectionHeader icon={ArrowLeftRight} label="Conciliaciones" onNew={handleNuevaConc} creating={creating === "conc"} />
            {data!.conciliaciones.map(conc => {
              const cfg = STAGE_CONFIG[conc.stage] ?? STAGE_CONFIG["new"]
              const Icon = cfg.icon
              const canApprove = conc.stage === "done" && (conc.diferencia === 0 || conc.diferencia === null)
              const isActive = conc.id === activeConcId
              const isEditing = editingId === conc.id

              return (
                <div
                  key={conc.id}
                  className={cn("px-4 py-3 border-b hover:bg-muted/40 cursor-pointer border-l-2 transition-colors group", cfg.color, isActive && "bg-muted/60")}
                  style={{ borderBottomColor: "var(--border)" }}
                  onClick={() => !isEditing && router.push(`/conciliacion?id=${conc.id}`)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <RenameInput
                          initialValue={conc.label}
                          onSave={v => { renameConciliacion(conc.id, v); setEditingId(null); fetchTasks() }}
                          onCancel={() => setEditingId(null)}
                        />
                      ) : (
                        <p
                          className="text-xs font-semibold truncate"
                          onDoubleClick={e => { e.stopPropagation(); setEditingId(conc.id) }}
                          title="Doble-click para renombrar"
                        >
                          {conc.bancoNombre ?? conc.label}
                        </p>
                      )}
                      {!isEditing && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{conc.label}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground">{relDate(conc.updatedAt)}</span>
                        <button
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                          onClick={async e => { e.stopPropagation(); await deleteConciliacion(conc.id); fetchTasks() }}
                          title="Eliminar"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                        <button
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                          onClick={e => { e.stopPropagation(); setEditingId(conc.id) }}
                          title="Renombrar"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </div>
                      <Icon className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[10px] text-muted-foreground">{cfg.label}</span>
                    {conc.diferencia != null && (
                      <span className={cn("text-[10px] font-medium", conc.diferencia === 0 ? "text-emerald-600" : "text-orange-600")}>
                        {conc.diferencia === 0 ? "Sin diferencia" : fmtMonto(conc.diferencia)}
                      </span>
                    )}
                  </div>
                  {canApprove && (
                    <Button size="sm" className="mt-2 h-6 text-[10px] w-full"
                      onClick={e => { e.stopPropagation(); handleApprove(conc.id) }} disabled={approving === conc.id}
                    >
                      {approving === conc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Aprobar"}
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── Tarjetas ── */}
        {(data?.tarjetas.length ?? 0) > 0 && (
          <div>
            <SectionHeader icon={CreditCard} label="Tarjetas" onNew={() => router.push("/proveedores")} creating={false} />
            {data!.tarjetas.map(t => {
              const isEditing = editingId === t.id
              return (
                <div
                  key={t.id}
                  className="px-4 py-3 border-b hover:bg-muted/40 cursor-pointer border-l-2 border-l-violet-400 transition-colors group"
                  style={{ borderBottomColor: "var(--border)" }}
                  onClick={() => !isEditing && router.push("/proveedores")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <RenameInput
                          initialValue={t.nombreTarjeta}
                          onSave={v => handleRenameTarjeta(t.id, v)}
                          onCancel={() => setEditingId(null)}
                        />
                      ) : (
                        <p
                          className="text-xs font-semibold truncate"
                          onDoubleClick={e => { e.stopPropagation(); setEditingId(t.id) }}
                          title="Doble-click para renombrar"
                        >
                          {t.nombreTarjeta}
                        </p>
                      )}
                      {!isEditing && t.periodo && <p className="text-[10px] text-muted-foreground mt-0.5">{t.periodo}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground">{relDate(t.creadoEn)}</span>
                        <button
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                          onClick={e => { e.stopPropagation(); handleDeleteTarjeta(t.id) }}
                          title="Eliminar"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                        <button
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                          onClick={e => { e.stopPropagation(); setEditingId(t.id) }}
                          title="Renombrar"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="text-[10px] font-medium text-foreground">{fmtMonto(t.totalMonto)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Ventas ── */}
        {(data?.ventasSesiones.length ?? 0) > 0 && (
          <div>
            <SectionHeader icon={ShoppingCart} label="Ventas" onNew={handleNuevaVenta} creating={creating === "ventas"} />
            {data!.ventasSesiones.map(s => {
              const cfg = SESION_CONFIG[s.estado] ?? SESION_CONFIG["activo"]
              const isActive = s.id === activeVentasId
              const isEditing = editingId === s.id
              return (
                <div
                  key={s.id}
                  className={cn("px-4 py-3 border-b hover:bg-muted/40 cursor-pointer border-l-2 transition-colors group", cfg.color, isActive && "bg-muted/60")}
                  style={{ borderBottomColor: "var(--border)" }}
                  onClick={() => !isEditing && router.push(`/ventas?id=${s.id}`)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <RenameInput
                          initialValue={s.label}
                          onSave={v => { renameVenta(s.id, v); setEditingId(null); fetchTasks() }}
                          onCancel={() => setEditingId(null)}
                        />
                      ) : (
                        <p
                          className="text-xs font-semibold truncate"
                          onDoubleClick={e => { e.stopPropagation(); setEditingId(s.id) }}
                          title="Doble-click para renombrar"
                        >
                          {s.label}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] text-muted-foreground">{relDate(s.updatedAt)}</span>
                      <button
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        onClick={e => { e.stopPropagation(); deleteVenta(s.id); fetchTasks() }}
                        title="Eliminar"
                      ><Trash2 className="h-3 w-3" /></button>
                      <button
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                        onClick={e => { e.stopPropagation(); setEditingId(s.id) }}
                        title="Renombrar"
                      ><Pencil className="h-3 w-3" /></button>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">{cfg.label}</p>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Contabilidad ── */}
        {(data?.contabilidadSesiones.length ?? 0) > 0 && (
          <div>
            <SectionHeader icon={BookOpen} label="Contabilidad" onNew={handleNuevaContab} creating={creating === "contab"} />
            {data!.contabilidadSesiones.map(s => {
              const cfg = SESION_CONFIG[s.estado] ?? SESION_CONFIG["activo"]
              const isActive = s.id === activeContabId
              const isEditing = editingId === s.id
              return (
                <div
                  key={s.id}
                  className={cn("px-4 py-3 border-b hover:bg-muted/40 cursor-pointer border-l-2 transition-colors group", cfg.color, isActive && "bg-muted/60")}
                  style={{ borderBottomColor: "var(--border)" }}
                  onClick={() => !isEditing && router.push(`/contabilidad?id=${s.id}`)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <RenameInput
                          initialValue={s.label}
                          onSave={v => { renameContab(s.id, v); setEditingId(null); fetchTasks() }}
                          onCancel={() => setEditingId(null)}
                        />
                      ) : (
                        <p
                          className="text-xs font-semibold truncate"
                          onDoubleClick={e => { e.stopPropagation(); setEditingId(s.id) }}
                          title="Doble-click para renombrar"
                        >
                          {s.label}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] text-muted-foreground">{relDate(s.updatedAt)}</span>
                      <button
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        onClick={e => { e.stopPropagation(); deleteContab(s.id); fetchTasks() }}
                        title="Eliminar"
                      ><Trash2 className="h-3 w-3" /></button>
                      <button
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                        onClick={e => { e.stopPropagation(); setEditingId(s.id) }}
                        title="Renombrar"
                      ><Pencil className="h-3 w-3" /></button>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">{cfg.label}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </aside>
  )
}
