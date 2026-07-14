import crypto from "crypto"
import { db } from "@/lib/db"
import { tarjetasMaestras } from "@/lib/db/schema"

export const TARJETAS_MAESTRAS = [
  { nombre: "TARJETA VISA FRANCES RYM", banco: "FRANCES", tipo: "VISA" },
  { nombre: "TC AMEX BCO GALICIA GFC", banco: "GALICIA", tipo: "AMEX" },
  { nombre: "TC AMEX BCO RIO GFC", banco: "RIO", tipo: "AMEX" },
  { nombre: "TC AMEX CORP FER", banco: "FER", tipo: "AMEX" },
  { nombre: "TC AMEX CORP GFC", banco: "GFC", tipo: "AMEX" },
  { nombre: "TC AMEX CORP MAD", banco: "MAD", tipo: "AMEX" },
  { nombre: "TC AMEX GFC 3766", banco: "GFC", tipo: "AMEX" },
  { nombre: "TC AMEX GFC 3767", banco: "GFC", tipo: "AMEX" },
  { nombre: "TC MASTER BCO COMAFI", banco: "COMAFI", tipo: "MASTERCARD" },
  { nombre: "TC MASTER BCO FCES GFC CA", banco: "FCES", tipo: "MASTERCARD" },
  { nombre: "TC MASTER BCO GALICIA GFC", banco: "GALICIA", tipo: "MASTERCARD" },
  { nombre: "TC MASTER BCO MACRO GFC", banco: "MACRO", tipo: "MASTERCARD" },
  { nombre: "TC MASTER BCO PATAGONIA", banco: "PATAGONIA", tipo: "MASTERCARD" },
  { nombre: "TC VISA BCO FCES GFC", banco: "FCES", tipo: "VISA" },
  { nombre: "TC VISA BCO GALICIA GFC CA", banco: "GALICIA", tipo: "VISA" },
  { nombre: "TC VISA BCO MACRO GFC", banco: "MACRO", tipo: "VISA" },
  { nombre: "TC VISA BCO PATAGONIA GFC", banco: "PATAGONIA", tipo: "VISA" },
  { nombre: "TC VISA BCO RIO GFC", banco: "RIO", tipo: "VISA" },
  { nombre: "VISA GALICIA COPR", banco: "GALICIA", tipo: "VISA" },
] as const

export async function seedTarjetasMaestras(): Promise<void> {
  await db.insert(tarjetasMaestras)
    .values(TARJETAS_MAESTRAS.map(t => ({
      id: crypto.randomUUID(),
      nombre: t.nombre,
      banco: t.banco,
      tipo: t.tipo,
      activa: true,
    })))
    .onConflictDoNothing({ target: tarjetasMaestras.nombre })
}
