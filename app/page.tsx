"use client"

import { ChatInterface } from "@/components/modules/ChatInterface"

const WELCOME =
  "Subime un extracto bancario, un resumen de tarjeta o un comprobante de pago y lo proceso automáticamente. También puedo responder preguntas sobre conciliaciones, saldos y retenciones."

export default function AgentePage() {
  return (
    <div className="flex flex-col flex-1 min-h-0 px-6 py-5">
      <div className="flex flex-col flex-1 min-h-0 w-full max-w-3xl mx-auto">
        <ChatInterface welcomeMessage={WELCOME} />
      </div>
    </div>
  )
}
