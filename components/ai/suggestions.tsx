"use client"

// Vendorizado de 21st.dev #12342 "Suggestions" (Agent Elements, serafimcloud),
// re-tokenizado al design system RyM.

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export type SuggestionItem = {
  id: string
  label: string
  value?: string
  icon?: ReactNode
  className?: string
}

export type SuggestionsProps = {
  items: SuggestionItem[]
  onSelect: (item: SuggestionItem) => void
  disabled?: boolean
  className?: string
  itemClassName?: string
}

export function Suggestions({ items, onSelect, disabled, className, itemClassName }: SuggestionsProps) {
  if (items.length === 0) return null

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(item)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-foreground disabled:opacity-50 disabled:pointer-events-none",
            itemClassName,
            item.className,
          )}
        >
          {item.icon && <span className="inline-flex shrink-0">{item.icon}</span>}
          {item.label}
        </button>
      ))}
    </div>
  )
}
