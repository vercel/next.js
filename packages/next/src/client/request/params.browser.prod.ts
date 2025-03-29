import type { Params } from '../../server/request/params'
import { wellKnownProperties } from '../../shared/lib/utils/reflect-utils'

interface CacheLifetime {}
const CachedParams = new WeakMap<CacheLifetime, Promise<Params>>()

export function makeUntrackedExoticParams(
  underlyingParams: Params
): Promise<Params> {
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
