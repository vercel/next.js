import type { ManifestsLoader } from '../../helpers/manifest-loaders/manifest-loader'
import type { I18NProvider } from '../../../helpers/i18n-provider'
import type { RouteDefinitionProvider } from '../../providers/route-definition-provider'
import type { PagesManifest } from '../../../../../build/webpack/plugins/pages-manifest-plugin'
import type { MiddlewareManifest } from '../../../../../build/webpack/plugins/middleware-plugin'
import type {
  APP_PATHS_MANIFEST,
  MIDDLEWARE_MANIFEST,
  PAGES_MANIFEST,
} from '../../../../../shared/lib/constants'

import { AppPageRouteDefinitionProvider } from '../../providers/app-page-route-definition-provider'
import { AppRouteRouteDefinitionProvider } from '../../providers/app-route-route-definition-provider'
import { InternalAppRouteDefinitionProvider } from '../../providers/internal-app-route-definition-provider'
import { InternalPagesRouteDefinitionProvider } from '../../providers/internal-pages-route-definition-provider'
import { PagesAPIRouteDefinitionProvider } from '../../providers/pages-api-route-definition-provider'
import { PagesRouteDefinitionProvider } from '../../providers/pages-route-definition-provider'
import { BaseRouteDefinitionManager } from '../base-route-definition-manager'
import { InternalRootRouteDefinitionProvider } from '../../providers/internal-root-route-definition-provider'
import { BatchedFileReader } from '../../../helpers/file-reader/batched-file-reader'
import { BaseFileReader } from '../../../helpers/file-reader/base-file-reader'

type ManifestLoader = ManifestsLoader<{
  [PAGES_MANIFEST]: PagesManifest
  [APP_PATHS_MANIFEST]: PagesManifest
  [MIDDLEWARE_MANIFEST]: MiddlewareManifest
}>

export class NextRouteDefinitionManagerBuilder {
  public static build(
    distDir: string,
    manifestLoader: ManifestLoader,
    hasAppDir: boolean,
    i18nProvider: I18NProvider | null
  ): BaseRouteDefinitionManager {
    const definitions = new Array<RouteDefinitionProvider>()

    // Add support for internal files in the `pages/` directory.
    definitions.push(
      new InternalPagesRouteDefinitionProvider(
        distDir,
        manifestLoader,
        i18nProvider
      )
    )

    // Add support for pages in the `pages/` directory.
    definitions.push(
      new PagesRouteDefinitionProvider(distDir, manifestLoader, i18nProvider)
    )

    // Add support for API routes in the `pages/api/` directory.
    definitions.push(
      new PagesAPIRouteDefinitionProvider(distDir, manifestLoader)
    )

    // If the app directory is enabled, then add the app matchers.
    if (hasAppDir) {
      definitions.push(
        new InternalAppRouteDefinitionProvider(distDir, manifestLoader)
      )

      // Match app pages under `app/`.
      definitions.push(
        new AppPageRouteDefinitionProvider(distDir, manifestLoader)
      )

      // Match app routes under `app/`.
      definitions.push(
        new AppRouteRouteDefinitionProvider(distDir, manifestLoader)
      )
    }

    const fileReader = BatchedFileReader.findOrCreateShared(
      BaseFileReader.findOrCreateShared()
    )

    definitions.push(
      new InternalRootRouteDefinitionProvider(
        distDir,
        fileReader,
        manifestLoader
      )
    )

    return new BaseRouteDefinitionManager(definitions)
  }
}
