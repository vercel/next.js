import type {
  Manifest,
  ManifestLoader,
} from './helpers/manifest-loaders/manifest-loader'

import { isAPIRoute } from '../../../lib/is-api-route'
import { PAGES_MANIFEST } from '../../../shared/lib/constants'
import { RouteKind } from '../route-kind'
import { PagesAPIRouteMatcher } from '../route-matchers/pages-api-route-matcher'
import { ManifestRouteMatcherProvider } from './manifest-route-matcher-provider'
import { PagesNormalizers } from '../normalizers/built/pages'

export class PagesAPIRouteMatcherProvider extends ManifestRouteMatcherProvider<PagesAPIRouteMatcher> {
  private readonly normalizers: PagesNormalizers

  constructor(distDir: string, manifestLoader: ManifestLoader) {
    super(PAGES_MANIFEST, manifestLoader)

    this.normalizers = new PagesNormalizers(distDir)
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
        new PagesAPIRouteMatcher({
          kind: RouteKind.PAGES_API,
          pathname: page,
          page,
          bundlePath: this.normalizers.bundlePath.normalize(page),
          filename: this.normalizers.filename.normalize(manifest[page]),
        })
      )
    }

    return matchers
  }
}
