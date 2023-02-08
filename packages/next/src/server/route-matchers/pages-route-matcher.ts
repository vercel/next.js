import path from 'path'
import { isAPIRoute } from '../../lib/is-api-route'
import { PAGES_MANIFEST, SERVER_DIRECTORY } from '../../shared/lib/constants'
import { normalizePagePath } from '../../shared/lib/page-path/normalize-page-path'
import { ManifestLoader } from '../manifest-loaders/manifest-loader'
import { NodeManifestLoader } from '../manifest-loaders/node-manifest-loader'
import type { Normalizer } from '../normalizers/normalizer'
import { RouteKind } from '../route-kind'
import { RouteDefinition, RouteMatcher } from './route-matcher'

export class PagesRouteMatcher implements RouteMatcher<RouteKind.PAGES> {
  constructor(
    private readonly distDir: string,
    private readonly manifestLoader: ManifestLoader = new NodeManifestLoader(
      distDir
    ),
    private readonly localeNormalizer?: Normalizer
  ) {}

  public async routes(): Promise<
    ReadonlyArray<RouteDefinition<RouteKind.PAGES>>
  > {
    const manifest = await this.manifestLoader.load(PAGES_MANIFEST)

    return (
      Object.keys(manifest)
        // This matcher is only for Pages routes.
        .filter((page) => !isAPIRoute(page))
        // Normalize the routes.
        .reduce<Array<RouteDefinition<RouteKind.PAGES>>>((routes, page) => {
          const pathname = this.localeNormalizer?.normalize(page) ?? page

          // If the route was already added, then don't add it again.
          if (routes.find((r) => r.pathname === pathname)) return routes

          routes.push({
            kind: RouteKind.PAGES,
            pathname,
            filename: path.join(this.distDir, SERVER_DIRECTORY, manifest[page]),
            page,
            bundlePath: path.join('pages', normalizePagePath(page)),
          })

          return routes
        }, [])
    )
  }
}
