import path from 'path'
import { isAPIRoute } from '../../lib/is-api-route'
import { PAGES_MANIFEST, SERVER_DIRECTORY } from '../../shared/lib/constants'
import { normalizePageRoute } from '../../shared/lib/page-path/normalize-page-route'
import { Normalizer } from '../normalizers/normalizer'
import { Normalizers } from '../normalizers/normalizers'
import { RouteType } from '../route-matches/route-match'
import { Route, RouteMatcher } from './route-matcher'

export class PagesRouteMatcher implements RouteMatcher<RouteType.PAGES> {
  public readonly normalizer: Normalizer

  constructor(
    private readonly distDir: string,
    private readonly pagesManifest: Record<string, string> = require(path.join(
      distDir,
      SERVER_DIRECTORY,
      PAGES_MANIFEST
    )),
    localeNormalizer?: Normalizer
  ) {
    const normalizers: Normalizer[] = [
      // Normalize based on the page route.
      { normalize: (pathname) => normalizePageRoute(pathname) },
    ]
    // Add locale normalization if configured.
    if (localeNormalizer) normalizers.push(localeNormalizer)

    this.normalizer = new Normalizers(normalizers)
  }

  public routes(): ReadonlyArray<Route<RouteType.PAGES>> {
    return (
      Object.keys(this.pagesManifest)
        // This matcher is only for Pages routes.
        .filter((route) => !isAPIRoute(route))
        // Normalize the routes.
        .reduce<Array<Route<RouteType.PAGES>>>((routes, route) => {
          const pathname = this.normalizer.normalize(route)

          // If the route was already added, then don't add it again.
          if (routes.find((r) => r.pathname === pathname)) return routes

          routes.push({
            type: RouteType.PAGES,
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
