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
