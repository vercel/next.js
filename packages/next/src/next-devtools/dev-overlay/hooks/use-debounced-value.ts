import { useEffect, useState } from 'react'

interface Options<T> {
  /**
   * Optional predicate evaluated when `value` changes. If it returns `true`
   * for the current transition, the new value is committed synchronously,
   * bypassing the debounce. Useful for "smooth subsequent updates but never
   * delay the first one" patterns.
   *
   * Should be a stable reference (module-level or `useCallback`-wrapped) to
   * avoid re-running the effect on every render.
   */
  leading?: (prev: T, next: T) => boolean
}

/**
 * Returns a trailing-edge debounced version of `value`. When `value` changes,
 * the returned value is updated only after `ms` has elapsed without further
 * changes.
 *
 * The first value is committed synchronously. Subsequent changes are delayed
 * by `ms` unless `options.leading` returns `true` for the transition.
 */
export function useDebouncedValue<T>(
  value: T,
  ms: number,
  options: Options<T> = {}
): T {
  const [debounced, setDebounced] = useState(value)
  const { leading } = options

  // Handle leading/immediate transitions during render rather than in an
  // effect. When setState is called synchronously during render, React discards
  // the intermediate render without committing it to the DOM — no extra paint.
  // This avoids the double-render that would occur if we called setDebounced
  // inside useEffect for the immediate path.
  if (!Object.is(value, debounced) && leading?.(debounced, value)) {
    setDebounced(value)
  }

  useEffect(() => {
    if (Object.is(value, debounced)) return

    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, debounced, ms])

  return debounced
}
