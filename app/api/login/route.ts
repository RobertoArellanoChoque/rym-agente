import { NextResponse, type NextRequest } from "next/server"
import { createHash, timingSafeEqual } from "node:crypto"
import { signAuthCookie, COOKIE_NAME, MAX_AGE_S } from "@/lib/auth"
import { rateLimit, ipOf } from "@/lib/rate-limit"

export async function POST(req: NextRequest) {
  if (!rateLimit(`login:${ipOf(req)}`, 5, 15 * 60_000))
    return NextResponse.json({ error: "Demasiados intentos. Esperá 15 minutos." }, { status: 429 })

  const { password } = await req.json().catch(() => ({}))
  const expected = process.env.AUTH_PASSWORD
  // sha256 de ambos lados → misma longitud para timingSafeEqual
  const ok = !!expected && typeof password === "string" &&
    timingSafeEqual(
      createHash("sha256").update(password).digest(),
      createHash("sha256").update(expected).digest()
    )
  if (!ok) return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 })

  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, signAuthCookie(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_S,
  })
  return res
}
