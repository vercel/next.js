import type { Params } from '../../server/request/params'

interface CacheLifetime {}
const CachedParams = new WeakMap<CacheLifetime, Promise<Params>>()

function makeUntrackedParams(underlyingParams: Params): Promise<Params> {
  const cachedParams = CachedParams.get(underlyingParams)
  if (cachedParams) {
    return cachedParams
  }

  const promise = Promise.resolve(underlyingParams)
  // Mark it as fulfilled the way React does once it has tracked it, so `use()`
  // can unwrap it without suspending.
  ;(promise as any).status = 'fulfilled'
  ;(promise as any).value = underlyingParams
  CachedParams.set(underlyingParams, promise)

  return promise
}

export function createRenderParamsFromClient(
  clientParams: Params
): Promise<Params> {
  return makeUntrackedParams(clientParams)
}
