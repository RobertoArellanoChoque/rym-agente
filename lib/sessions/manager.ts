import path from "path"
import os from "os"
import { promises as fs } from "fs"
import crypto from "crypto"
import { db } from "@/lib/db"
import { conciliaciones } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

// Session files (extracto.md) stay on filesystem — only OCR artifacts, not data
const SESSION_BASE = process.env.SESSION_BASE ?? path.join(os.homedir(), ".rym-agente", "sessions")

export function getSessionDir(sessionId: string): string {
  if (!/^[a-f0-9-]{36}$/.test(sessionId)) throw new Error("Invalid session ID")
  return path.join(SESSION_BASE, sessionId)
}

export async function createSession(label?: string): Promise<string> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  // Create dir for OCR files (extracto.md)
  await fs.mkdir(getSessionDir(id), { recursive: true, mode: 0o700 })
  await db.insert(conciliaciones).values({
    id,
    label: label ?? `Conciliación ${new Date().toLocaleDateString("es-AR")}`,
    stage: "new",
    createdAt: now,
    updatedAt: now,
  })
  return id
}

export async function sessionExists(sessionId: string): Promise<boolean> {
  const [row] = await db.select({ id: conciliaciones.id })
    .from(conciliaciones)
    .where(eq(conciliaciones.id, sessionId))
    .limit(1)
  return row != null
}

export async function cleanupSession(sessionId: string): Promise<void> {
  await db.delete(conciliaciones).where(eq(conciliaciones.id, sessionId))
  // Also remove any leftover OCR files
  const dir = getSessionDir(sessionId)
  await fs.rm(dir, { recursive: true, force: true })
}
