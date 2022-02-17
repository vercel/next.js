import { createContext, useContext } from 'react'

export type FlushEffectsHook = (callbacks: Array<() => React.ReactNode>) => void

export const FlushEffectsContext: React.Context<FlushEffectsHook | null> =
  createContext(null as any)

export function useFlushEffects(callbacks: Array<() => React.ReactNode>): void {
  const flushEffectsImpl = useContext(FlushEffectsContext)
  if (!flushEffectsImpl) {
    throw new Error(
      `useFlushEffects can not be called on the client.` +
        `\nRead more: https://nextjs.org/docs/messages/client-flush-effects`
    )
  }
  return flushEffectsImpl(callbacks)
}

if (process.env.NODE_ENV !== 'production') {
  FlushEffectsContext.displayName = 'FlushEffectsContext'
}
