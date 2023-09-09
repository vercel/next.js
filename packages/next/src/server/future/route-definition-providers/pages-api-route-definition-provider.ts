import type {
  Manifest,
  ManifestLoader,
} from '../helpers/manifest-loaders/manifest-loader'
import type { PagesAPIRouteDefinition } from '../route-definitions/pages-api-route-definition'

import { isAPIRoute } from '../../../lib/is-api-route'
import { PAGES_MANIFEST } from '../../../shared/lib/constants'
import { ManifestRouteDefinitionProvider } from './manifest-route-definition-provider'
import { PagesFilenameNormalizer } from '../normalizers/built/pages/pages-filename-normalizer'
import { PagesAPIRouteDefinitionBuilder } from '../route-definition-builders/pages-api-route-definition-builder'
import { RouteKind } from '../route-kind'

export class PagesAPIRouteDefinitionProvider extends ManifestRouteDefinitionProvider<PagesAPIRouteDefinition> {
  public readonly kind = RouteKind.PAGES_API
  private readonly normalizer: PagesFilenameNormalizer

  constructor(distDir: string, manifestLoader: ManifestLoader) {
    super(PAGES_MANIFEST, manifestLoader)

    this.normalizer = new PagesFilenameNormalizer(distDir)
  }

  protected transform(
    manifest: Manifest
  ): ReadonlyArray<PagesAPIRouteDefinition> {
    // The manifest consists of a map of all the pages to their bundles. Let's
    // filter out all the pages that are API pages.
    const pages = Object.keys(manifest).filter((page) => isAPIRoute(page))

    const builder = new PagesAPIRouteDefinitionBuilder()
    for (const page of pages) {
      const filename = this.normalizer.normalize(manifest[page])

      builder.add({ page, filename })
    }

    return builder.build()
  }
}
