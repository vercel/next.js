import { createPullstateCore } from 'pullstate'
import { useMemo } from 'react'

import { UIStore } from './ui'

export const PullstateCore = createPullstateCore({
  UIStore,
})

export function useHydrate(snapshot) {
  return useMemo(() => {
    if (!snapshot) return PullstateCore.instantiate()
    return PullstateCore.instantiate({ hydrateSnapshot: JSON.parse(snapshot) })
  }, [snapshot])
}
