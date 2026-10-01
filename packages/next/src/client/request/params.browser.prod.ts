import type { Params } from '../../server/request/params'

interface CacheLifetime {}
const CachedParams = new WeakMap<CacheLifetime, Promise<Params>>()

function makeUntrackedParams(underlyingParams: Params): Promise<Params> {
  const cachedParams = CachedParams.get(underlyingParams)
  if (cachedParams) {
    return cachedParams
  }

  const promise = Promise.resolve(underlyingParams) as Promise<Params> & {
    status?: string
    value?: Params
  }
  // React reads these to unwrap synchronously instead of suspending outside a Transition
  promise.status = 'fulfilled'
  promise.value = underlyingParams
  CachedParams.set(underlyingParams, promise)

  return promise
}

export function createRenderParamsFromClient(
  clientParams: Params
): Promise<Params> {
  return makeUntrackedParams(clientParams)
}
