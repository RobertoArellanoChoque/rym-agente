import { NextRequest, NextResponse } from "next/server"
import { getPartidas, setPartidas, type Partida } from "@/lib/partidas/manager"

export async function GET(req: NextRequest) {
  const bankId = req.nextUrl.searchParams.get("bankId")
  if (!bankId) {
    return NextResponse.json({ error: "bankId requerido" }, { status: 400 })
  }
  try {
    return NextResponse.json(await getPartidas(bankId))
  } catch {
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
    await setPartidas(bankId, partidas)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[partidas/route] PUT error:", err)
    return NextResponse.json({ error: "Error guardando partidas" }, { status: 500 })
  }
}
