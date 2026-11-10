import type { VaryPath, VaryPathNode } from '../segment-cache/vary-path'

// In the browser, React keys include concrete params so navigation preserves
// or resets component state according to the segment's actual identity.
export { createRouterCacheKey as createSegmentKey } from './create-router-cache-key'

// The head's key also includes the search params. Otherwise, inside a
// transition, `useDeferredValue` returns the new (still pending) head instead
// of the prefetched one, and the whole navigation suspends.
export function createHeadKey(varyPath: VaryPath): string {
  // Encode the parts as a JSON array rather than joining them. A catch-all
  // value and a search string can both contain `/`, so joined strings from
  // different params could be the same.
  const parts: Array<string> = [varyPath.value]
  let params: VaryPathNode | null = varyPath.parent
  while (params !== null) {
    const value = params.value
    if (typeof value === 'string') {
      parts.push(value)
    }
    params = params.parent
  }
  return JSON.stringify(parts)
}
