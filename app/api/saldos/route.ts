import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSaldos, setSaldo, patchSaldo } from "@/lib/saldos/manager"

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

export async function GET() {
  try {
    return NextResponse.json(await getSaldos())
  } catch (e) {
    console.error("[GET /api/saldos]", e)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const parsed = PutSaldoSchema.safeParse(await req.json().catch(() => null))
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
  } catch (e) {
    console.error("[PUT /api/saldos]", e)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
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

    const saldos = await getSaldos()
    if (!saldos[bankId]) return NextResponse.json({ error: "Banco no encontrado" }, { status: 404 })

    await patchSaldo(bankId, { saldoConciliado, fechaConciliacion })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[PATCH /api/saldos]", e)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
