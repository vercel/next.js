import { getSegmentParam } from '../../../shared/lib/router/utils/get-segment-param'
import type AppPageRouteModule from '../../../server/route-modules/app-page/module'
import {
  isAppPageRouteModule,
  isAppRouteRouteModule,
} from '../../../server/route-modules/checks'
import type { RouteModule } from '../../../server/route-modules/route-module'
import { InvariantError } from '../../../shared/lib/invariant-error'

function collectAppPageRootParamKeys(
  routeModule: AppPageRouteModule
): readonly string[] {
  let rootParams: string[] = []

  let current = routeModule.userland.loaderTree
  while (current) {
    const [name, parallelRoutes, modules] = current

    // If this is a dynamic segment, then we collect the param.
    const param = getSegmentParam(name)?.param
    if (param) {
      rootParams.push(param)
    }

    // If this has a layout module, then we've found the root layout because
    // we return once we found the first layout.
    if (typeof modules.layout !== 'undefined') {
      return rootParams
    }

    // This didn't include a root layout, so we need to continue. We don't need
    // to collect from other parallel routes because we can't have a parallel
    // route above a root layout.
    current = parallelRoutes.children
  }

  // If we didn't find a root layout, then we don't have any params.
  return []
}

/**
 * Collects the segments for a given route module.
 *
 * @param components the loaded components
 * @returns the segments for the route module
 */
export function collectRootParamKeys(
  routeModule: RouteModule
): readonly string[] {
  if (isAppRouteRouteModule(routeModule)) {
    return []
  }

  if (isAppPageRouteModule(routeModule)) {
    return collectAppPageRootParamKeys(routeModule)
  }

  throw new InvariantError(
    'Expected a route module to be one of app route or page'
  )
}
