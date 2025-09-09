import { useEffect, useRef, useState } from 'react'

/**
 * A React hook that ensures a loading state persists
 * at least up to the next multiple of a given interval (default: 750ms).
 *
 * For example, if you're done loading at 1200ms, it forces you to wait
 * until 1500ms. If it’s 1800ms, it waits until 2250ms, etc.
 *
 * @param isLoadingTrigger - Boolean that triggers the loading state
 * @param interval - The time interval multiple in ms (default: 750ms)
 * @returns Current loading state that respects multiples of the interval
 */
export function useMinimumLoadingTimeMultiple(
  isLoadingTrigger: boolean,
  interval = 750
) {
  const [isLoading, setIsLoading] = useState(false)
  const loadStartTimeRef = useRef<number | null>(null)
  const timeoutIdRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // Clear any pending timeout to avoid overlap
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current)
      timeoutIdRef.current = null
    }

    if (isLoadingTrigger) {
      // If we enter "loading" state, record start time if not already
      if (loadStartTimeRef.current === null) {
        loadStartTimeRef.current = Date.now()
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- TODO
      setIsLoading(true)
    } else {
      // If we're exiting the "loading" state:
      if (loadStartTimeRef.current === null) {
        // No start time was recorded, so just stop loading immediately
        setIsLoading(false)
      } else {
        // How long we've been "loading"
        const timeDiff = Date.now() - loadStartTimeRef.current

        // Next multiple of `interval` after `timeDiff`
        const nextMultiple = interval * Math.ceil(timeDiff / interval)

        // Remaining time needed to reach that multiple
        const remainingTime = nextMultiple - timeDiff

        if (remainingTime > 0) {
          // If not yet at that multiple, schedule the final step
          timeoutIdRef.current = setTimeout(() => {
            setIsLoading(false)
            loadStartTimeRef.current = null
          }, remainingTime)
        } else {
          // We're already past the multiple boundary
          setIsLoading(false)
          loadStartTimeRef.current = null
        }
      }
    }

    // Cleanup when effect is about to re-run or component unmounts
    return () => {
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current)
      }
    }
  }, [isLoadingTrigger, interval])

  return isLoading
}
