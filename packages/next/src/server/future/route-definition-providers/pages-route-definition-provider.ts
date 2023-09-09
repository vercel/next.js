import type { I18NProvider } from '../helpers/i18n-provider'
import type {
  PagesRouteDefinition,
  PagesLocaleRouteDefinition,
} from '../route-definitions/pages-route-definition'
import type {
  Manifest,
  ManifestLoader,
} from '../helpers/manifest-loaders/manifest-loader'

import { isAPIRoute } from '../../../lib/is-api-route'
import { BLOCKED_PAGES, PAGES_MANIFEST } from '../../../shared/lib/constants'
import { ManifestRouteDefinitionProvider } from './manifest-route-definition-provider'
import { PagesRouteDefinitionBuilder } from '../route-definition-builders/pages-route-definition-builder'
import { PagesFilenameNormalizer } from '../normalizers/built/pages/pages-filename-normalizer'
import { RouteKind } from '../route-kind'

export class PagesRouteDefinitionProvider extends ManifestRouteDefinitionProvider<
  PagesRouteDefinition | PagesLocaleRouteDefinition
> {
  public readonly kind = RouteKind.PAGES
  private readonly normalizer: PagesFilenameNormalizer

  constructor(
    distDir: string,
    manifestLoader: ManifestLoader,
    private readonly i18nProvider: I18NProvider | null
  ) {
    super(PAGES_MANIFEST, manifestLoader)

    this.normalizer = new PagesFilenameNormalizer(distDir)
  }

  protected transform(
    manifest: Manifest
  ): ReadonlyArray<PagesRouteDefinition | PagesLocaleRouteDefinition> {
    const pages = Object.keys(manifest).filter((page) => !isAPIRoute(page))

    const builder = new PagesRouteDefinitionBuilder()
    for (const page of pages) {
      // If enabled, we should analyze the page for locale information.
      const localeInfo = this.i18nProvider?.analyze(page)

      // If the locale information is available, we should use the pathname
      // instead of the page name (which is the pathname as well).
      const pathname = localeInfo?.pathname ?? page

      // Remove any blocked pages (page that can't be routed to, like error or
      // internal pages).
      if (BLOCKED_PAGES.includes(pathname)) continue

      builder.add({
        page,
        filename: this.normalizer.normalize(manifest[page]),
        pathname,
        localeInfo,
      })
    }

    return builder.build()
  }
}
