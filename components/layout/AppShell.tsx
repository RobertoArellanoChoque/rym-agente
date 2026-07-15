"use client"

import { usePathname } from "next/navigation"
import { IconRail } from "@/components/layout/IconRail"
import { TasksPanel } from "@/components/layout/TasksPanel"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ConciliacionProvider } from "@/lib/context/conciliacion-context"
import { ChatProvider } from "@/lib/context/chat-context"
import { VentasProvider } from "@/lib/context/ventas-context"
import { ContabilidadProvider } from "@/lib/context/contabilidad-context"
import { AgentActivityProvider } from "@/lib/context/agent-activity-context"

// Decide el chrome según la ruta. En /sign-in y /seleccionar-org la app se
// renderiza a pantalla completa, SIN sidebar/panel ni los providers de dominio
// (que si no dispararían fetches 401/sin-org antes de tener sesión + org activa).
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (pathname?.startsWith("/sign-in") || pathname?.startsWith("/seleccionar-org")) {
    return <>{children}</>
  }

  return (
    <AgentActivityProvider>
      <ConciliacionProvider>
        <VentasProvider>
          <ContabilidadProvider>
            <ChatProvider>
              <TooltipProvider>
                <div className="h-screen overflow-hidden flex bg-background">
                  <IconRail />
                  <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
                    {children}
                  </main>
                  <TasksPanel />
                </div>
              </TooltipProvider>
            </ChatProvider>
          </ContabilidadProvider>
        </VentasProvider>
      </ConciliacionProvider>
    </AgentActivityProvider>
  )
}
