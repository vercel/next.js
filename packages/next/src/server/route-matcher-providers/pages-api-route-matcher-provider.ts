import { isAPIRoute } from '../../lib/is-api-route'
import { PAGES_MANIFEST } from '../../shared/lib/constants'
import { RouteKind } from '../route-kind'
import {
  PagesAPILocaleRouteMatcher,
  PagesAPIRouteMatcher,
} from '../route-matchers/pages-api-route-matcher'
import type {
  Manifest,
  ManifestLoader,
} from './helpers/manifest-loaders/manifest-loader'
import { ManifestRouteMatcherProvider } from './manifest-route-matcher-provider'
import type { I18NProvider } from '../lib/i18n-provider'
import { PagesNormalizers } from '../normalizers/built/pages'

export class PagesAPIRouteMatcherProvider extends ManifestRouteMatcherProvider<PagesAPIRouteMatcher> {
  private readonly normalizers: PagesNormalizers

  constructor(
    distDir: string,
    manifestLoader: ManifestLoader,
    private readonly i18nProvider?: I18NProvider
  ) {
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
      if (this.i18nProvider) {
        // Match the locale on the page name, or default to the default locale.
        const { detectedLocale, pathname } = this.i18nProvider.analyze(page)

        matchers.push(
          new PagesAPILocaleRouteMatcher({
            kind: RouteKind.PAGES_API,
            pathname,
            page,
            bundlePath: this.normalizers.bundlePath.normalize(page),
            filename: this.normalizers.filename.normalize(manifest[page]),
            i18n: {
              locale: detectedLocale,
            },
          })
        )
      } else {
        matchers.push(
          new PagesAPIRouteMatcher({
            kind: RouteKind.PAGES_API,
            // In `pages/`, the page is the same as the pathname.
            pathname: page,
            page,
            bundlePath: this.normalizers.bundlePath.normalize(page),
            filename: this.normalizers.filename.normalize(manifest[page]),
          })
        )
      }
    }

    return matchers
  }
}
