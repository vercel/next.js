import { createHash } from 'node:crypto'

import {
  createCacheBustingSearchParamInput,
  encodeCacheBustingSearchParam,
} from '../../shared/lib/router/utils/cache-busting-search-param'

const CACHE_BUSTING_SEARCH_PARAM_DIGEST_BYTES = 12

export function computeCacheBustingSearchParam(
  prefetchHeader: '1' | '2' | '0' | undefined,
  segmentPrefetchHeader: string | string[] | undefined,
  stateTreeHeader: string | string[] | undefined,
  nextUrlHeader: string | string[] | undefined
): string {
  const input = createCacheBustingSearchParamInput(
    prefetchHeader,
    segmentPrefetchHeader,
    stateTreeHeader,
    nextUrlHeader
  )
  if (input === null) {
    return ''
  }

  return encodeCacheBustingSearchParam(
    createHash('sha256')
      .update(input)
      .digest()
      .subarray(0, CACHE_BUSTING_SEARCH_PARAM_DIGEST_BYTES)
  )
}
