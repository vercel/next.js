import type {
  Manifest,
  ManifestLoader,
} from './helpers/manifest-loaders/manifest-loader'

import { isAppPageRoute } from '../../../lib/is-app-page-route'
import { APP_PATHS_MANIFEST } from '../../../shared/lib/constants'
import { AppRouteDefinitionBuilder } from './builders/app-route-definition-builder'
import { AppNormalizers } from '../normalizers/built/app'
import { AppPageRouteMatcher } from '../route-matchers/app-page-route-matcher'
import { ManifestRouteMatcherProvider } from './manifest-route-matcher-provider'
import { isAppPageRouteDefinition } from '../route-definitions/app-page-route-definition'

export class AppPageRouteMatcherProvider extends ManifestRouteMatcherProvider<AppPageRouteMatcher> {
  private readonly normalizers: AppNormalizers

  constructor(distDir: string, manifestLoader: ManifestLoader) {
    super(APP_PATHS_MANIFEST, manifestLoader)

    this.normalizers = new AppNormalizers(distDir)
  }

  private prepare(manifest: Manifest) {
    // This matcher only matches app pages.
    const pages = Object.keys(manifest).filter((page) => isAppPageRoute(page))

    // Collect all the app paths for each page. This could include any parallel
    // routes.
    const appRoutes = new AppRouteDefinitionBuilder()
    for (const page of pages) {
      const filename = this.normalizers.filename.normalize(manifest[page])

      // Collect all the app paths for this page. If this is the first time
      // we've seen this page, then add it to the list of route pathnames.
      appRoutes.add(page, filename)
    }

    return appRoutes.toSortedDefinitions().filter(isAppPageRouteDefinition)
  }

  protected async transform(
    manifest: Manifest
  ): Promise<ReadonlyArray<AppPageRouteMatcher>> {
    const matchers: Array<AppPageRouteMatcher> = []
    for (const definition of this.prepare(manifest)) {
      matchers.push(new AppPageRouteMatcher(definition))
    }

    return matchers
  }
}
