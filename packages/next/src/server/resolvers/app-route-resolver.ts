import path from 'path'
import { isAppRoute } from '../../lib/is-app-route'
import {
  APP_PATHS_MANIFEST,
  SERVER_DIRECTORY,
} from '../../shared/lib/constants'
import { getSortedRoutes, isDynamicRoute } from '../../shared/lib/router/utils'
import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'
import {
  getRouteMatcher,
  Params,
  RouteMatch,
} from '../../shared/lib/router/utils/route-matcher'
import { getRouteRegex } from '../../shared/lib/router/utils/route-regex'
import type { BaseNextRequest } from '../base-http'
import type { ModuleLoader } from '../module-loader/module-loader'
import { NodeModuleLoader } from '../module-loader/node-module-loader'
import { LocaleRouteNormalizer } from '../normalizers/locale-route-normalizer'
import type { Normalizer } from '../normalizers/normalizer'
import type { AppRouteModule, AppRouteRoute } from '../routes/app-route-route'
import { RouteType } from '../routes/route'
import type { Resolver } from './resolver'

type RoutingItem = { page: string; pathname: string; filename: string }
type DynamicRoutingItem = RoutingItem & { match: RouteMatch }

type RoutingItemMatch = RoutingItem & { params?: Params }

export class AppRouteResolver implements Resolver<AppRouteRoute> {
  private readonly normalized: Record<string, RoutingItem>
  private readonly dynamic: ReadonlyArray<DynamicRoutingItem>

  constructor(
    private readonly distDir: string,
    appPathsManifest: Record<string, string> = require(path.join(
      distDir,
      SERVER_DIRECTORY,
      APP_PATHS_MANIFEST
    )),
    localeRouteNormalizer: Normalizer = new LocaleRouteNormalizer(),
    private readonly moduleLoader: ModuleLoader = new NodeModuleLoader()
  ) {
    // Find all the app routes in the manifest.
    const appRoutes = Object.keys(appPathsManifest).filter((pathname) =>
      isAppRoute(pathname)
    )

    // Normalized all the routes.
    this.normalized = appRoutes.reduce<Record<string, RoutingItem>>(
      (normalized, pathname) => {
        const normalizedPathname = normalizeAppPath(pathname) || '/'

        // Only consider the first match for each normalized pathname.
        if (normalized[normalizedPathname]) return normalized

        normalized[normalizedPathname] = {
          pathname: normalizedPathname,
          page: pathname,
          filename: path.join(
            this.distDir,
            SERVER_DIRECTORY,
            appPathsManifest[pathname]
          ),
        }

        return normalized
      },
      {}
    )

    this.dynamic = getSortedRoutes(
      Object.keys(this.normalized)
        .filter((pathname) => isDynamicRoute(pathname))
        // Normalize the route
        .map((pathname) => localeRouteNormalizer.normalize(pathname))
        // Remove all the duplicates from the array.
        .filter(
          (pathname, index, pathnames) => pathnames.indexOf(pathname) === index
        )
    ).map((pathname) => {
      const { page, filename } = this.normalized[pathname]
      return {
        page,
        pathname,
        filename,
        match: getRouteMatcher(getRouteRegex(pathname)),
      }
    })
  }

  /**
   *
   * @param pathname the request pathname to find a route for
   * @returns the matched route data
   */
  private match(pathname: string): RoutingItemMatch | null {
    // Try a direct match, this could be something like `/about`.
    if (pathname in this.normalized) return this.normalized[pathname]

    // TODO: handle case where a url is requested with the literal matching params like `/accounts/[id]`, similar to below
    // // Ensure a request to the URL /accounts/[id] will be treated as a dynamic
    // // route correctly and not loaded immediately without parsing params.
    // if (!isDynamicRoute(page)) {
    //   const result = await this.renderPageComponent(ctx, bubbleNoFallback)
    //   if (result !== false) return result
    // }

    // For all the dynamic routes, try and match the pathname as well.
    for (const route of this.dynamic) {
      const params = route.match(pathname)

      // Could not match the dynamic route, continue!
      if (!params) continue

      // Matched! Return the normalized path, page, and params.
      return {
        page: route.page,
        pathname: route.pathname,
        filename: route.filename,
        params,
      }
    }

    return null
  }

  /**
   * Resolves the route for the incoming request if it's an AppRouteRoute.
   *
   * @param req the request for which the route could be resolved from
   */
  public resolve(req: BaseNextRequest): AppRouteRoute | null {
    const url = new URL(req.url, 'https://n')

    // Try to match the pathname of the route to an app route.
    const match = this.match(url.pathname)
    if (!match) return null

    // TODO: patch fetch
    // TODO: ensure to "ensure" that the app custom route page is built, like this.ensureApiPage

    // Load the module for this page.
    const module: AppRouteModule = this.moduleLoader.load(match.filename)

    // Return the built route.
    return { type: RouteType.APP_ROUTE, module, params: match.params }
  }
}
