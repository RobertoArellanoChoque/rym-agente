import { auth, currentUser } from "@clerk/nextjs/server"

// Clerk userId del request actual, o null si el write corre fuera de un request HTTP.
// auth() lee el contexto de request (headers/AsyncLocalStorage), así que funciona
// llamado desde dentro de las funciones lib/ sin pasar el userId por parámetro.
// ponytail: último editor, no historial — migrar a tabla audit_log si hace falta trazabilidad completa.
export async function currentUserId(): Promise<string | null> {
  try {
    return (await auth()).userId
  } catch {
    return null
  }
}

// ¿El usuario del request es admin? Vía Clerk publicMetadata.role === "admin"
// (se setea en el dashboard de Clerk por usuario). Gatea operaciones destructivas.
export async function isAdmin(): Promise<boolean> {
  try {
    return (await currentUser())?.publicMetadata?.role === "admin"
  } catch {
    return false
  }
}

// Clerk organization id activa del request actual, o null si no hay org activa
// o no hay contexto de request (mismo defensivo try/catch que currentUserId()).
export async function currentOrgId(): Promise<string | null> {
  try {
    return (await auth()).orgId ?? null
  } catch {
    return null
  }
}

// Igual que currentOrgId() pero tira si no hay organización activa — para callers
// (API routes) que deben cortar con 403 cuando no hay contexto multi-tenant.
export async function requireOrgId(): Promise<string> {
  const orgId = await currentOrgId()
  if (!orgId) throw new Error("NO_ACTIVE_ORG")
  return orgId
}

// ¿El usuario del request es admin de la organización activa? Vía el rol built-in
// de Clerk Organizations (org:admin). Distinto de isAdmin() (superadmin global).
export async function isOrgAdmin(): Promise<boolean> {
  try {
    return (await auth()).orgRole === "org:admin"
  } catch {
    return false
  }
}
