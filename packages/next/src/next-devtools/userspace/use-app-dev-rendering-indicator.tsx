'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useTransition,
} from 'react'
import { dispatcher } from 'next/dist/compiled/next-devtools'

let activeRenderingOwner: object | null = null

export const useAppDevRenderingIndicator = () => {
  const [isPending, startTransition] = useTransition()
  const renderingOwner = useRef({})
  const transitionVersion = useRef(0)
  const renderedVersion = transitionVersion.current

  useLayoutEffect(() => {
    // Clear the HMR barrier only after React commits the transition. A layout
    // effect from an older render must not clear a transition started since.
    // Run after every commit because a synchronous transition can skip the
    // pending render and commit with isPending still false.
    if (
      renderedVersion === transitionVersion.current &&
      (activeRenderingOwner === null ||
        activeRenderingOwner === renderingOwner.current)
    ) {
      activeRenderingOwner = isPending ? renderingOwner.current : null
      dispatcher.setHmrRendering(isPending)
    }
  })

  useLayoutEffect(() => {
    const owner = renderingOwner.current
    return () => {
      // A failed router render can unmount before the transition finishes.
      // Do not clear a transition owned by its replacement instance.
      if (activeRenderingOwner === owner) {
        activeRenderingOwner = null
        dispatcher.setHmrRendering(false)
      }
    }
  }, [])

  useEffect(() => {
    if (isPending) {
      dispatcher.renderingIndicatorShow()
    } else {
      dispatcher.renderingIndicatorHide()
    }
  }, [isPending])

  return useCallback(
    (action: Parameters<typeof startTransition>[0]) => {
      transitionVersion.current++
      activeRenderingOwner = renderingOwner.current
      dispatcher.setHmrRendering(true)
      startTransition(action)
    },
    [startTransition]
  )
}
