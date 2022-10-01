import React, { useContext } from 'react'

export type FlushEffectsHook = (callbacks: () => React.ReactNode) => void

// Use `React.createContext` to avoid errors from the RSC checks because
// it can't be imported directly in Server Components:
//
//   import { createContext } from 'react'
//
// More info: https://github.com/vercel/next.js/pull/40686
export const FlushEffectsContext = React.createContext<FlushEffectsHook | null>(
  null as any
)

export function useFlushEffects(callback: () => React.ReactNode): void {
  const addFlushEffects = useContext(FlushEffectsContext)
  // Should have no effects on client where there's no flush effects provider
  if (addFlushEffects) {
    addFlushEffects(callback)
  }
}
