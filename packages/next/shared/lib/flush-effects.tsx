import React, { createContext, useContext } from 'react'

export type FlushEffectsHook = (callbacks: () => React.ReactNode) => void

export const FlushEffectsContext = createContext<FlushEffectsHook | null>(
  null as any
)

export function useFlushEffects(callbacks: () => React.ReactNode): void {
  const flushEffectsImpl = useContext(FlushEffectsContext)
  // Should have no effects on client where there's no flush effects provider
  if (!flushEffectsImpl) return
  return flushEffectsImpl(callbacks)
}
