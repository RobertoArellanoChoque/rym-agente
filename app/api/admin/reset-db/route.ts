import { db } from "@/lib/db"
import { RESET_TABLES } from "@/lib/db/reset-tables"
import { NextResponse } from "next/server"
import { ipOf } from "@/lib/rate-limit"
import { isAdmin } from "@/lib/auth/current-user"

export async function POST(req: Request) {
  // Auth ya la exige proxy.ts. Acá además: rol admin (multi-usuario) + confirmación explícita.
  if (!(await isAdmin()))
    return NextResponse.json({ error: "Requiere rol admin" }, { status: 403 })
  const { confirm } = await req.json().catch(() => ({}))
  if (confirm !== "RESET")
    return NextResponse.json({ error: "Falta confirmación (confirm: \"RESET\")" }, { status: 400 })
  console.warn(`[audit] reset-db ejecutado — ip=${ipOf(req)} ts=${new Date().toISOString()}`)

  try {
    // Vacía todo menos tarjetas (RESET_TABLES ya está en orden hijo→padre).
    for (const t of RESET_TABLES) await db.delete(t)
    return NextResponse.json({ success: true, message: "BD limpiada. Tarjetas preservadas." })
  } catch (e) {
    console.error("Reset error:", e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
