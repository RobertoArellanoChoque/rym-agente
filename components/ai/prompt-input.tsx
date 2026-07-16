"use client"

// Primitivas extraídas de 21st.dev #10442 "AI Prompt Box" (johuniq):
// PromptInput (context) + PromptInputTextarea (autoresize) + Actions/Action.
// Sin voice recorder, image previews ni toggles; tooltip @base-ui del proyecto
// en lugar de Radix; re-tokenizado al design system RyM.

import * as React from "react"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type PromptInputContextType = {
  isLoading: boolean
  value: string
  setValue: (value: string) => void
  maxHeight: number
  onSubmit?: () => void
  disabled?: boolean
}

const PromptInputContext = React.createContext<PromptInputContextType | null>(null)

function usePromptInput() {
  const context = React.useContext(PromptInputContext)
  if (!context) throw new Error("usePromptInput must be used within a PromptInput")
  return context
}

type PromptInputProps = {
  isLoading?: boolean
  value: string
  onValueChange: (value: string) => void
  maxHeight?: number
  onSubmit?: () => void
  children: React.ReactNode
  className?: string
  disabled?: boolean
}

export function PromptInput({
  className,
  isLoading = false,
  maxHeight = 120,
  value,
  onValueChange,
  onSubmit,
  children,
  disabled = false,
}: PromptInputProps) {
  return (
    <PromptInputContext.Provider
      value={{ isLoading, value, setValue: onValueChange, maxHeight, onSubmit, disabled }}
    >
      <div
        className={cn(
          "rounded-3xl border border-border bg-card px-3 pt-3 pb-2 shadow-sm transition-all duration-300 focus-within:border-primary/40 focus-within:shadow-glow",
          className,
        )}
        role="form"
        aria-label="Escribir al agente"
      >
        {children}
      </div>
    </PromptInputContext.Provider>
  )
}

type PromptInputTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

export function PromptInputTextarea({ className, onKeyDown, ...props }: PromptInputTextareaProps) {
  const { value, setValue, maxHeight, onSubmit, disabled } = usePromptInput()
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
  }, [value, maxHeight])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      onSubmit?.()
    }
    onKeyDown?.(e)
  }

  return (
    <textarea
      ref={textareaRef}
      rows={1}
      value={value}
      onChange={e => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      className={cn(
        "flex w-full resize-none border-none bg-transparent px-0 py-1 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  )
}

export function PromptInputActions({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center gap-2 pt-1", className)} {...props}>
      {children}
    </div>
  )
}

type PromptInputActionProps = {
  tooltip: React.ReactNode
  children: React.ReactElement
  side?: "top" | "bottom" | "left" | "right"
  className?: string
}

export function PromptInputAction({ tooltip, children, side = "top", className }: PromptInputActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={side} className={className}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}
