import type { AppPathsManifestLoader } from '../helpers/manifest-loaders/manifest-loader'
import type { AppPageRouteDefinition } from '../app-page-route-definition'
import type { PagesManifest } from '../../../../build/webpack/plugins/pages-manifest-plugin'

import { isAppPageRoute } from '../../../../lib/is-app-page-route'
import { AppPageRouteDefinitionBuilder } from '../builders/app-page-route-definition-builder'
import { ManifestRouteDefinitionProvider } from './helpers/manifest-route-definition-provider'
import { AppFilenameNormalizer } from '../../normalizers/built/app/app-filename-normalizer'
import { APP_PATHS_MANIFEST } from '../../../../shared/lib/constants'
import { RouteKind } from '../../route-kind'

export class AppPageRouteDefinitionProvider extends ManifestRouteDefinitionProvider<
  AppPageRouteDefinition,
  typeof APP_PATHS_MANIFEST,
  PagesManifest
> {
  public readonly kind = RouteKind.APP_PAGE
  private readonly normalizer: AppFilenameNormalizer

  constructor(distDir: string, manifestLoader: AppPathsManifestLoader) {
    super(APP_PATHS_MANIFEST, manifestLoader)

    this.normalizer = new AppFilenameNormalizer(distDir)
  }

  protected transform(
    manifest: PagesManifest
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
