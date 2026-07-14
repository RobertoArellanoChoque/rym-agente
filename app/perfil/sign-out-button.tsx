"use client"

import { useClerk } from "@clerk/nextjs"
import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"

// Client island: logout ("lockout") reusando nuestro Button. Evita el <button><button>
// que daría <SignOutButton> de Clerk envolviendo <Button>.
export function SignOutButton() {
  const { signOut } = useClerk()
  return (
    <Button variant="destructive" onClick={() => signOut({ redirectUrl: "/sign-in" })}>
      <LogOut className="h-4 w-4" />
      Cerrar sesión
    </Button>
  )
}
