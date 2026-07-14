import { NextResponse } from "next/server"
import { isAdmin } from "@/lib/auth/current-user"
import { syncDrive } from "@/lib/drive/sync"

// Sync manual (testing sin esperar al webhook). Gateado por rol admin, corre síncrono.
export async function POST() {
  if (!(await isAdmin()))
    return NextResponse.json({ error: "Requiere rol admin" }, { status: 403 })

  try {
    const result = await syncDrive()
    return NextResponse.json(result)
  } catch (err) {
    console.error("[POST /api/drive/sync]", err)
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes("GOOGLE_DRIVE_NOT_CONFIGURED"))
      return NextResponse.json({ error: "Google Drive no está configurado (faltan credenciales/env vars)." }, { status: 503 })
    return NextResponse.json({ error: "Error sincronizando Drive" }, { status: 500 })
  }
}
