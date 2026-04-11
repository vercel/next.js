import { StaticGenBailoutError } from '../../client/components/static-generation-bailout'
import { afterTaskAsyncStorage } from '../app-render/after-task-async-storage.external'
import type { WorkStore } from '../app-render/work-async-storage.external'
import type { WorkUnitStore } from '../app-render/work-unit-async-storage.external'

type OutputExportServerRequestAPIKind = 'request-data' | 'connection'

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
  const error = new Error(
    `Route ${workStore.route} used \`searchParams\` inside "use cache". Accessing dynamic request data inside a cache scope is not supported. If you need some search params inside a cached function await \`searchParams\` outside of the cached function and pass only the required search params as arguments to the cached function. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache`
  )

  Error.captureStackTrace(error, constructorOpt)
  workStore.invalidDynamicUsageError ??= error

  throw error
}

export function throwForOutputExportServerRequestAPI(
  workStore: WorkStore,
  expression: string,
  constructorOpt: Function,
  reason: string
): never {
  const existingError = workStore.invalidDynamicUsageError
  if (existingError) {
    throw existingError
  }

  const error = new Error(
    `Route "${workStore.route}" used ${expression} in a Server Component with "output: export". This is not supported because ${reason} See more info here: https://nextjs.org/docs/app/guides/static-exports`
  )

  Error.captureStackTrace(error, constructorOpt)
  workStore.invalidDynamicUsageError ??= error

  throw error
}

export function shouldErrorForOutputExportServerRequestAPI(
  workUnitStore: WorkUnitStore,
  apiKind: OutputExportServerRequestAPIKind
): boolean {
  switch (workUnitStore.type) {
    case 'request':
    case 'prerender':
    case 'prerender-runtime':
      return true
    case 'prerender-client':
      return apiKind === 'connection'
    case 'validation-client':
    case 'cache':
    case 'private-cache':
    case 'unstable-cache':
    case 'generate-static-params':
    case 'prerender-ppr':
    case 'prerender-legacy':
      return false
    default:
      return workUnitStore satisfies never
  }
}

export function isRequestAPICallableInsideAfter() {
  const afterTaskStore = afterTaskAsyncStorage.getStore()
  return afterTaskStore?.rootTaskSpawnPhase === 'action'
}
