import crypto from "crypto"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { driveSyncState } from "@/lib/db/schema"
import { getDriveClient, appUrl } from "@/lib/drive/client"

const RENEW_BEFORE_MS = 24 * 60 * 60 * 1000 // renovar si faltan <24hs para expirar
const CHANNEL_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 días — máximo soportado por Drive para changes.watch

/**
 * Crea o renueva el canal de webhook de Google Drive (drive.changes.watch — vigila
 * TODOS los cambios del Drive del service account; el filtro por carpeta se hace
 * en syncDrive() al procesar cada change). Sin credenciales configuradas, no rompe
 * el arranque del server: loguea un warning y sale.
 */
export async function ensureWatch(): Promise<void> {
  try {
    const [state] = await db.select().from(driveSyncState).where(eq(driveSyncState.id, "default")).limit(1)
    const expiresAt = state?.channelExpiration ? new Date(state.channelExpiration).getTime() : 0
    if (expiresAt - Date.now() > RENEW_BEFORE_MS) return // canal vivo por más de 24hs todavía, nada que hacer

    const secret = process.env.GOOGLE_DRIVE_WEBHOOK_SECRET
    if (!secret) throw new Error("GOOGLE_DRIVE_NOT_CONFIGURED")

    const drive = getDriveClient()
    let pageToken = state?.pageToken ?? null
    if (!pageToken) {
      const { data } = await drive.changes.getStartPageToken({})
      pageToken = data.startPageToken ?? null
    }
    if (!pageToken) throw new Error("No se pudo obtener pageToken inicial de Drive")

    const channelId = crypto.randomUUID()
    const expiration = Date.now() + CHANNEL_TTL_MS

    const { data: channel } = await drive.changes.watch({
      pageToken,
      requestBody: {
        id: channelId,
        type: "web_hook",
        address: `${appUrl()}/api/drive/webhook`,
        token: secret,
        expiration: String(expiration),
      },
    })

    const now = new Date().toISOString()
    const values = {
      pageToken,
      channelId: channel.id ?? channelId,
      resourceId: channel.resourceId ?? null,
      channelExpiration: new Date(expiration).toISOString(),
      updatedAt: now,
    }
    await db.insert(driveSyncState)
      .values({ id: "default", ...values })
      .onConflictDoUpdate({ target: driveSyncState.id, set: values })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes("GOOGLE_DRIVE_NOT_CONFIGURED")) {
      console.warn("[drive-watch] Google Drive no configurado todavía (faltan credenciales/env vars) — omito ensureWatch()")
      return
    }
    console.error("[drive-watch] error creando/renovando canal:", err)
  }
}
