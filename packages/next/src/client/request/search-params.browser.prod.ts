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

  const promise = Promise.resolve(
    underlyingSearchParams
  ) as Promise<SearchParams> & {
    status?: string
    value?: SearchParams
  }
  // React reads these to unwrap synchronously instead of suspending outside a Transition
  promise.status = 'fulfilled'
  promise.value = underlyingSearchParams
  CachedSearchParams.set(underlyingSearchParams, promise)

  return promise
}

export function createRenderSearchParamsFromClient(
  underlyingSearchParams: SearchParams
): Promise<SearchParams> {
  return makeUntrackedSearchParams(underlyingSearchParams)
}
