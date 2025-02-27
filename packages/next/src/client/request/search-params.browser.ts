import type { SearchParams } from '../../server/request/search-params'

import { wellKnownProperties } from '../../shared/lib/utils/reflect-utils'

export function createRenderSearchParamsFromClient(
  underlyingSearchParams: SearchParams
): Promise<SearchParams> {
  if (process.env.NODE_ENV === 'development') {
    return (
      require('./search-params.browser.dev') as typeof import('./search-params.browser.dev')
    ).makeUntrackedExoticSearchParamsWithDevWarnings(
      underlyingSearchParams,
      CachedSearchParams
    )
  } else {
    return makeUntrackedExoticSearchParams(underlyingSearchParams)
  }
}

interface CacheLifetime {}
const CachedSearchParams = new WeakMap<CacheLifetime, Promise<SearchParams>>()

function makeUntrackedExoticSearchParams(
  underlyingSearchParams: SearchParams
): Promise<SearchParams> {
  const cachedSearchParams = CachedSearchParams.get(underlyingSearchParams)
  if (cachedSearchParams) {
    return cachedSearchParams
  }

  // We don't use makeResolvedReactPromise here because searchParams
  // supports copying with spread and we don't want to unnecessarily
  // instrument the promise with spreadable properties of ReactPromise.
  const promise = Promise.resolve(underlyingSearchParams)
  CachedSearchParams.set(underlyingSearchParams, promise)

  Object.keys(underlyingSearchParams).forEach((prop) => {
    if (wellKnownProperties.has(prop)) {
      // These properties cannot be shadowed because they need to be the
      // true underlying value for Promises to work correctly at runtime
    } else {
      ;(promise as any)[prop] = underlyingSearchParams[prop]
    }
  })

  return promise
}
