import path from '../../../shared/lib/isomorphic/path'
import { isAPIRoute } from '../../../lib/is-api-route'
import { PAGES_MANIFEST, SERVER_DIRECTORY } from '../../../shared/lib/constants'
import { normalizePagePath } from '../../../shared/lib/page-path/normalize-page-path'
import { RouteKind } from '../route-kind'
import { PagesAPIRouteMatcher } from '../route-matchers/pages-api-route-matcher'
import { ManifestLoader } from './helpers/manifest-loaders/manifest-loader'
import { RouteMatcherProvider } from './route-matcher-provider'
import { Normalizer } from '../normalizers/normalizer'

export class PagesAPIRouteMatcherProvider
  implements RouteMatcherProvider<PagesAPIRouteMatcher>
{
  constructor(
    private readonly distDir: string,
    private readonly manifestLoader: ManifestLoader,
    private readonly localeNormalizer?: Normalizer
  ) {}

  public async matchers(): Promise<ReadonlyArray<PagesAPIRouteMatcher>> {
    const manifest = this.manifestLoader.load(PAGES_MANIFEST)
    if (!manifest) return []

    // This matcher is only for Pages API routes.
    const pathnames = Object.keys(manifest).filter((pathname) =>
      isAPIRoute(pathname)
    )

    const matchers: Array<PagesAPIRouteMatcher> = []
    for (const page of pathnames) {
      matchers.push(
        new PagesAPIRouteMatcher(
          {
            kind: RouteKind.PAGES_API,
            pathname: page,
            page,
            bundlePath: path.join('pages', normalizePagePath(page)),
            filename: path.join(this.distDir, SERVER_DIRECTORY, manifest[page]),
          },
          this.localeNormalizer
        )
      )
    }

    return matchers
  }
}
