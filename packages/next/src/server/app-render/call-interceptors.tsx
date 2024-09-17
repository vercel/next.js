import type { WorkStore } from '../../client/components/work-async-storage.external'
import type { LoaderTree } from '../lib/app-dir-module'
import { createInterceptor } from './create-interceptor'
import { parseLoaderTree } from './parse-loader-tree'
import type { RequestStore } from './work-unit-async-storage.external'

/**
 * Walks the provided loader tree and calls interceptors sequentially for each
 * segment. Interceptors of parallel routes for the same segment are called
 * concurrently.
 */
export async function callInterceptors({
  loaderTree,
  requestStore,
  workStore,
}: {
  loaderTree: LoaderTree
  requestStore: RequestStore
  workStore: WorkStore
}): Promise<void> {
  const { modules, parallelRoutes } = parseLoaderTree(loaderTree)

  const interceptor =
    modules.interceptor &&
    (await createInterceptor(modules.interceptor, requestStore, workStore))

  if (interceptor) {
    await interceptor()
  }

  await Promise.all(
    Object.values(parallelRoutes).map(async (parallelRouteTree) =>
      callInterceptors({
        loaderTree: parallelRouteTree,
        requestStore,
        workStore,
      })
    )
  )
}
