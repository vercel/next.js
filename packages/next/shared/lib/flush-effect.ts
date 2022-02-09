import { createContext, useContext } from 'react'

export type FlushEffectHook = (callback: () => React.ReactNode) => void

export const FlushEffectContext: React.Context<FlushEffectHook | null> =
  createContext(null as any)

export function useFlushEffect(callback: () => React.ReactNode): void {
  const flushEffectImpl = useContext(FlushEffectContext)
  return flushEffectImpl!(callback)
}

if (process.env.NODE_ENV !== 'production') {
  FlushEffectContext.displayName = 'FlushEffectContext'
}
