import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSaldos, setSaldo, patchSaldo } from "@/lib/saldos/manager"

const PutSaldoSchema = z.object({
  bankId: z.string().min(1),
  bankName: z.string().min(1),
  ultimoSaldo: z.number().int(),
  ultimaFecha: z.string().min(1),
})

export async function GET() {
  return NextResponse.json(await getSaldos())
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const parsed = PutSaldoSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 })
  }
  const { bankId, bankName, ultimoSaldo, ultimaFecha } = parsed.data

  await setSaldo(bankId, {
    bankName,
    ultimoSaldo,
    ultimaFecha,
    updatedAt: new Date().toISOString(),
    updatedBy: "manual",
  })

  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { bankId, saldoConciliado, fechaConciliacion } = body as {
    bankId: string
    saldoConciliado: number
    fechaConciliacion: string
  }

  if (!bankId || saldoConciliado == null || !fechaConciliacion) {
    return NextResponse.json(
      { error: "Campos requeridos: bankId, saldoConciliado, fechaConciliacion" },
      { status: 400 }
    )
  }

  const saldos = await getSaldos()
  if (!saldos[bankId]) return NextResponse.json({ error: "Banco no encontrado" }, { status: 404 })

  await patchSaldo(bankId, { saldoConciliado, fechaConciliacion })
  return NextResponse.json({ ok: true })
}
