import type { Segment } from '../../shared/lib/app-router-types'
import { canonicalizeURLPart } from '../route-params'

// `paramCacheKey` (segment[1]) is a single canonicalized URL part for
// dynamic params, but for catch-all params it's multiple parts joined by
// `/` (see `getCacheKeyForDynamicParam` / `getParamValueFromCacheKey` in
// route-params.ts). Canonicalizing the joined string as a whole would
// re-encode those literal `/` separators, making genuinely different
// catch-all segments (e.g. `["a", "b"]` vs `["a%2Fb"]`) compare as equal.
// Canonicalizing each `/`-delimited part individually keeps the separators
// intact while still normalizing encoding within each part.
function canonicalizeParamCacheKey(paramCacheKey: string): string {
  return paramCacheKey.split('/').map(canonicalizeURLPart).join('/')
}

export const matchSegment = (
  existingSegment: Segment,
  segment: Segment
): boolean => {
  // segment is either Array or string
  if (typeof existingSegment === 'string') {
    if (typeof segment === 'string') {
      // Common case: segment is just a string
      return existingSegment === segment
    }
    return false
  }

  if (typeof segment === 'string') {
    return false
  }
  return (
    existingSegment[0] === segment[0] &&
    canonicalizeParamCacheKey(existingSegment[1]) ===
      canonicalizeParamCacheKey(segment[1])
  )
}
