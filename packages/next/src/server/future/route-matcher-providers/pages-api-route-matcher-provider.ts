import path from '../../../shared/lib/isomorphic/path'
import { isAPIRoute } from '../../../lib/is-api-route'
import { PAGES_MANIFEST, SERVER_DIRECTORY } from '../../../shared/lib/constants'
import { normalizePagePath } from '../../../shared/lib/page-path/normalize-page-path'
import { RouteKind } from '../route-kind'
import { PagesAPIRouteMatcher } from '../route-matchers/pages-api-route-matcher'
import { ManifestLoader } from './helpers/manifest-loaders/manifest-loader'
import { RouteMatcherProvider } from './route-matcher-provider'

export class PagesAPIRouteMatcherProvider
  implements RouteMatcherProvider<PagesAPIRouteMatcher>
{
  constructor(
    private readonly distDir: string,
    private readonly manifestLoader: ManifestLoader
  ) {}

  public async matchers(): Promise<ReadonlyArray<PagesAPIRouteMatcher>> {
    const manifest = this.manifestLoader.load(PAGES_MANIFEST)
    if (!manifest) return []

    return (
      Object.keys(manifest)
        // This matcher is only for Pages API routes.
        .filter((page) => isAPIRoute(page))
        // Normalize the routes.
        .reduce<Array<PagesAPIRouteMatcher>>((matchers, page) => {
          matchers.push(
            new PagesAPIRouteMatcher({
              kind: RouteKind.PAGES_API,
              pathname: page,
              page,
              bundlePath: path.join('pages', normalizePagePath(page)),
              filename: path.join(
                this.distDir,
                SERVER_DIRECTORY,
                manifest[page]
              ),
            })
          )

          return matchers
        }, [])
    )
  }
}
