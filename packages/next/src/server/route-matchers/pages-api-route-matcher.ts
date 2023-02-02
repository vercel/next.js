import path from 'path'
import { isAPIRoute } from '../../lib/is-api-route'
import { PAGES_MANIFEST, SERVER_DIRECTORY } from '../../shared/lib/constants'
import { normalizePageRoute } from '../../shared/lib/page-path/normalize-page-route'
import { RouteType } from '../route-matches/route-match'
import { Route, RouteMatcher } from './route-matcher'

export class PagesAPIRouteMatcher implements RouteMatcher<RouteType.PAGES_API> {
  constructor(
    private readonly distDir: string,
    private readonly pagesManifest: Record<string, string> = require(path.join(
      distDir,
      SERVER_DIRECTORY,
      PAGES_MANIFEST
    ))
  ) {}

  public routes(): ReadonlyArray<Route<RouteType.PAGES_API>> {
    return (
      Object.keys(this.pagesManifest)
        // This matcher is only for Pages API routes.
        .filter((route) => isAPIRoute(route))
        // Normalize the routes.
        .reduce<Array<Route<RouteType.PAGES_API>>>((routes, route) => {
          const pathname = normalizePageRoute(route)

          // If the route was already added, then don't add it again.
          if (routes.find((r) => r.pathname === pathname)) return routes

          routes.push({
            type: RouteType.PAGES_API,
            pathname,
            filename: path.join(
              this.distDir,
              SERVER_DIRECTORY,
              this.pagesManifest[route]
            ),
          })

          return routes
        }, [])
    )
  }
}
