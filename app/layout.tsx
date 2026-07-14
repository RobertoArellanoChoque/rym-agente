import { ClerkProvider } from "@clerk/nextjs"
import { esES } from "@clerk/localizations"
import { shadcn } from "@clerk/themes"
import type { Metadata } from "next"
import { Instrument_Sans, Geist_Mono } from "next/font/google"
import "./globals.css"
import { AppShell } from "@/components/layout/AppShell"
import { Toaster } from "@/components/ui/toaster"

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
        {/* Sync, antes del paint: evita el flash de tema equivocado (FOUC). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark')}catch(e){}})()`,
          }}
        />
      </head>
      <body className="h-full bg-background">
        <ClerkProvider appearance={{ theme: shadcn }} localization={esES}>
          <AppShell>{children}</AppShell>
          <Toaster />
        </ClerkProvider>
      </body>
    </html>
  )
}