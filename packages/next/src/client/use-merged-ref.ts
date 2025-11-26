import { useCallback, useRef, type Ref } from 'react'

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
  const cleanupA = useRef<(() => void) | null>(null)
  const cleanupB = useRef<(() => void) | null>(null)

  // NOTE: In theory, we could skip the wrapping if only one of the refs is non-null.
  // (this happens often if the user doesn't pass a ref to Link/Form/Image)
  // But this can cause us to leak a cleanup-ref into user code (previously via `<Link legacyBehavior>`),
  // and the user might pass that ref into ref-merging library that doesn't support cleanup refs
  // (because it hasn't been updated for React 19)
  // which can then cause things to blow up, because a cleanup-returning ref gets called with `null`.
  // So in practice, it's safer to be defensive and always wrap the ref, even on React 19.
  return useCallback(
    (current: TElement | null): void => {
      if (current === null) {
        const cleanupFnA = cleanupA.current
        if (cleanupFnA) {
          cleanupA.current = null
          cleanupFnA()
        }
        const cleanupFnB = cleanupB.current
        if (cleanupFnB) {
          cleanupB.current = null
          cleanupFnB()
        }
      } else {
        if (refA) {
          cleanupA.current = applyRef(refA, current)
        }
        if (refB) {
          cleanupB.current = applyRef(refB, current)
        }
      }
    },
    [refA, refB]
  )
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
