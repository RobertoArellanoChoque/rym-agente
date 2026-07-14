"use client"

import { createContext, useContext, useState, useMemo } from "react"

type AgentActivityContextType = {
  isStreaming: boolean
  setIsStreaming: (value: boolean) => void
  hasActiveTasks: boolean
  setHasActiveTasks: (value: boolean) => void
  isActive: boolean
}

const AgentActivityContext = createContext<AgentActivityContextType | undefined>(undefined)

export function AgentActivityProvider({ children }: { children: React.ReactNode }) {
  const [isStreaming, setIsStreaming] = useState(false)
  const [hasActiveTasks, setHasActiveTasks] = useState(false)

  // useMemo: valor estable entre renders → los consumers no re-renderean salvo cambio real.
  const value = useMemo(
    () => ({ isStreaming, setIsStreaming, hasActiveTasks, setHasActiveTasks, isActive: isStreaming || hasActiveTasks }),
    [isStreaming, hasActiveTasks]
  )

  return (
    <AgentActivityContext.Provider value={value}>
      {children}
    </AgentActivityContext.Provider>
  )
}

export function useAgentActivity() {
  const ctx = useContext(AgentActivityContext)
  if (!ctx) throw new Error("useAgentActivity: must be inside AgentActivityProvider")
  return ctx
}
