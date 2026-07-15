import { NextResponse } from "next/server"
import { listConciliaciones } from "@/lib/conciliacion/registry"
import { requireOrgId } from "@/lib/auth/current-user"

export async function GET() {
  try {
    const orgId = await requireOrgId()
    const items = await listConciliaciones(orgId)
    return NextResponse.json(items)
  } catch (e) {
    if (e instanceof Error && e.message === "NO_ACTIVE_ORG") {
      return NextResponse.json({ error: "Organización requerida" }, { status: 403 })
    }
    return NextResponse.json({ error: "Error listando conciliaciones" }, { status: 500 })
  }
}
