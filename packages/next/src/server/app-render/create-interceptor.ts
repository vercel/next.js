import type { ModuleTuple } from '../../build/webpack/loaders/metadata/types'
import { workAsyncStorage } from '../../client/components/work-async-storage.external'
import { makeHangingPromise } from '../dynamic-rendering-utils'
import {
  throwWithStaticGenerationBailoutErrorWithDynamicError,
  throwWithStaticGenerationBailoutErrorWithDynamicForceStatic,
} from '../request/utils'
import type { NextRequest } from '../web/exports'
import {
  postponeWithTracking,
  throwToInterruptStaticGeneration,
  trackDynamicDataInDynamicRender,
} from './dynamic-rendering'
import { interopDefault } from './interop-default'
import { workUnitAsyncStorage } from './work-unit-async-storage.external'

const callingExpression = 'an interceptor'

export type RequestBoundInterceptor = () => Promise<void>

export async function createInterceptor(
  moduleTuple: ModuleTuple,
  request: NextRequest
): Promise<RequestBoundInterceptor> {
  const [getModule, , filePathRelative] = moduleTuple

  const interceptRequest = interopDefault(await getModule()) as (
    request: NextRequest
  ) => Promise<void>

  if (typeof interceptRequest !== 'function') {
    throw new Error(
      `The default export in "${filePathRelative}" is not a function.`
    )
  }

  let interceptorPromise: Promise<void> | undefined

  return async function intercept() {
    const workStore = workAsyncStorage.getStore()
    const workUnitStore = workUnitAsyncStorage.getStore()

    if (workStore) {
      if (workStore.forceStatic) {
        throwWithStaticGenerationBailoutErrorWithDynamicForceStatic(
          workStore.route,
          callingExpression
        )
      }

      if (workStore.dynamicShouldError) {
        throwWithStaticGenerationBailoutErrorWithDynamicError(
          workStore.route,
          callingExpression
        )
      }

      if (workUnitStore) {
        if (workUnitStore.type === 'prerender') {
          return makeHangingPromise()
        } else if (workUnitStore.type === 'prerender-ppr') {
          postponeWithTracking(
            workStore.route,
            callingExpression,
            workUnitStore.dynamicTracking
          )
        } else if (workUnitStore.type === 'prerender-legacy') {
          throwToInterruptStaticGeneration(
            callingExpression,
            workStore,
            workUnitStore
          )
        }
      }

      trackDynamicDataInDynamicRender(workStore, workUnitStore)
    }

    if (!interceptorPromise) {
      interceptorPromise = interceptRequest(request)
    }

    return interceptorPromise
  }
}
