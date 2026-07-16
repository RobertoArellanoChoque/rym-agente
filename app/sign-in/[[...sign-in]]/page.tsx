"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useSignIn } from "@clerk/nextjs"
import { RymLogo } from "@/components/layout/RymLogo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type ErrLike = { longMessage?: string; message?: string } | null
function errMsg(e: ErrLike, fallback: string) {
  return e?.longMessage ?? e?.message ?? fallback
}

export default function SignInPage() {
  const { signIn } = useSignIn()
  const router = useRouter()

  const [mode, setMode] = useState<"signin" | "forgot">("signin")
  const [forgotStep, setForgotStep] = useState<"email" | "code">("email")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error } = await signIn.password({ identifier: email, password })
      if (error) { setError(errMsg(error, "Email o contraseña incorrectos")); return }
      await signIn.finalize()
      router.push("/")
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotRequest(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error: e1 } = await signIn.create({ identifier: email })
      if (e1) { setError(errMsg(e1, "No encontramos esa cuenta.")); return }
      const { error: e2 } = await signIn.resetPasswordEmailCode.sendCode()
      if (e2) { setError(errMsg(e2, "No se pudo enviar el código.")); return }
      setForgotStep("code")
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotReset(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error: e1 } = await signIn.resetPasswordEmailCode.verifyCode({ code })
      if (e1) { setError(errMsg(e1, "Código inválido o expirado.")); return }
      const { error: e2 } = await signIn.resetPasswordEmailCode.submitPassword({ password: newPassword })
      if (e2) { setError(errMsg(e2, "No se pudo cambiar la contraseña.")); return }
      await signIn.finalize()
      router.push("/")
    } finally {
      setLoading(false)
    }
  }

  function goForgot() {
    setMode("forgot"); setForgotStep("email"); setError(null); setPassword("")
  }
  function goSignin() {
    setMode("signin"); setError(null); setCode(""); setNewPassword("")
  }

  return (
    <section className="grid min-h-screen lg:grid-cols-2">
      {/* Panel marca (solo desktop) */}
      <div className="relative hidden flex-col justify-between overflow-hidden lg:flex" style={{ background: "var(--sidebar)" }}>
        <div className="h-1 w-full shrink-0" style={{ background: "linear-gradient(90deg, var(--primary) 0%, rgb(from var(--primary) r g b / 0.3) 70%, transparent 100%)" }} />
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_bottom_left,color-mix(in_oklch,var(--primary)_14%,transparent),transparent_55%)]" />
        <div className="relative flex flex-1 flex-col items-start justify-center gap-6 px-14">
          <RymLogo className="h-12 w-auto animate-in fade-in duration-700 fill-mode-backwards" textColor="var(--sidebar-accent-foreground)" />
          <p
            className="text-2xl font-bold tracking-tight animate-in fade-in slide-in-from-bottom-2 duration-700 delay-150 fill-mode-backwards"
            style={{ fontFamily: "var(--font-cabinet-grotesk)", color: "var(--sidebar-accent-foreground)" }}
          >
            Tu agente financiero
            <br />
            está listo.
          </p>
          <div className="flex items-center gap-2 animate-in fade-in duration-700 delay-300 fill-mode-backwards">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
            <span className="shimmer text-sm" style={{ color: "var(--sidebar-foreground)" }}>
              Conciliaciones, saldos y retenciones en tiempo real
            </span>
          </div>
        </div>
      </div>

      {/* Panel form */}
      <div className="flex items-center justify-center px-6 py-12 bg-background bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--primary)_5%,transparent),transparent_55%)]">
        <div className="flex w-full max-w-sm flex-col items-center gap-y-8">
          <div className="flex flex-col items-center gap-y-3">
            <RymLogo className="h-10 w-auto animate-in fade-in duration-500 fill-mode-backwards lg:hidden" />
            <h1
              className="text-3xl font-semibold tracking-tight animate-in fade-in slide-in-from-bottom-2 duration-500 delay-100 fill-mode-backwards"
              style={{ fontFamily: "var(--font-cabinet-grotesk)" }}
            >
              {mode === "signin" ? "Iniciá sesión" : "Recuperar acceso"}
            </h1>
          </div>

          {mode === "signin" && (
            <form onSubmit={handleSignIn} className="flex w-full flex-col gap-8">
              <div className="flex flex-col gap-4">
                <Input
                  type="email" placeholder="Email" required autoComplete="email"
                  className="h-10" value={email} onChange={e => setEmail(e.target.value)}
                />
                <Input
                  type="password" placeholder="Contraseña" required autoComplete="current-password"
                  className="h-10" value={password} onChange={e => setPassword(e.target.value)}
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="mt-2 h-10 w-full" disabled={loading}>
                  {loading ? "Entrando…" : "Entrar"}
                </Button>
              </div>
            </form>
          )}

          {mode === "forgot" && forgotStep === "email" && (
            <form onSubmit={handleForgotRequest} className="flex w-full flex-col gap-8">
              <div className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">
                  Ingresá tu email y te mandamos un código para restablecer la contraseña.
                </p>
                <Input
                  type="email" placeholder="Email" required autoComplete="email"
                  className="h-10" value={email} onChange={e => setEmail(e.target.value)}
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="mt-2 h-10 w-full" disabled={loading}>
                  {loading ? "Enviando…" : "Enviar código"}
                </Button>
              </div>
            </form>
          )}

          {mode === "forgot" && forgotStep === "code" && (
            <form onSubmit={handleForgotReset} className="flex w-full flex-col gap-8">
              <div className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">
                  Revisá tu email, ingresá el código y elegí una nueva contraseña.
                </p>
                <Input
                  type="text" placeholder="Código" required autoComplete="one-time-code"
                  className="h-10" value={code} onChange={e => setCode(e.target.value)}
                />
                <Input
                  type="password" placeholder="Nueva contraseña" required autoComplete="new-password"
                  className="h-10" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="mt-2 h-10 w-full" disabled={loading}>
                  {loading ? "Guardando…" : "Cambiar contraseña"}
                </Button>
              </div>
            </form>
          )}

          <div className="text-muted-foreground flex justify-center gap-1 text-sm">
            {mode === "signin" ? (
              <button type="button" onClick={goForgot} className="text-primary font-medium hover:underline">
                ¿Olvidaste tu contraseña?
              </button>
            ) : (
              <button type="button" onClick={goSignin} className="text-primary font-medium hover:underline">
                Volver a iniciar sesión
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
