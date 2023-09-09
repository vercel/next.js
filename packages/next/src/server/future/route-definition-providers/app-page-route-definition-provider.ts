import type {
  Manifest,
  ManifestLoader,
} from '../helpers/manifest-loaders/manifest-loader'
import type { AppPageRouteDefinition } from '../route-definitions/app-page-route-definition'

import { isAppPageRoute } from '../../../lib/is-app-page-route'
import { AppPageRouteDefinitionBuilder } from '../route-definition-builders/app-page-route-definition-builder'
import { ManifestRouteDefinitionProvider } from './manifest-route-definition-provider'
import { AppFilenameNormalizer } from '../normalizers/built/app/app-filename-normalizer'
import { APP_PATHS_MANIFEST } from '../../../shared/lib/constants'
import { RouteKind } from '../route-kind'

export class AppPageRouteDefinitionProvider extends ManifestRouteDefinitionProvider<AppPageRouteDefinition> {
  public readonly kind = RouteKind.APP_PAGE
  private readonly normalizer: AppFilenameNormalizer

  constructor(distDir: string, manifestLoader: ManifestLoader) {
    super(APP_PATHS_MANIFEST, manifestLoader)

    this.normalizer = new AppFilenameNormalizer(distDir)
  }

  protected transform(
    manifest: Manifest
  ): ReadonlyArray<AppPageRouteDefinition> {
    // The manifest consists of a map of all the pages to their bundles. Let's
    // filter out all the pages that are not app pages.
    const pages = Object.keys(manifest).filter((page) => isAppPageRoute(page))

    const builder = new AppPageRouteDefinitionBuilder()
    for (const page of pages) {
      const filename = this.normalizer.normalize(manifest[page])

      builder.add({ page, filename })
    }

    return builder.build()
  }
}
