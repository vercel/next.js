import React, { createContext, useContext } from 'react'

export type FlushEffectsHook = (callbacks: () => React.ReactNode) => void

export const FlushEffectsContext = createContext<FlushEffectsHook | null>(
  null as any
)

export function useFlushEffects(callback: () => React.ReactNode): void {
  const addFlushEffects = useContext(FlushEffectsContext)
  // Should have no effects on client where there's no flush effects provider
  if (addFlushEffects) {
    addFlushEffects(callback)
  }
}
