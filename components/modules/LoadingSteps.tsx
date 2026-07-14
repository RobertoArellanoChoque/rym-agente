"use client"

import { CheckCircle2, Loader2, Circle } from "lucide-react"

export type StepStatus = "pending" | "active" | "done"

export interface LoadingStep {
  label: string
  status: StepStatus
}

export function LoadingSteps({ steps }: { steps: LoadingStep[] }) {
  return (
    <div className="space-y-2">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-2.5 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          {step.status === "done" && (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          )}
          {step.status === "active" && (
            <Loader2 className="h-4 w-4 text-amber-500 animate-spin shrink-0" />
          )}
          {step.status === "pending" && (
            <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
          )}
          <span
            className={
              step.status === "done"
                ? "text-muted-foreground"
                : step.status === "active"
                ? "text-foreground font-medium"
                : "text-muted-foreground"
            }
          >
            {step.label}
          </span>
        </div>
      ))}
    </div>
  )
}

export function buildSteps(labels: string[], activeIndex: number): LoadingStep[] {
  return labels.map((label, i) => ({
    label,
    status: activeIndex > i ? "done" : activeIndex === i ? "active" : "pending",
  }))
}
