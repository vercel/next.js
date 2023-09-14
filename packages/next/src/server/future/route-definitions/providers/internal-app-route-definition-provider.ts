import type { AppPathsManifestLoader } from '../helpers/manifest-loaders/manifest-loader'
import type { PagesManifest } from '../../../../build/webpack/plugins/pages-manifest-plugin'
import type { InternalAppRouteDefinition } from '../internal-route-definition'

import { isInternalAppRoute } from '../../../../lib/is-internal-app-route'
import { APP_PATHS_MANIFEST } from '../../../../shared/lib/constants'
import { AppFilenameNormalizer } from '../../normalizers/built/app/app-filename-normalizer'
import { InternalAppRouteDefinitionBuilder } from '../builders/internal-app-route-definition-builder'
import { RouteKind } from '../../route-kind'
import { ManifestRouteDefinitionProvider } from './helpers/manifest-route-definition-provider'

export class InternalAppRouteDefinitionProvider extends ManifestRouteDefinitionProvider<
  InternalAppRouteDefinition,
  typeof APP_PATHS_MANIFEST,
  PagesManifest
> {
  public readonly kind = RouteKind.INTERNAL_APP
  private readonly normalizer: AppFilenameNormalizer

  constructor(distDir: string, manifestLoader: AppPathsManifestLoader) {
    super(APP_PATHS_MANIFEST, manifestLoader)

    this.normalizer = new AppFilenameNormalizer(distDir)
  }

  protected transform(
    manifest: Record<string, string>
  ): ReadonlyArray<InternalAppRouteDefinition> {
    // The manifest consists of a map of all the pages to their bundles. Let's
    // filter out all the pages that are not app pages.
    const pages = Object.keys(manifest).filter((page) =>
      isInternalAppRoute(page)
    )

    const builder = new InternalAppRouteDefinitionBuilder()
    for (const page of pages) {
      const filename = this.normalizer.normalize(manifest[page])

      builder.add({ page, filename, builtIn: false })
    }

    return builder.build()
  }
}
