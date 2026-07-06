import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const toCentavos = (n: number) => Math.round(n * 100)

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024 // 20 MB
