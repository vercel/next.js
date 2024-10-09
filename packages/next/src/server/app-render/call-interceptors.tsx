import type { ModuleTuple } from '../../build/webpack/loaders/metadata/types'
import type { LoaderTree } from '../lib/app-dir-module'
import type { NextRequest } from '../web/exports'
import { createInterceptor } from './create-interceptor'
import { parseLoaderTree } from './parse-loader-tree'

/**
 * Walks the provided loader tree and calls interceptors sequentially for each
 * segment. Interceptors of parallel routes for the same segment are called
 * concurrently.
 */
export async function callInterceptorsWithLoaderTree({
  loaderTree,
  request,
}: {
  loaderTree: LoaderTree
  request: NextRequest
}): Promise<void> {
  const { modules, parallelRoutes } = parseLoaderTree(loaderTree)

  const interceptor =
    modules.interceptor &&
    (await createInterceptor(modules.interceptor, request))

  if (interceptor) {
    await interceptor()
  }

  await Promise.all(
    Object.values(parallelRoutes).map(async (parallelRouteTree) =>
      callInterceptorsWithLoaderTree({
        loaderTree: parallelRouteTree,
        request,
      })
    )
  )
}

/**
 * Calls the provided interceptors sequentially.
 */
export async function callInterceptors({
  interceptors,
  request,
}: {
  interceptors: ModuleTuple[]
  request: NextRequest
}): Promise<void> {
  for (const moduleTuple of interceptors) {
    const interceptor = await createInterceptor(moduleTuple, request)

    await interceptor()
  }
}
