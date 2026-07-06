import { createHmac, timingSafeEqual } from "node:crypto"

const SECRET = process.env.AUTH_SECRET ?? ""
export const COOKIE_NAME = "auth"
export const MAX_AGE_S = 60 * 60 * 24 * 30 // 30 días

const sig = (exp: string) => createHmac("sha256", SECRET).update(exp).digest("hex")

export function signAuthCookie(): string {
  const exp = String(Date.now() + MAX_AGE_S * 1000)
  return `${exp}.${sig(exp)}`
}

export function verifyAuthCookie(value: string | undefined): boolean {
  if (!SECRET || !value) return false
  const [exp, mac] = value.split(".")
  if (!exp || !mac) return false
  const expected = Buffer.from(sig(exp))
  const actual = Buffer.from(mac)
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected) && Number(exp) > Date.now()
}
