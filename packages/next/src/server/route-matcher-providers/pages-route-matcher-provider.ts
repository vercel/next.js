import { isAPIRoute } from '../../lib/is-api-route'
import { BLOCKED_PAGES, PAGES_MANIFEST } from '../../shared/lib/constants'
import { RouteKind } from '../route-kind'
import {
  PagesLocaleRouteMatcher,
  PagesRouteMatcher,
} from '../route-matchers/pages-route-matcher'
import type {
  Manifest,
  ManifestLoader,
} from './helpers/manifest-loaders/manifest-loader'
import { ManifestRouteMatcherProvider } from './manifest-route-matcher-provider'
import type { I18NProvider } from '../lib/i18n-provider'
import { PagesNormalizers } from '../normalizers/built/pages'

export class PagesRouteMatcherProvider extends ManifestRouteMatcherProvider<PagesRouteMatcher> {
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
  ): Promise<ReadonlyArray<PagesRouteMatcher>> {
    // This matcher is only for Pages routes, not Pages API routes which are
    // included in this manifest.
    const pathnames = Object.keys(manifest)
      .filter((pathname) => !isAPIRoute(pathname))
      // Remove any blocked pages (page that can't be routed to, like error or
      // internal pages).
      .filter((pathname) => {
        const normalized =
          this.i18nProvider?.analyze(pathname).pathname ?? pathname

        // Skip any blocked pages.
        if (BLOCKED_PAGES.includes(normalized)) return false

        return true
      })

    const matchers: Array<PagesRouteMatcher> = []
    for (const page of pathnames) {
      if (this.i18nProvider) {
        // Match the locale on the page name, or default to the default locale.
        const { detectedLocale, pathname } = this.i18nProvider.analyze(page)

        matchers.push(
          new PagesLocaleRouteMatcher({
            kind: RouteKind.PAGES,
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
          new PagesRouteMatcher({
            kind: RouteKind.PAGES,
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
