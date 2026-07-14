"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowLeftRight, ShoppingCart, Truck, BookOpen, LayoutDashboard, Bot, ChevronRight, User } from "lucide-react"
import { UserButton } from "@clerk/nextjs"
import { useAgentActivity } from "@/lib/context/agent-activity-context"
import { ThemeToggle } from "@/components/ui/theme-toggle"

const modules = [
  { href: "/",             label: "Agente",       icon: Bot },
  { href: "/dashboard",    label: "Dashboard",    icon: LayoutDashboard },
  { href: "/conciliacion", label: "Conciliación", icon: ArrowLeftRight },
  { href: "/ventas",       label: "Ventas",       icon: ShoppingCart },
  { href: "/proveedores",  label: "Proveedores",  icon: Truck },
  { href: "/contabilidad", label: "Contabilidad", icon: BookOpen },
  { href: "/perfil",       label: "Perfil",       icon: User },
]

export function IconRail() {
  const pathname = usePathname()
  const [expanded, setExpanded] = useState(false)
  const { isActive } = useAgentActivity()

  return (
    <aside
      className="flex flex-col h-screen shrink-0 overflow-hidden transition-[width] duration-200"
      style={{
        width: expanded ? 192 : 56,
        background: "var(--sidebar)",
        borderRight: "1px solid var(--sidebar-border)",
      }}
    >
      {/* Brand stripe */}
      <div className="h-0.5 w-full shrink-0" style={{ background: "linear-gradient(90deg, var(--primary) 0%, rgb(from var(--primary) r g b / 0.3) 70%, transparent 100%)" }} />

      {/* Logo mark */}
      <div className="flex items-center h-12 shrink-0 px-3.5 gap-2.5 overflow-hidden">
        <svg viewBox="0 0 24 22" fill="none" className="w-5 h-5 shrink-0" aria-label="RyM" style={{ color: "var(--primary)" }}>
          <path d="M2 11 L7.5 18 L19 2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="5" y1="21" x2="13" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        {expanded && <span className="text-sm font-bold tracking-tight whitespace-nowrap">RyM Agente</span>}
      </div>

      <div className="h-px mx-3 shrink-0" style={{ background: "var(--sidebar-border)" }} />

      {/* Nav */}
      <nav className="flex-1 flex flex-col gap-1 py-3 px-2 overflow-hidden">
        {modules.map(mod => {
          const Icon = mod.icon
          const isActive = mod.href === "/" ? pathname === "/" : pathname.startsWith(mod.href)

          return (
            <Link
              key={mod.href}
              href={mod.href}
              title={expanded ? undefined : mod.label}
              className="flex items-center gap-3 h-9 rounded-lg px-2.5 transition-all duration-150 whitespace-nowrap overflow-hidden"
              style={{ background: isActive ? "var(--primary)" : "transparent" }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "var(--sidebar-accent)" }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent" }}
            >
              <Icon className="h-4 w-4 shrink-0" style={{ color: isActive ? "var(--primary-foreground)" : "oklch(0.60 0.01 264)" }} />
              {expanded && <span className="text-sm" style={{ color: isActive ? "var(--primary-foreground)" : "oklch(0.60 0.01 264)" }}>{mod.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="flex items-center h-11 shrink-0 px-3.5 gap-2.5 overflow-hidden">
        <UserButton />
        {expanded && <span className="text-[11px] text-muted-foreground whitespace-nowrap">Mi cuenta</span>}
      </div>

      {/* Tema */}
      <div className="flex items-center h-9 shrink-0 px-3 gap-2.5 overflow-hidden">
        <ThemeToggle />
        {expanded && <span className="text-[11px] text-muted-foreground whitespace-nowrap">Tema</span>}
      </div>

      {/* Footer */}
      <div className="flex items-center pb-4 px-3.5 gap-3 shrink-0">
        <span className="relative flex h-2 w-2 shrink-0" title={isActive ? "Agente IA activo" : "Agente IA inactivo"}>
          {isActive && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />}
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
        </span>
        {expanded && <span className="text-[11px] text-muted-foreground whitespace-nowrap">{isActive ? "IA activa" : "IA inactiva"}</span>}
        <button
          onClick={() => setExpanded(v => !v)}
          className="ml-auto flex items-center justify-center w-5 h-5 rounded transition-colors hover:bg-sidebar-accent"
          title={expanded ? "Colapsar menú" : "Expandir menú"}
        >
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200" style={{ transform: expanded ? "rotate(180deg)" : "none" }} />
        </button>
      </div>
    </aside>
  )
}
