import type { ModuleTuple } from '../../build/webpack/loaders/metadata/types'
import type { NextRequest } from '../web/exports'
import { interopDefault } from './interop-default'

export async function createInterceptor(
  moduleTuple: ModuleTuple,
  request: NextRequest
): Promise<() => Promise<void>> {
  const [getModule] = moduleTuple

  const interceptRequest = interopDefault(await getModule()) as (
    request: NextRequest
  ) => Promise<void>

  let interceptorPromise: Promise<void> | undefined

  return function intercept() {
    if (!interceptorPromise) {
      interceptorPromise = interceptRequest(request)
    }

    return interceptorPromise
  }
}
