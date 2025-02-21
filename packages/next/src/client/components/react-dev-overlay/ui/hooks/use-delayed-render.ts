import { useState, useRef, useCallback, useEffect } from 'react'

interface Options {
  enterDelay?: number
  exitDelay?: number
  onUnmount?: () => void
}

/**
 * Useful to perform CSS transitions on React components without
 * using libraries like Framer Motion. This hook will defer the
 * unmount of a React component until after a delay.
 *
 * @param active - Whether the component should be rendered
 * @param options - Options for the delayed render
 * @param options.enterDelay - Delay before rendering the component
 * @param options.exitDelay - Delay before unmounting the component
 *
 * const Modal = ({ active }) => {
 * const { mounted, rendered } = useDelayedRender(active, {
 *  exitDelay: 2000,
 * })
 *
 * if (!mounted) return null
 *
 * return (
 *   <Portal>
 *     <div className={rendered ? 'modal visible' : 'modal'}>...</div>
 *   </Portal>
 * )
 *}
 *
 * */
export function useDelayedRender(active = false, options: Options = {}) {
  const [mounted, setMounted] = useState(active)
  const [rendered, setRendered] = useState(false)
  const renderTimerRef = useRef<number | null>(null)
  const unmountTimerRef = useRef<number | null>(null)

  const clearTimers = useCallback(() => {
    if (renderTimerRef.current !== null) {
      window.clearTimeout(renderTimerRef.current)
      renderTimerRef.current = null
    }
    if (unmountTimerRef.current !== null) {
      window.clearTimeout(unmountTimerRef.current)
      unmountTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    const { enterDelay = 1, exitDelay = 0 } = options

    clearTimers()

    if (active) {
      setMounted(true)
      if (enterDelay <= 0) {
        setRendered(true)
      } else {
        renderTimerRef.current = window.setTimeout(() => {
          setRendered(true)
        }, enterDelay)
      }
    } else {
      setRendered(false)
      if (exitDelay <= 0) {
        setMounted(false)
      } else {
        unmountTimerRef.current = window.setTimeout(() => {
          setMounted(false)
        }, exitDelay)
      }
    }

    return clearTimers
  }, [active, options, clearTimers])

  return { mounted, rendered }
}
