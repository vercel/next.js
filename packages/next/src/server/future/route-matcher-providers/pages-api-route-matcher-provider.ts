import path from '../../../shared/lib/isomorphic/path'
import { isAPIRoute } from '../../../lib/is-api-route'
import { PAGES_MANIFEST, SERVER_DIRECTORY } from '../../../shared/lib/constants'
import { normalizePagePath } from '../../../shared/lib/page-path/normalize-page-path'
import { RouteKind } from '../route-kind'
import { PagesAPIRouteMatcher } from '../route-matchers/pages-api-route-matcher'
import {
  Manifest,
  ManifestLoader,
} from './helpers/manifest-loaders/manifest-loader'
import { Normalizer } from '../normalizers/normalizer'
import { ManifestRouteMatcherProvider } from './manifest-route-matcher-provider'

export class PagesAPIRouteMatcherProvider extends ManifestRouteMatcherProvider<PagesAPIRouteMatcher> {
  constructor(
    private readonly distDir: string,
    manifestLoader: ManifestLoader,
    private readonly localeNormalizer?: Normalizer
  ) {
    super(PAGES_MANIFEST, manifestLoader)
  }

  protected async transform(
    manifest: Manifest
  ): Promise<ReadonlyArray<PagesAPIRouteMatcher>> {
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
