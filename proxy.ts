import { NextResponse, type NextRequest } from "next/server"
import { verifyAuthCookie, COOKIE_NAME } from "@/lib/auth"

export function proxy(request: NextRequest) {
  if (verifyAuthCookie(request.cookies.get(COOKIE_NAME)?.value)) return NextResponse.next()
  if (request.nextUrl.pathname.startsWith("/api/"))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  return NextResponse.redirect(new URL("/login", request.url))
}

export const config = {
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico).*)"],
}
