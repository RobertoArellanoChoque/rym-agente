import { google, drive_v3 } from "googleapis"

// Mismo patrón que MISTRAL_API_KEY_NOT_CONFIGURED (lib/extractos/mistral-ocr.ts):
// mensaje fijo que los callers detectan con .includes() para mapear a 503/warning silencioso.
function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error("GOOGLE_DRIVE_NOT_CONFIGURED")
  return v
}

// ponytail: OAuth2 a cuenta personal en vez de service account — la org de Google
// del usuario bloquea iam.disableServiceAccountKeyCreation. Subir a cuenta
// compartida del estudio cuando se resuelva esa política (ver client_id/secret/
// refresh_token abajo, todos ligados a la cuenta que dio el consentimiento).
/** Cliente autenticado de Drive API v3 vía OAuth2 + refresh token (drive.readonly). */
export function getDriveClient(): drive_v3.Drive {
  const clientId = requireEnv("GOOGLE_OAUTH_CLIENT_ID")
  const clientSecret = requireEnv("GOOGLE_OAUTH_CLIENT_SECRET")
  const refreshToken = requireEnv("GOOGLE_OAUTH_REFRESH_TOKEN")
  const auth = new google.auth.OAuth2(clientId, clientSecret)
  auth.setCredentials({ refresh_token: refreshToken })
  return google.drive({ version: "v3", auth })
}

// Carpeta raíz de Drive a vigilar (id, no path).
export const driveFolderId = (): string => requireEnv("GOOGLE_DRIVE_FOLDER_ID")

// URL pública de la app en producción, para armar la webhook address.
export const appUrl = (): string => requireEnv("APP_URL")
