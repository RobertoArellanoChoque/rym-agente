"use client"

import type { ConcStage } from "@/lib/types"

const DISPLAY = ["Extracto Banco", "Mayor Tango", "Comparar", "Resultados"]

const STAGE_IDX: Record<ConcStage, number> = {
  "new": 0,
  "banco-done": 1,
  "tango-done": 2,
  "done": 3,
  "aprobada": 3,
}

interface StepIndicatorProps {
  stage: ConcStage
}

export function StepIndicator({ stage }: StepIndicatorProps) {
  const current = STAGE_IDX[stage]

  return (
    <div className="flex items-center gap-2 text-xs font-medium">
      {DISPLAY.map((label, i) => {
        const isActive = i === current
        const isDone = i < current
        return (
          <span
            key={label}
            className={`px-2.5 py-1 rounded-full transition-colors ${
              isActive
                ? "bg-primary text-primary-foreground"
                : isDone
                ? "bg-emerald-100 text-emerald-700"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {label}
          </span>
        )
      })}
    </div>
  )
}
