import { NextRequest, NextResponse } from "next/server"
import { getPartidas, setPartidas, type Partida } from "@/lib/partidas/manager"
import { requireOrgId } from "@/lib/auth/current-user"

export async function GET(req: NextRequest) {
  const bankId = req.nextUrl.searchParams.get("bankId")
  if (!bankId) {
    return NextResponse.json({ error: "bankId requerido" }, { status: 400 })
  }
  try {
    const orgId = await requireOrgId()
    return NextResponse.json(await getPartidas(bankId, orgId))
  } catch (err) {
    if (err instanceof Error && err.message === "NO_ACTIVE_ORG") {
      return NextResponse.json({ error: "No hay organización activa" }, { status: 403 })
    }
    return NextResponse.json({ error: "Error leyendo partidas" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { bankId, partidas } = body as { bankId?: string; partidas?: Partida[] }
    if (!bankId) {
      return NextResponse.json({ error: "bankId requerido" }, { status: 400 })
    }
    if (!Array.isArray(partidas)) {
      return NextResponse.json({ error: "partidas debe ser un array" }, { status: 400 })
    }
    const orgId = await requireOrgId()
    await setPartidas(bankId, orgId, partidas)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof Error && err.message === "NO_ACTIVE_ORG") {
      return NextResponse.json({ error: "No hay organización activa" }, { status: 403 })
    }
    console.error("[partidas/route] PUT error:", err)
    return NextResponse.json({ error: "Error guardando partidas" }, { status: 500 })
  }
}
