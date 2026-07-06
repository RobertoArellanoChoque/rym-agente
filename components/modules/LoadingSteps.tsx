"use client"

import { CheckCircle2, Loader2 } from "lucide-react"

export type StepStatus = "pending" | "active" | "done"

export interface LoadingStep {
  label: string
  status: StepStatus
}

export function LoadingSteps({ steps }: { steps: LoadingStep[] }) {
  return (
    <div className="space-y-3 py-1">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-3 text-sm">
          {step.status === "done" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          ) : step.status === "active" ? (
            <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
          ) : (
            <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/25 shrink-0" />
          )}
          <span
            className={
              step.status === "done"
                ? "text-muted-foreground"
                : step.status === "active"
                ? "text-foreground font-medium"
                : "text-muted-foreground/35"
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
