import { isAPIRoute } from '../../../lib/is-api-route'
import { BLOCKED_PAGES, PAGES_MANIFEST } from '../../../shared/lib/constants'
import { RouteKind } from '../route-kind'
import {
  PagesLocaleRouteMatcher,
  PagesRouteMatcher,
} from '../route-matchers/pages-route-matcher'
import {
  Manifest,
  ManifestLoader,
} from './helpers/manifest-loaders/manifest-loader'
import { ManifestRouteMatcherProvider } from './manifest-route-matcher-provider'
import { I18NProvider } from '../helpers/i18n-provider'
import { PagesNormalizers } from '../normalizers/built/pages'
import { denormalizePagePath } from '../../../shared/lib/page-path/denormalize-page-path'

export class PagesRouteMatcherProvider extends ManifestRouteMatcherProvider<
  PagesRouteMatcher | PagesLocaleRouteMatcher
> {
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
  ): Promise<ReadonlyArray<PagesRouteMatcher | PagesLocaleRouteMatcher>> {
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
      // Sort the pathnames to ensure that the order of the matchers is
      // deterministic.
      .sort()

    // Keep track of all the AMP pages so we can link them to the non-amp
    // pages later.
    const ampPages = new Map<
      string,
      PagesRouteMatcher | PagesLocaleRouteMatcher
    >()

    const matchers: Array<PagesRouteMatcher | PagesLocaleRouteMatcher> = []
    for (const page of pathnames) {
      // In pages, the page is the same as the pathname.
      let pathname = page

      // The page is an AMP page if the page ends with `.amp`.
      const ampPage = page.endsWith('.amp')

      // The user does not access the AMP pages via the `.amp` extension, so
      // remove it from the pathname.
      if (ampPage) {
        pathname = denormalizePagePath(pathname.slice(0, -4))
      }

      let matcher: PagesRouteMatcher | PagesLocaleRouteMatcher
      if (this.i18nProvider) {
        const i18n = this.i18nProvider.analyze(pathname)

        matcher = new PagesLocaleRouteMatcher({
          kind: RouteKind.PAGES,
          pathname: i18n.pathname,
          page,
          bundlePath: this.normalizers.bundlePath.normalize(page),
          filename: this.normalizers.filename.normalize(manifest[page]),
          i18n,
        })
      } else {
        matcher = new PagesRouteMatcher({
          kind: RouteKind.PAGES,
          pathname,
          page,
          bundlePath: this.normalizers.bundlePath.normalize(page),
          filename: this.normalizers.filename.normalize(manifest[page]),
        })
      }

      // If this is an AMP page, then we need to link it to the non-AMP page.
      if (ampPage) {
        ampPages.set(pathname, matcher)
      } else {
        matchers.push(matcher)
      }
    }

    // Attach the AMP pages to the non-AMP pages if they exist.
    for (const matcher of matchers) {
      const amp = ampPages.get(matcher.definition.page)

      // We don't have an AMP page for this page, so skip it.
      if (!amp) continue

      // If the AMP page is not the same type as the non-AMP page, then this is
      // an error!
      if (amp.constructor !== matcher.constructor) {
        throw new Error(
          `Invariant: expected the AMP page '${amp.definition.page}' to be the same type as the non-AMP page '${matcher.definition.page}'`
        )
      }

      // Remove the AMP page from the list of AMP pages so we don't re-add it.
      ampPages.delete(matcher.definition.page)

      // Attach the AMP page definition to the non-AMP page.
      matcher.definition.amp = amp.definition
    }

    // If we haven't attached all the AMP pages, then we have some AMP pages
    // that don't have a non-AMP page, this is an error!
    if (ampPages.size > 0) {
      const orphaned = Array.from(ampPages.keys())
        .sort()
        .map((pathname) => `'${pathname}'`)
        .join(', ')

      throw new Error(
        `Invariant: expected all generated '.amp' pages to have a non-AMP page, but the following AMP pages do not have a non-AMP page: ${orphaned}`
      )
    }

    return matchers
  }
}
