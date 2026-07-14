import { timingSafeEqual } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { syncDrive } from "@/lib/drive/sync"

// Push notification de Google Drive (drive.changes.watch). Ruta pública (ver proxy.ts) —
// autenticada por secret compartido en el header de token del canal, no por Clerk.
export async function POST(req: NextRequest) {
  const token = req.headers.get("X-Goog-Channel-Token")
  const secret = process.env.GOOGLE_DRIVE_WEBHOOK_SECRET
  // Longitud primero (no es información sensible para un secreto fijo), timingSafeEqual
  // solo si matchea — evita tirar excepción por buffers de largo distinto.
  const authorized =
    !!token &&
    !!secret &&
    token.length === secret.length &&
    timingSafeEqual(Buffer.from(token), Buffer.from(secret))
  if (!authorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Primer ping al crear el canal — solo confirma que el endpoint responde, sin datos que procesar.
  if (req.headers.get("X-Goog-Resource-State") === "sync") {
    return NextResponse.json({ ok: true })
  }

  // Fire-and-forget: Google espera 200 rápido (timeout corto), no bloqueamos la
  // respuesta esperando el sync completo.
  syncDrive()
    .then((r) => console.log(`[drive-webhook] sync ok — procesados=${r.procesados} errores=${r.errores}`))
    .catch((err) => console.error("[drive-webhook] sync error:", err))

  return NextResponse.json({ ok: true })
}
