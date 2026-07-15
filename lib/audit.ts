import { db } from "@/lib/db"
import { auditLog } from "@/lib/db/schema"
import { currentUserId, currentOrgId } from "@/lib/auth/current-user"

// Registro de auditoría append-only. Awaitable pero nunca throwea (catch interno) — el
// caller puede `await audit(...)` para garantizar la fila, o `void audit(...)`
// fire-and-forget; en ningún caso rompe la mutación. Resuelve actor/org con las variantes
// null-safe (NO requireOrgId) para que un write fuera de contexto de request no explote.
export async function audit(
  accion: string,
  entidad: string,
  entidadId?: string | null,
  detalle?: Record<string, unknown>,
): Promise<void> {
  try {
    const [userId, orgId] = await Promise.all([currentUserId(), currentOrgId()])
    await db.insert(auditLog).values({
      ts: new Date().toISOString(),
      orgId, userId, accion, entidad,
      entidadId: entidadId ?? null,
      detalle: detalle ?? {},
    })
  } catch (e) {
    console.warn("[audit] failed:", e)
  }
}
