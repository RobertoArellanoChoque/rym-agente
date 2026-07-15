import { User, Mail, Calendar, UserRound, Clock, ShieldCheck, Shield, Building2 } from "lucide-react"
import { auth, clerkClient, currentUser } from "@clerk/nextjs/server"
import { Badge } from "@/components/ui/badge"
import { SignOutButton } from "./sign-out-button"

const ROL_LABELS: Record<string, string> = { admin: "Administrador", member: "Miembro" }

// orgRole viene como "org:admin" / "org:member" (o una key de rol custom).
function formatRol(orgRole: string | null | undefined) {
  if (!orgRole) return null
  const key = orgRole.replace(/^org:/, "")
  return ROL_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1)
}

// Lee la sesión de Clerk en cada request — no prerenderizar en build
export const dynamic = "force-dynamic"

function Dato({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium break-words">{value}</p>
      </div>
    </div>
  )
}

export default async function PerfilPage() {
  const user = await currentUser()

  // El gate de proxy.ts garantiza sesión; guarda por si acaso.
  if (!user) return null

  const nombre = user.fullName ?? user.username ?? "Usuario"
  const email = user.primaryEmailAddress?.emailAddress ?? "—"
  const alta = user.createdAt ? new Date(user.createdAt).toLocaleDateString("es-AR") : "—"
  const esAdmin = user.publicMetadata?.role === "admin"
  const nombreApellido = [user.firstName, user.lastName].filter(Boolean).join(" ")
  const ultimoIngreso = user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString("es-AR") : null

  const { orgId, orgRole } = await auth()
  const rolOrg = formatRol(orgRole)
  let nombreOrg: string | null = null
  if (orgId) {
    try {
      const client = await clerkClient()
      const org = await client.organizations.getOrganization({ organizationId: orgId })
      nombreOrg = org.name
    } catch {
      // best-effort: si falla, se omite la fila en vez de romper la página
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="px-6 py-5 border-b bg-card">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0" style={{ background: "color-mix(in oklch, var(--primary) 10%, transparent)" }}>
            <User className="h-4 w-4" style={{ color: "var(--primary)" }} />
          </div>
          <div>
            <h1 className="text-lg font-bold">Mi cuenta</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Información de tu usuario</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="rounded-xl border bg-card overflow-hidden">
            {/* Identidad */}
            <div className="flex items-center gap-4 p-5 border-b">
              {/* eslint-disable-next-line @next/next/no-img-element -- avatar de Clerk, host externo */}
              <img
                src={user.imageUrl}
                alt={nombre}
                className="h-16 w-16 rounded-full object-cover border"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-base font-bold truncate">{nombre}</p>
                  {esAdmin ? (
                    <Badge variant="default"><ShieldCheck />Administrador</Badge>
                  ) : (
                    <Badge variant="secondary"><Shield />Usuario</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground truncate">{email}</p>
              </div>
            </div>

            {/* Detalles */}
            <div className="px-5 py-2 divide-y">
              <Dato icon={Mail} label="Email" value={email} />
              {nombreApellido && <Dato icon={UserRound} label="Nombre y apellido" value={nombreApellido} />}
              <Dato icon={Calendar} label="Alta" value={alta} />
              {ultimoIngreso && <Dato icon={Clock} label="Último ingreso" value={ultimoIngreso} />}
              {nombreOrg && <Dato icon={Building2} label="Organización" value={nombreOrg} />}
              {rolOrg && <Dato icon={Shield} label="Rol en la organización" value={rolOrg} />}
            </div>
          </div>

          {/* Acciones */}
          <div className="flex justify-end">
            <SignOutButton />
          </div>
        </div>
      </div>
    </div>
  )
}
