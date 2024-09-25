import { useMemo, useRef, type Ref } from 'react'

// This is a compatibility hook to support React 18 and 19 refs.
// In 19, a cleanup function from refs may be returned.
// In 18, returning a cleanup function creates a warning.
// Since we take userspace refs, we don't know ahead of time if a cleanup function will be returned.
// This implements cleanup functions with the old behavior in 18.
// We know refs are always called alternating with `null` and then `T`.
// So a call with `null` means we need to call the previous cleanup functions.
export function useMergedRef<TElement>(
  refA: Ref<TElement>,
  refB: Ref<TElement>
): Ref<TElement> {
  const cleanupA = useRef<() => void>(() => {})
  const cleanupB = useRef<() => void>(() => {})

  return useMemo(() => {
    if (!refA || !refB) {
      return refA || refB
    }

    return (current: TElement | null): void => {
      if (current === null) {
        cleanupA.current()
        cleanupB.current()
      } else {
        cleanupA.current = applyRef(refA, current)
        cleanupB.current = applyRef(refB, current)
      }
    }
  }, [refA, refB])
}

function applyRef<TElement>(
  refA: NonNullable<Ref<TElement>>,
  current: TElement
) {
  if (typeof refA === 'function') {
    const cleanup = refA(current)
    if (typeof cleanup === 'function') {
      return cleanup
    } else {
      return () => refA(null)
    }
  } else {
    refA.current = current
    return () => {
      refA.current = null
    }
  }
}
