"use client"

import { createContext, useContext, useState } from "react"

export type ToolEvent = {
  toolCallId: string
  toolName: string
  status: "running" | "done" | "error"
  args?: unknown
  result?: unknown
  error?: string
}

export type ChatMessage = {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  tools?: ToolEvent[]
}

const WELCOME_ID = "welcome"
const WELCOME_CONTENT =
  "Hola, soy el asistente de RyM. Podés escribirme o arrastrar un archivo (extracto bancario, resumen de tarjeta, comprobante de pago) y lo identifico automáticamente."

function makeWelcome(): ChatMessage {
  return { id: WELCOME_ID, role: "assistant", content: WELCOME_CONTENT }
}

type ChatContextValue = {
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  clearMessages: () => void
}

const Ctx = createContext<ChatContextValue | null>(null)

export function useChat() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useChat must be used within ChatProvider")
  return ctx
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([makeWelcome()])

  function clearMessages() {
    setMessages([makeWelcome()])
  }

  return (
    <Ctx.Provider value={{ messages, setMessages, clearMessages }}>
      {children}
    </Ctx.Provider>
  )
}
