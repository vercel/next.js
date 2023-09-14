import type { PagesManifestLoader } from '../helpers/manifest-loaders/manifest-loader'
import type { I18NProvider } from '../../helpers/i18n-provider'
import type { InternalPagesRouteDefinition } from '../internal-route-definition'
import type { PagesManifest } from '../../../../build/webpack/plugins/pages-manifest-plugin'

import { isInternalPagesRoute } from '../../../../lib/is-internal-pages-route'
import { PAGES_MANIFEST } from '../../../../shared/lib/constants'
import { AppFilenameNormalizer } from '../../normalizers/built/app/app-filename-normalizer'
import { InternalPagesRouteDefinitionBuilder } from '../builders/internal-pages-route-definition-builder'
import { RouteKind } from '../../route-kind'
import { ManifestRouteDefinitionProvider } from './helpers/manifest-route-definition-provider'

export class InternalPagesRouteDefinitionProvider extends ManifestRouteDefinitionProvider<
  InternalPagesRouteDefinition,
  typeof PAGES_MANIFEST,
  PagesManifest
> {
  public readonly kind = RouteKind.INTERNAL_PAGES
  private readonly normalizer: AppFilenameNormalizer

  constructor(
    distDir: string,
    manifestLoader: PagesManifestLoader,
    private readonly i18nProvider: I18NProvider | null
  ) {
    super(PAGES_MANIFEST, manifestLoader)

    this.normalizer = new AppFilenameNormalizer(distDir)
  }

  protected transform(
    manifest: Record<string, string>
  ): ReadonlyArray<InternalPagesRouteDefinition> {
    // The manifest consists of a map of all the pages to their bundles. Let's
    // filter out all the pages that are not app pages.
    const pages = Object.keys(manifest).filter((page) => {
      if (!this.i18nProvider) return isInternalPagesRoute(page)

      const localeInfo = this.i18nProvider.analyze(page)

      return isInternalPagesRoute(localeInfo.pathname)
    })

    const builder = new InternalPagesRouteDefinitionBuilder()
    for (const page of pages) {
      const filename = this.normalizer.normalize(manifest[page])
      const localeInfo = this.i18nProvider?.analyze(page)

      builder.add({
        page,
        filename,
        localeInfo: localeInfo?.detectedLocale ? localeInfo : undefined,
        builtIn: false,
      })
    }

    return builder.build()
  }
}
