import type { ModuleTuple } from '../../build/webpack/loaders/metadata/types'
import type { NextRequest } from '../web/exports'
import { interopDefault } from './interop-default'

export async function createInterceptor(
  moduleTuple: ModuleTuple
  // TODO(interceptors): Pass in nextRequest here instead of consuming it from
  // the RequestStorage to avoid invariant error when the store is undefined.
): Promise<(request: NextRequest) => Promise<void>> {
  const [getModule] = moduleTuple

  const interceptRequest = interopDefault(await getModule()) as (
    request: NextRequest
  ) => Promise<void>

  let interceptorPromise: Promise<void> | undefined

  return function intercept(request: NextRequest) {
    if (!interceptorPromise) {
      interceptorPromise = interceptRequest(request)
    }

    return interceptorPromise
  }
}
