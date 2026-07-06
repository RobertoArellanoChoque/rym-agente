import type { Metadata } from "next"
import { Instrument_Sans, Geist_Mono } from "next/font/google"
import "./globals.css"
import { IconRail } from "@/components/layout/IconRail"
import { TasksPanel } from "@/components/layout/TasksPanel"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ConciliacionProvider } from "@/lib/context/conciliacion-context"
import { ChatProvider } from "@/lib/context/chat-context"
import { VentasProvider } from "@/lib/context/ventas-context"
import { ContabilidadProvider } from "@/lib/context/contabilidad-context"

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "RyM Agente",
  description: "Agente de automatización para Recuperos y Mandatos",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="es"
      className={`${instrumentSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link
          href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@800,700,500,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="h-screen overflow-hidden flex bg-background">
        <ConciliacionProvider>
          <VentasProvider>
            <ContabilidadProvider>
              <ChatProvider>
                <TooltipProvider>
                  <IconRail />
                  <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
                    {children}
                  </main>
                  <TasksPanel />
                </TooltipProvider>
              </ChatProvider>
            </ContabilidadProvider>
          </VentasProvider>
        </ConciliacionProvider>
      </body>
    </html>
  )
}
