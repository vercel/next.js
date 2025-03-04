import { StaticGenBailoutError } from '../../client/components/static-generation-bailout'
import { afterTaskAsyncStorage } from '../app-render/after-task-async-storage.external'

export function throwWithStaticGenerationBailoutError(
  route: string,
  expression: string
): never {
  throw new StaticGenBailoutError(
    `Route ${route} couldn't be rendered statically because it used ${expression}. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
  )
}

export function throwWithStaticGenerationBailoutErrorWithDynamicError(
  route: string,
  expression: string
): never {
  throw new StaticGenBailoutError(
    `Route ${route} with \`dynamic = "error"\` couldn't be rendered statically because it used ${expression}. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
  )
}

export function throwForSearchParamsAccessInUseCache(route: string): never {
  throw new Error(
    `Route ${route} used "searchParams" inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use "searchParams" outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache`
  )
}

export function isRequestAPICallableInsideAfter() {
  const afterTaskStore = afterTaskAsyncStorage.getStore()
  return afterTaskStore?.rootTaskSpawnPhase === 'action'
}
