"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  Loader2, CreditCard, ArrowLeftRight,
  Plus, Trash2, ShoppingCart, BookOpen, Pencil, X, Inbox, AlertTriangle,
} from "lucide-react"
import type { Alerta } from "@/lib/alertas"
import { Menu } from "@base-ui/react/menu"
import { Dialog } from "@base-ui/react/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { nombreMes } from "@/lib/conciliacion/periodo"
import { useConciliacion } from "@/lib/context/conciliacion-context"
import { useVentas } from "@/lib/context/ventas-context"
import { useContabilidad } from "@/lib/context/contabilidad-context"
import { useAgentActivity } from "@/lib/context/agent-activity-context"
import { TarjetaFlow } from "@/components/modules/TarjetaFlow"

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
  alertas: Alerta[]
}

const DISMISSED_KEY = "rym-alertas-dismissed"

type Kind = "conc" | "tarjeta" | "ventas" | "contab"
type Activity = {
  id: string; kind: Kind; label: string; sublabel?: string
  icon: React.ComponentType<{ className?: string }>; borderColor: string
  badge: string; ts: string; href: string
  monto?: number; isActive: boolean
  diferencia?: number | null; canApprove?: boolean
}

// ── Config ───────────────────────────────────────────────────────────────────

const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
  "new":        { label: "Nuevo",               color: "border-l-slate-400" },
  "banco-done": { label: "Banco cargado",       color: "border-l-blue-400" },
  "tango-done": { label: "Listo para comparar", color: "border-l-amber-400" },
  "done":       { label: "Completado",          color: "border-l-emerald-400" },
  "aprobada":   { label: "Aprobada",            color: "border-l-emerald-600" },
}
const SESION_CONFIG: Record<string, { label: string; color: string }> = {
  "activo":     { label: "En progreso", color: "border-l-blue-400" },
  "completado": { label: "Completado",  color: "border-l-emerald-400" },
  "error":      { label: "Error",       color: "border-l-destructive" },
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

// ── Main component ────────────────────────────────────────────────────────────

export function TasksPanel() {
  const router = useRouter()
  const { activeId: activeConcId, nuevaConciliacion, deleteConciliacion, renameConciliacion } = useConciliacion()
  const { activeId: activeVentasId, nuevaSesion: nuevaVenta, deleteSesion: deleteVenta, renameSesion: renameVenta } = useVentas()
  const { activeId: activeContabId, nuevaSesion: nuevaContab, deleteSesion: deleteContab, renameSesion: renameContab } = useContabilidad()
  const { setHasActiveTasks } = useAgentActivity()

  const [data, setData] = useState<TasksData | null>(null)
  const [approving, setApproving] = useState<string | null>(null)
  const [creating, setCreating] = useState<"conc" | "ventas" | "contab" | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [tarjetaOpen, setTarjetaOpen] = useState(false)
  // Dismissal de alertas por localStorage. Init vacío + carga en useEffect para no
  // romper la hidratación (localStorage no existe en el render de servidor).
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISMISSED_KEY)
      if (raw) setDismissed(new Set(JSON.parse(raw) as string[]))
    } catch { /* localStorage inaccesible — mostrar todo */ }
  }, [])
  function dismissAlerta(id: string) {
    setDismissed(prev => {
      const next = new Set(prev).add(id)
      try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next])) } catch { /* ignore */ }
      return next
    })
  }
  const alertas = (data?.alertas ?? []).filter(a => !dismissed.has(a.id))

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks")
      if (res.ok) {
        const d = await res.json() as TasksData
        setData(d)
        const hasActive = (d.conciliaciones?.some(c => c.stage !== "done") ?? false) ||
          (d.ventasSesiones?.some(s => s.estado !== "completado") ?? false) ||
          (d.contabilidadSesiones?.some(s => s.estado !== "completado") ?? false)
        setHasActiveTasks(hasActive)
      }
    } catch { /* silent */ }
  }, [setHasActiveTasks])

  useEffect(() => {
    fetchTasks()
    // Pausar el poll con la pestaña en background — evita carga de DB sin motivo
    // en sesiones dejadas abiertas.
    let id: ReturnType<typeof setInterval> | null = null
    const start = () => { if (!id) id = setInterval(fetchTasks, 10000) }
    const stop = () => { if (id) { clearInterval(id); id = null } }
    const onVisibility = () => {
      if (document.visibilityState === "visible") { fetchTasks(); start() }
      else stop()
    }
    if (document.visibilityState === "visible") start()
    const onRefresh = () => fetchTasks()
    window.addEventListener("tasks-refresh", onRefresh)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      stop()
      window.removeEventListener("tasks-refresh", onRefresh)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [fetchTasks])

  async function handleApprove(sessionId: string) {
    setApproving(sessionId)
    try {
      const res = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, aceptarDiferencia: false }) })
      const data = await res.json().catch(() => ({}))
      await fetchTasks()
      if (!res.ok) return
      toast.success("✅ Conciliación hecha")
      router.push(`/conciliacion/asientos?id=${sessionId}`)
      // Cadena mes-a-mes: ofrecer continuar con el mes siguiente del mismo banco.
      if (data.siguientePeriodo && data.bankName) {
        const sig = nombreMes(data.siguientePeriodo)
        if (window.confirm(`${data.bankName} — ${nombreMes(data.periodo)} lista.\n¿Continuar con ${sig}?`)) {
          const r = await fetch("/api/conciliacion/continuar", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fromSessionId: sessionId }),
          })
          const nd = await r.json().catch(() => ({}))
          if (r.ok && nd.sessionId) {
            await fetchTasks()
            toast.info(nd.yaExistia ? `Ya existía ${sig}, abriéndola` : `Creada ${sig}`)
            router.push(`/conciliacion?id=${nd.sessionId}`)
          } else {
            toast.error(nd.error ?? "No se pudo crear el mes siguiente")
          }
        }
      }
    } finally { setApproving(null) }
  }

  async function handleNuevaConc() {
    setCreating("conc")
    try {
      const id = await nuevaConciliacion()
      router.push(id ? `/conciliacion?id=${id}` : "/conciliacion")
      await fetchTasks()
    } finally { setCreating(null) }
  }

  async function handleNuevaVenta() {
    setCreating("ventas")
    try {
      const id = await nuevaVenta()
      router.push(id ? `/ventas?id=${id}` : "/ventas")
      await fetchTasks()
    } finally { setCreating(null) }
  }

  async function handleNuevaContab() {
    setCreating("contab")
    try {
      const id = await nuevaContab()
      router.push(id ? `/contabilidad?id=${id}` : "/contabilidad")
      await fetchTasks()
    } finally { setCreating(null) }
  }

  // ponytail: botón provisional de reset. Casi invisible al pie del panel.
  // Llama al endpoint auth-gated existente (borra todo menos tarjetas).
  const [resetting, setResetting] = useState(false)
  async function handleResetDb() {
    if (!window.confirm("¿Borrar TODAS las conciliaciones, ventas, contabilidad y retenciones? (tarjetas se conservan). Irreversible.")) return
    setResetting(true)
    try {
      const res = await fetch("/api/admin/reset-db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "RESET" }),
      })
      if (res.ok) { await fetchTasks(); router.push("/") }
    } finally { setResetting(false) }
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

  // ── Normalización: 3 formas de tarea → una lista uniforme ordenada por recencia ──

  const activities: Activity[] = data ? [
    ...data.conciliaciones.map((c): Activity => {
      const cfg = STAGE_CONFIG[c.stage] ?? STAGE_CONFIG["new"]
      return {
        id: c.id, kind: "conc", label: c.bancoNombre ?? c.label, sublabel: c.label,
        icon: ArrowLeftRight, borderColor: cfg.color, badge: cfg.label,
        ts: c.updatedAt, href: `/conciliacion?id=${c.id}`, isActive: c.id === activeConcId,
        diferencia: c.diferencia,
        canApprove: c.stage === "done" && (c.diferencia === 0 || c.diferencia === null),
      }
    }),
    // ponytail: tarjetas sin estado in-progress todavía — filtrar cuando se defina el flujo completo
    ...data.tarjetas.map((t): Activity => ({
      id: t.id, kind: "tarjeta", label: t.nombreTarjeta, sublabel: t.periodo || undefined,
      icon: CreditCard, borderColor: "border-l-violet-400", badge: "",
      ts: t.creadoEn, href: "/proveedores", monto: t.totalMonto, isActive: false,
    })),
    // Solo en progreso: ocultar sesiones completadas (deja activo/error)
    ...data.ventasSesiones.filter(s => s.estado !== "completado").map((s): Activity => {
      const cfg = SESION_CONFIG[s.estado] ?? SESION_CONFIG["activo"]
      return {
        id: s.id, kind: "ventas", label: s.label, icon: ShoppingCart, borderColor: cfg.color,
        badge: cfg.label, ts: s.updatedAt, href: `/ventas?id=${s.id}`, isActive: s.id === activeVentasId,
      }
    }),
    ...data.contabilidadSesiones.filter(s => s.estado !== "completado").map((s): Activity => {
      const cfg = SESION_CONFIG[s.estado] ?? SESION_CONFIG["activo"]
      return {
        id: s.id, kind: "contab", label: s.label, icon: BookOpen, borderColor: cfg.color,
        badge: cfg.label, ts: s.updatedAt, href: `/contabilidad?id=${s.id}`, isActive: s.id === activeContabId,
      }
    }),
  ].sort((a, b) => b.ts.localeCompare(a.ts)) : []

  function deleteActivity(a: Activity) {
    if (a.kind === "conc") return deleteConciliacion(a.id).then(fetchTasks)
    if (a.kind === "ventas") { deleteVenta(a.id); return fetchTasks() }
    if (a.kind === "contab") { deleteContab(a.id); return fetchTasks() }
    return handleDeleteTarjeta(a.id)
  }

  function renameActivity(a: Activity, val: string) {
    if (a.kind === "conc") { renameConciliacion(a.id, val); setEditingId(null); fetchTasks(); return }
    if (a.kind === "ventas") { renameVenta(a.id, val); setEditingId(null); fetchTasks(); return }
    if (a.kind === "contab") { renameContab(a.id, val); setEditingId(null); fetchTasks(); return }
    handleRenameTarjeta(a.id, val)
  }

  const total = activities.length

  const nuevaItems = [
    { label: "Conciliación", icon: ArrowLeftRight, onClick: handleNuevaConc },
    { label: "Venta", icon: ShoppingCart, onClick: handleNuevaVenta },
    { label: "Contabilidad", icon: BookOpen, onClick: handleNuevaContab },
    { label: "Tarjeta", icon: CreditCard, onClick: () => setTarjetaOpen(true) },
  ]

  return (
    <aside className="w-80 shrink-0 h-screen flex flex-col border-l" style={{ borderColor: "var(--border)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tareas activas</span>
        <div className="flex items-center gap-2">
          {total > 0 && (
            <span className="text-xs font-medium text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">{total}</span>
          )}
          <Menu.Root>
            <Menu.Trigger
              disabled={creating !== null}
              className="h-6 w-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
              title="Nueva tarea"
            >
              {creating !== null ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner sideOffset={6} align="end">
                <Menu.Popup
                  className="min-w-44 rounded-lg border bg-card p-1 shadow-lg outline-none"
                  style={{ borderColor: "var(--border)" }}
                >
                  {nuevaItems.map(it => {
                    const Icon = it.icon
                    return (
                      <Menu.Item
                        key={it.label}
                        onClick={it.onClick}
                        className="flex items-center gap-2 px-2.5 py-1.5 text-sm rounded-md cursor-pointer outline-none data-[highlighted]:bg-muted transition-colors"
                      >
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        {it.label}
                      </Menu.Item>
                    )
                  })}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </div>
      </div>

      {/* Lista unificada */}
      <div className="flex-1 overflow-y-auto">
        {alertas.length > 0 && (
          <div className="border-b" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-1.5 px-4 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Alertas</span>
              <span className="text-xs font-medium text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">{alertas.length}</span>
            </div>
            {alertas.map(a => {
              const isError = a.severidad === "error"
              return (
                <div
                  key={a.id}
                  className={cn(
                    "flex items-start gap-2 px-4 py-2.5 border-b border-l-2",
                    isError ? "border-l-destructive" : "border-l-amber-400",
                  )}
                  style={{ borderBottomColor: "var(--border)" }}
                >
                  <AlertTriangle className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", isError ? "text-destructive" : "text-amber-500")} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{a.titulo}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{a.detalle}</p>
                    {a.monto != null && (
                      <span className={cn("text-[10px] font-medium", isError ? "text-destructive" : "text-foreground")}>{fmtMonto(a.monto)}</span>
                    )}
                  </div>
                  <button
                    className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => dismissAlerta(a.id)}
                    aria-label={`Descartar alerta: ${a.titulo}`}
                    title="Descartar"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {!data && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {data && total === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
              <Inbox className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">No se está realizando ninguna actividad</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Creá una con <Plus className="h-3 w-3 inline -mt-0.5" />
              </p>
            </div>
          </div>
        )}

        {activities.map(a => {
          const Icon = a.icon
          const isEditing = editingId === a.id
          return (
            <div
              key={a.id}
              className={cn(
                "px-4 py-3 border-b hover:bg-muted/40 cursor-pointer border-l-2 transition-colors group",
                a.borderColor, a.isActive && "bg-muted/60",
              )}
              style={{ borderBottomColor: "var(--border)" }}
              onClick={() => !isEditing && router.push(a.href)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <RenameInput
                        initialValue={a.label}
                        onSave={v => renameActivity(a, v)}
                        onCancel={() => setEditingId(null)}
                      />
                    ) : (
                      <p
                        className="text-xs font-semibold truncate"
                        onDoubleClick={e => { e.stopPropagation(); setEditingId(a.id) }}
                        title="Doble-click para renombrar"
                      >
                        {a.label}
                      </p>
                    )}
                    {!isEditing && a.sublabel && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{a.sublabel}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">{relDate(a.ts)}</span>
                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                      onClick={e => { e.stopPropagation(); deleteActivity(a) }}
                      title="Eliminar"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                      onClick={e => { e.stopPropagation(); setEditingId(a.id) }}
                      title="Renombrar"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  </div>
                  {a.monto != null && (
                    <span className="text-[10px] font-medium text-foreground">{fmtMonto(a.monto)}</span>
                  )}
                </div>
              </div>
              {(a.badge || a.diferencia != null) && (
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10px] text-muted-foreground">{a.badge}</span>
                  {a.diferencia != null && (
                    <span className={cn("text-[10px] font-medium", a.diferencia === 0 ? "text-emerald-600" : "text-orange-600")}>
                      {a.diferencia === 0 ? "Sin diferencia" : fmtMonto(a.diferencia)}
                    </span>
                  )}
                </div>
              )}
              {a.canApprove && (
                <Button size="sm" className="mt-2 h-6 text-[10px] w-full"
                  onClick={e => { e.stopPropagation(); handleApprove(a.id) }} disabled={approving === a.id}
                >
                  {approving === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Aprobar"}
                </Button>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer: reset provisional, casi invisible */}
      <button
        onClick={handleResetDb}
        disabled={resetting}
        title="Reset DB (borra todo menos tarjetas)"
        className="shrink-0 text-[9px] text-muted-foreground/20 hover:text-destructive transition-colors py-1.5 text-center"
      >
        {resetting ? "…" : "reset"}
      </button>

      {/* Modal nueva tarjeta */}
      <Dialog.Root open={tarjetaOpen} onOpenChange={setTarjetaOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 bg-black/40 z-50" />
          <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,42rem)] max-h-[85vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border bg-card p-6 shadow-xl outline-none" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Nueva tarjeta</Dialog.Title>
              <Dialog.Close className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
            <TarjetaFlow onImported={() => { setTarjetaOpen(false); fetchTasks() }} />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </aside>
  )
}
