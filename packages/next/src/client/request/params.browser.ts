import type { Params } from '../../server/request/params'
import { wellKnownProperties } from '../../shared/lib/utils/reflect-utils'

interface CacheLifetime {}
const CachedParams = new WeakMap<CacheLifetime, Promise<Params>>()

export function createRenderParamsFromClient(underlyingParams: Params) {
  if (process.env.NODE_ENV === 'development') {
    return (
      require('./params.browser.dev') as typeof import('./params.browser.dev')
    ).makeDynamicallyTrackedExoticParamsWithDevWarnings(
      underlyingParams,
      CachedParams
    )
  } else {
    return makeUntrackedExoticParams(underlyingParams)
  }
}

function makeUntrackedExoticParams(underlyingParams: Params): Promise<Params> {
  const cachedParams = CachedParams.get(underlyingParams)
  if (cachedParams) {
    return cachedParams
  }

  const promise = Promise.resolve(underlyingParams)
  CachedParams.set(underlyingParams, promise)

  Object.keys(underlyingParams).forEach((prop) => {
    if (wellKnownProperties.has(prop)) {
      // These properties cannot be shadowed because they need to be the
      // true underlying value for Promises to work correctly at runtime
    } else {
      ;(promise as any)[prop] = underlyingParams[prop]
    }
  })

  return promise
}
