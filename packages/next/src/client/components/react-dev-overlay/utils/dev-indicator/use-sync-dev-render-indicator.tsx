import { startTransition, useCallback, useEffect, useOptimistic } from 'react'
import { devRenderIndicator } from './dev-render-indicator'

export const useSyncDevRenderIndicator = () => {
  const [isRendering, setIsRendering] = useOptimistic(false)

  useEffect(() => {
    if (isRendering) {
      devRenderIndicator.show()
    } else {
      devRenderIndicator.hide()
    }
  }, [isRendering])

  return useCallback(
    (fn: () => void) => {
      startTransition(() => setIsRendering(true))
      fn()
    },
    [setIsRendering]
  )
}
