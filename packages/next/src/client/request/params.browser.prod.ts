import type { Params } from '../../server/request/params'
import { markPromiseAsFulfilled } from './mark-promise-as-fulfilled'

interface CacheLifetime {}
const CachedParams = new WeakMap<CacheLifetime, Promise<Params>>()

function makeUntrackedParams(underlyingParams: Params): Promise<Params> {
  const cachedParams = CachedParams.get(underlyingParams)
  if (cachedParams) {
    return cachedParams
  }

  const promise = Promise.resolve(underlyingParams)
  markPromiseAsFulfilled(promise, underlyingParams)
  CachedParams.set(underlyingParams, promise)

  return promise
}

export function createRenderParamsFromClient(
  clientParams: Params
): Promise<Params> {
  return makeUntrackedParams(clientParams)
}
