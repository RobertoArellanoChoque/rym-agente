import { NextResponse } from "next/server"
import { listConciliaciones } from "@/lib/conciliacion/registry"

export async function GET() {
  try {
    const items = await listConciliaciones()
    return NextResponse.json(items)
  } catch {
    return NextResponse.json({ error: "Error listando conciliaciones" }, { status: 500 })
  }
}
