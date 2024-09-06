import type { ModuleTuple } from '../../build/webpack/loaders/metadata/types'
import { StaticGenBailoutError } from '../../client/components/static-generation-bailout'
import type { WorkStore } from '../../client/components/work-async-storage.external'
import type { NextRequest } from '../web/exports'
import { markCurrentScopeAsDynamic } from './dynamic-rendering'
import { interopDefault } from './interop-default'
import {
  workUnitAsyncStorage,
  type RequestStore,
} from './work-unit-async-storage.external'

const callingExpression = 'an interceptor'

export async function createInterceptor(
  moduleTuple: ModuleTuple,
  requestStore: RequestStore,
  workStore: WorkStore
): Promise<() => Promise<void>> {
  const [getModule] = moduleTuple
  const workUnitStore = workUnitAsyncStorage.getStore()

  const interceptRequest = interopDefault(await getModule()) as (
    request: NextRequest
  ) => Promise<void>

  let interceptorPromise: Promise<void> | undefined

  return function intercept() {
    if (workStore.forceStatic) {
      throw new StaticGenBailoutError(
        `Route ${workStore.route} with \`dynamic = "force-static"\` couldn't be rendered statically because it used ${callingExpression}. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
      )
    } else {
      markCurrentScopeAsDynamic(workStore, workUnitStore, callingExpression)
    }

    if (!interceptorPromise) {
      interceptorPromise = interceptRequest(requestStore.nextRequest)
    }

    return interceptorPromise
  }
}
