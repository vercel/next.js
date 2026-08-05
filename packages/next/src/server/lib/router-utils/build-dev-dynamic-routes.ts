import type { FilesystemDynamicRoute } from './filesystem'
import type { NextConfigComplete } from '../../config-shared'
import { getNamedRouteRegex } from '../../../shared/lib/router/utils/route-regex'
import { getRouteMatcher } from '../../../shared/lib/router/utils/route-matcher'
import { buildDataRoute } from './build-data-route'

/**
 * Builds the route list the dev router matches a request against once an exact
 * path lookup missed. The `/_next/data` routes come first so a data request
 * doesn't match the page route it shadows.
 */
export function buildDevDynamicRoutes(
  sortedRoutes: string[],
  i18n: NextConfigComplete['i18n']
): FilesystemDynamicRoute[] {
  const pageRoutes = sortedRoutes.map((page): FilesystemDynamicRoute => {
    const regex = getNamedRouteRegex(page, {
      prefixRouteKeys: true,
    })
    return {
      regex: regex.re.toString(),
      namedRegex: regex.namedRegex,
      routeKeys: regex.routeKeys,
      match: getRouteMatcher(regex),
      page,
    }
  })

  const dataRoutes = sortedRoutes.map((page): FilesystemDynamicRoute => {
    const route = buildDataRoute(page, 'development')
    const routeRegex = getNamedRouteRegex(route.page, {
      prefixRouteKeys: true,
    })
    return {
      ...route,
      regex: routeRegex.re.toString(),
      namedRegex: routeRegex.namedRegex,
      routeKeys: routeRegex.routeKeys,
      match: getRouteMatcher({
        // TODO: fix this in the manifest itself, must also be fixed in
        // upstream builder that relies on this
        re: i18n
          ? new RegExp(
              route.dataRouteRegex.replace(
                `/development/`,
                `/development/(?<nextLocale>[^/]+?)/`
              )
            )
          : new RegExp(route.dataRouteRegex),
        groups: routeRegex.groups,
      }),
    }
  })

  return [...dataRoutes, ...pageRoutes]
}
