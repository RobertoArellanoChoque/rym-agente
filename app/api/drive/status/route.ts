import { NextResponse } from "next/server"
import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { driveArchivos, driveSyncState } from "@/lib/db/schema"
import { isAdmin } from "@/lib/auth/current-user"

export async function GET() {
  if (!(await isAdmin()))
    return NextResponse.json({ error: "Requiere rol admin" }, { status: 403 })

  const [state] = await db.select().from(driveSyncState).where(eq(driveSyncState.id, "default")).limit(1)
  const archivos = await db.select().from(driveArchivos).orderBy(desc(driveArchivos.createdAt)).limit(20)

  return NextResponse.json({
    configured: !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET && process.env.GOOGLE_OAUTH_REFRESH_TOKEN && process.env.GOOGLE_DRIVE_FOLDER_ID),
    state: state ?? null,
    archivos,
  })
}
