import { useMemo, type Ref } from 'react'

export function useMergedRef<TElement>(
  refA: Ref<TElement>,
  refB: Ref<TElement>
): Ref<TElement> {
  return useMemo(() => mergeRefs(refA, refB), [refA, refB])
}

export function mergeRefs<TElement>(
  refA: Ref<TElement>,
  refB: Ref<TElement>
): Ref<TElement> {
  if (!refA || !refB) {
    return refA || refB
  }

  return (current: TElement) => {
    const cleanupA = applyRef(refA, current)
    const cleanupB = applyRef(refB, current)

    return () => {
      cleanupA()
      cleanupB()
    }
  }
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
