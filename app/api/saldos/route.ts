import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSaldos, setSaldo, patchSaldo } from "@/lib/saldos/manager"
import { requireOrgId } from "@/lib/auth/current-user"

const PutSaldoSchema = z.object({
  bankId: z.string().min(1),
  bankName: z.string().min(1),
  ultimoSaldo: z.number().int(),
  ultimaFecha: z.string().min(1),
})

const PatchSaldoSchema = z.object({
  bankId: z.string().min(1),
  saldoConciliado: z.number().int(), // campo de saldo — tipar evita string/NaN en la DB
  fechaConciliacion: z.string().min(1),
})

function orgErrorOr500(e: unknown, log: string) {
  if (e instanceof Error && e.message === "NO_ACTIVE_ORG") {
    return NextResponse.json({ error: "No hay organización activa" }, { status: 403 })
  }
  console.error(log, e)
  return NextResponse.json({ error: "Error interno" }, { status: 500 })
}

export async function GET() {
  try {
    const orgId = await requireOrgId()
    return NextResponse.json(await getSaldos(orgId))
  } catch (e) {
    return orgErrorOr500(e, "[GET /api/saldos]")
  }
}

export async function PUT(req: NextRequest) {
  try {
    const parsed = PutSaldoSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 })
    }
    const { bankId, bankName, ultimoSaldo, ultimaFecha } = parsed.data
    const orgId = await requireOrgId()

    await setSaldo(bankId, orgId, {
      bankName,
      ultimoSaldo,
      ultimaFecha,
      updatedAt: new Date().toISOString(),
      updatedBy: "manual",
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return orgErrorOr500(e, "[PUT /api/saldos]")
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const parsed = PatchSaldoSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos (bankId, saldoConciliado:number, fechaConciliacion)" },
        { status: 400 }
      )
    }
    const { bankId, saldoConciliado, fechaConciliacion } = parsed.data
    const orgId = await requireOrgId()

    const saldos = await getSaldos(orgId)
    if (!saldos[bankId]) return NextResponse.json({ error: "Banco no encontrado" }, { status: 404 })

    await patchSaldo(bankId, orgId, { saldoConciliado, fechaConciliacion })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return orgErrorOr500(e, "[PATCH /api/saldos]")
  }
}
