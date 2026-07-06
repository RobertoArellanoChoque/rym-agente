"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function LoginPage() {
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })
    if (res.ok) {
      window.location.href = "/"
      return
    }
    const data = await res.json().catch(() => ({}))
    setError(data.error ?? "Error al iniciar sesión")
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <form onSubmit={submit} className="w-full max-w-xs space-y-4 rounded-xl border border-border p-6">
        <div>
          <h1 className="text-lg font-semibold">RyM Agente</h1>
          <p className="text-sm text-muted-foreground">Ingresá la contraseña para continuar</p>
        </div>
        <Input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading || !password}>
          {loading ? "Ingresando..." : "Ingresar"}
        </Button>
      </form>
    </div>
  )
}
