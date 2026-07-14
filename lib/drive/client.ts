import { google, drive_v3 } from "googleapis"

// Mismo patrón que MISTRAL_API_KEY_NOT_CONFIGURED (lib/extractos/mistral-ocr.ts):
// mensaje fijo que los callers detectan con .includes() para mapear a 503/warning silencioso.
function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error("GOOGLE_DRIVE_NOT_CONFIGURED")
  return v
}

/** Cliente autenticado de Drive API v3 vía Service Account (drive.readonly). */
export function getDriveClient(): drive_v3.Drive {
  const email = requireEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL")
  const key = requireEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n")
  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  })
  return google.drive({ version: "v3", auth })
}

// Carpeta raíz de Drive a vigilar (id, no path).
export const driveFolderId = (): string => requireEnv("GOOGLE_DRIVE_FOLDER_ID")

// URL pública de la app en producción, para armar la webhook address.
export const appUrl = (): string => requireEnv("APP_URL")
