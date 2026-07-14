import { clerkMiddleware } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

export default clerkMiddleware(async (auth, req) => {
  if (req.nextUrl.pathname.startsWith("/sign-in")) return
  if (req.nextUrl.pathname === "/api/health") return // health check público para Seenode
  if (req.nextUrl.pathname === "/api/drive/webhook") return // push notifications de Google Drive — verificación propia por secret compartido, no Clerk
  const { isAuthenticated, redirectToSignIn } = await auth()
  if (!isAuthenticated) {
    if (req.nextUrl.pathname.startsWith("/api"))
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    return redirectToSignIn({ returnBackUrl: req.url })
  }
})

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
}
