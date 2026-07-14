// Hook nativo de Next.js: corre una vez al arrancar el server (antes de servir requests).
// Arma/renueva el canal de webhook de Google Drive y lo re-renueva cada 12hs (el canal
// expira a los 7 días — ver lib/drive/watch-manager.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return // no correr en edge runtime

  const { ensureWatch } = await import("@/lib/drive/watch-manager")
  // Fire-and-forget: no bloqueamos register() (Next.js espera a que resuelva antes de
  // aceptar tráfico) por una llamada de red a Google Drive sin timeout.
  ensureWatch().catch((err) => console.error("[instrumentation] ensureWatch inicial falló:", err))
  setInterval(() => {
    ensureWatch().catch((err) => console.error("[instrumentation] ensureWatch periódico falló:", err))
  }, 12 * 60 * 60 * 1000)
}
