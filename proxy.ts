import { clerkMiddleware } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

export default clerkMiddleware(async (auth, req) => {
  if (req.nextUrl.pathname.startsWith("/sign-in")) return
  if (req.nextUrl.pathname === "/api/health") return // health check público para Seenode
  if (req.nextUrl.pathname === "/api/ingest/bulk") return // ingesta server-to-server (n8n) — verificación propia por X-Ingest-Token, no Clerk
  if (req.nextUrl.pathname === "/seleccionar-org") return // evita loop de redirect: acá es donde el usuario elige/crea org
  const { isAuthenticated, orgId, redirectToSignIn } = await auth()
  if (!isAuthenticated) {
    if (req.nextUrl.pathname.startsWith("/api"))
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    return redirectToSignIn({ returnBackUrl: req.url })
  }
  if (!orgId) {
    if (req.nextUrl.pathname.startsWith("/api"))
      return NextResponse.json({ error: "No hay organización activa" }, { status: 403 })
    return NextResponse.redirect(new URL("/seleccionar-org", req.url))
  }
})

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
}
