import { useState, useEffect } from 'react'

interface Options {
  enterDelay?: number | 'after-paint'
  exitDelay?: number
  onUnmount?: () => void
}

type Timeout = ReturnType<typeof setTimeout>

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

  const { enterDelay = 1, exitDelay = 0 } = options
  useEffect(() => {
    let renderFrame: number | undefined
    let renderTimeout: Timeout | undefined
    let unmountTimeout: Timeout | undefined

    if (active) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional cascading update
      setMounted(true)
      if (enterDelay === 'after-paint') {
        renderFrame = requestAnimationFrame(() => {
          renderFrame = requestAnimationFrame(() => setRendered(true))
        })
      } else if (enterDelay <= 0) {
        setRendered(true)
      } else {
        renderTimeout = setTimeout(() => {
          setRendered(true)
        }, enterDelay)
      }
    } else {
      setRendered(false)
      if (exitDelay <= 0) {
        setMounted(false)
      } else {
        unmountTimeout = setTimeout(() => {
          setMounted(false)
        }, exitDelay)
      }
    }

    return () => {
      if (renderFrame !== undefined) cancelAnimationFrame(renderFrame)
      clearTimeout(renderTimeout)
      clearTimeout(unmountTimeout)
    }
  }, [active, enterDelay, exitDelay])

  return { mounted, rendered }
}
