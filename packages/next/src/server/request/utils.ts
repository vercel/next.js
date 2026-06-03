import { StaticGenBailoutError } from '../../client/components/static-generation-bailout'
import { afterTaskAsyncStorage } from '../app-render/after-task-async-storage.external'
import type { WorkStore } from '../app-render/work-async-storage.external'
import { createSearchParamsInUseCacheError } from '../use-cache/use-cache-messages'

export function throwWithStaticGenerationBailoutErrorWithDynamicError(
  route: string,
  expression: string
): never {
  throw new StaticGenBailoutError(
    `Route ${route} with \`dynamic = "error"\` couldn't be rendered statically because it used ${expression}. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
  )
}

export function throwForSearchParamsAccessInUseCache(
  workStore: WorkStore,
  constructorOpt: Function
): never {
  const error = createSearchParamsInUseCacheError(workStore.route)

  Error.captureStackTrace(error, constructorOpt)
  workStore.invalidDynamicUsageError ??= error

  throw error
}

export function isRequestAPICallableInsideAfter() {
  const afterTaskStore = afterTaskAsyncStorage.getStore()
  return afterTaskStore?.rootTaskSpawnPhase === 'action'
}
