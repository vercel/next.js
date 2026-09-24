import type { ParallelRouteProps } from '../shared/lib/parallel-route-loader.shared-runtime'
import type { LoadComponentsReturnType } from './load-components'
import { loadRouteModule } from './load-route-module'
import { normalizeRoutePath } from '../shared/lib/page-path/normalize-route-path'
import { getRouteModule } from './route-modules/route-module-utils'
import { getRequestMeta } from './request-meta'
import type { IncomingMessage, ServerResponse } from 'http'
import type { AppRouterInstance } from '../shared/lib/app-router-context.shared-runtime'
import { AppRouterContext } from '../shared/lib/app-router-context.shared-runtime'
import { createParallelRouteLoader } from '../shared/lib/parallel-route-loader.shared-runtime'
import { getTracer } from './lib/trace/tracer'
import { RenderSpan } from './lib/trace/constants'

export async function loadParallelRoute(
  req: IncomingMessage,
  res: ServerResponse,
  routePath: string,
  parallelRouteProps: ParallelRouteProps,
  loadComponents: LoadComponentsReturnType<any>,
  appRouter: AppRouterInstance
): Promise<any> {
  const normalizedRoutePath = normalizeRoutePath(routePath)
  const routeModule = await getRouteModule(normalizedRoutePath, loadComponents)

  if (!routeModule) {
    return null
  }

  const { default: Component } = routeModule
  const loading = routeModule.loading

  // Check if loading.tsx exists for this parallel route segment
  if (loading) {
    const LoadingComponent = loading.default
    if (LoadingComponent) {
      // Create a suspense boundary for the loading component
      const Suspense = React.Suspense
      return (
        <Suspense fallback={React.createElement(LoadingComponent)}>
          {React.createElement(Component, parallelRouteProps)}
        </Suspense>
      )
    }
  }

  return React.createElement(Component, parallelRouteProps)
}

export function createParallelRouteLoaderImpl(
  req: IncomingMessage,
  res: ServerResponse,
  loadComponents: LoadComponentsReturnType<any>,
  appRouter: AppRouterInstance
) {
  return createParallelRouteLoader({
    loadRoute: async (routePath, parallelRouteProps) => {
      return loadParallelRoute(
        req,
        res,
        routePath,
        parallelRouteProps,
        loadComponents,
        appRouter
      )
    },
  })
}