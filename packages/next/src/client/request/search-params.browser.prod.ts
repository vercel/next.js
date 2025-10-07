import type { SearchParams } from '../../server/request/search-params'

interface CacheLifetime {}
const CachedSearchParams = new WeakMap<CacheLifetime, Promise<SearchParams>>()

function makeUntrackedSearchParams(
  underlyingSearchParams: SearchParams
): Promise<SearchParams> {
  const cachedSearchParams = CachedSearchParams.get(underlyingSearchParams)
  if (cachedSearchParams) {
    return cachedSearchParams
  }

  const promise = Promise.resolve(underlyingSearchParams)
  CachedSearchParams.set(underlyingSearchParams, promise)

  return promise
}

export function createRenderSearchParamsFromClient(
  underlyingSearchParams: SearchParams
): Promise<SearchParams> {
  return makeUntrackedSearchParams(underlyingSearchParams)
}
