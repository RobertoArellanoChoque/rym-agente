"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

// Client island: dispara POST /api/drive/sync (mismo pipeline que corre el webhook) y refresca la página server.
export function SyncButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleSync() {
    setLoading(true)
    try {
      const res = await fetch("/api/drive/sync", { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Error sincronizando")
      toast.success(`Sync completo — ${data.procesados} procesados, ${data.errores} errores`)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error sincronizando Drive")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button onClick={handleSync} disabled={loading}>
      <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
      {loading ? "Sincronizando…" : "Sincronizar ahora"}
    </Button>
  )
}
