"use client"

import { FileText } from "lucide-react"
import { Markdown } from "@/components/ai/markdown"
import { ToolCard } from "@/components/ai/tool-card"
import type { ChatMessage } from "@/lib/context/chat-context"

export function Message({ msg }: { msg: ChatMessage }) {
  if (msg.role === "system") {
    return (
      <div className="flex gap-2 items-start animate-in fade-in slide-in-from-bottom-1 duration-300">
        <div className="h-5 w-5 rounded-full bg-success/10 flex items-center justify-center shrink-0 mt-0.5">
          <FileText className="h-3 w-3 text-success" />
        </div>
        <div className="rounded-lg px-3 py-2 text-xs bg-success/10 text-success border border-success/20 max-w-[90%] whitespace-pre-wrap">
          {msg.content}
        </div>
      </div>
    )
  }

  if (msg.role === "user") {
    return (
      <div className="flex justify-end animate-in fade-in slide-in-from-bottom-1 duration-300">
        <div className="max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed bg-primary/10 border border-primary/20 text-foreground whitespace-pre-wrap">
          {msg.content}
        </div>
      </div>
    )
  }

  // assistant
  return (
    <div className="flex flex-col gap-0.5 max-w-[92%] animate-in fade-in duration-300">
      {msg.tools?.map(t => <ToolCard key={t.toolCallId} tool={t} />)}
      {msg.content ? (
        <Markdown content={msg.content} />
      ) : (
        !msg.tools?.length && (
          <span className="shimmer text-sm text-muted-foreground mt-1">Pensando…</span>
        )
      )}
    </div>
  )
}
