import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

// Readiness/liveness para Seenode. Público (allowlisteado en proxy.ts).
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    await db.execute(sql`select 1`)
    return NextResponse.json({ status: "ok" })
  } catch {
    return NextResponse.json({ status: "db_error" }, { status: 503 })
  }
}
