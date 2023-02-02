import path from 'path'
import { isAppPageRoute } from '../../lib/is-app-page-route'
import {
  APP_PATHS_MANIFEST,
  SERVER_DIRECTORY,
} from '../../shared/lib/constants'
import { normalizeAppRoute } from '../../shared/lib/router/utils/app-paths'
import { RouteType } from '../route-matches/route-match'
import { Route, RouteMatcher } from './route-matcher'

export class AppPageRouteMatcher implements RouteMatcher<RouteType.APP_PAGE> {
  constructor(
    private readonly distDir: string,
    private readonly appPathsManifest: Record<
      string,
      string
    > = require(path.join(distDir, SERVER_DIRECTORY, APP_PATHS_MANIFEST))
  ) {}

  public routes(): ReadonlyArray<Route<RouteType.APP_PAGE>> {
    return (
      Object.keys(this.appPathsManifest)
        // This matcher only matches app pages.
        .filter((route) => isAppPageRoute(route))
        // Normalize the routes.
        .reduce<Array<Route<RouteType.APP_PAGE>>>((routes, route) => {
          const pathname = normalizeAppRoute(route)

          // If the route was already added, then don't add it again.
          if (routes.find((r) => r.pathname === pathname)) return routes

          routes.push({
            type: RouteType.APP_PAGE,
            pathname,
            filename: path.join(
              this.distDir,
              SERVER_DIRECTORY,
              this.appPathsManifest[route]
            ),
          })

          return routes
        }, [])
    )
  }
}
