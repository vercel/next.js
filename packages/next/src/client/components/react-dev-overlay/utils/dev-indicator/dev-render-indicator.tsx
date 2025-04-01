/*
 * Singleton store to track whether the app is currently being rendered
 * Used by the dev tools indicator to show render status
 */

import { useEffect, useOptimistic } from 'react'

const optimisticStateSetters = new Set<(boolean: true) => void>()

export function useIsDevRendering() {
  const [isDevRendering, setIsDevRendering] = useOptimistic(false)
  useEffect(() => {
    optimisticStateSetters.add(setIsDevRendering)
    return () => {
      optimisticStateSetters.delete(setIsDevRendering)
    }
  }, [setIsDevRendering])
  return isDevRendering
}

export function setDevRenderIndicatorPending() {
  optimisticStateSetters.forEach((setter) => setter(true))
}
