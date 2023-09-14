import type { RouteDefinitionProvider } from '../../providers/route-definition-provider'
import type { I18NProvider } from '../../../helpers/i18n-provider'
import type { FileReader } from '../../../helpers/file-reader/file-reader'

import { DevAppPageRouteDefinitionProvider } from '../../providers/dev/dev-app-page-route-definition-provider'
import { DevAppRouteRouteDefinitionProvider } from '../../providers/dev/dev-app-route-route-definition-provider'
import {
  DevInternalBuiltInPagesRouteDefinitionProvider,
  DevInternalPagesRouteDefinitionProvider,
} from '../../providers/dev/dev-internal-pages-route-definition-provider'
import { DevPagesAPIRouteDefinitionProvider } from '../../providers/dev/dev-pages-api-route-definition-provider'
import { DevPagesRouteDefinitionProvider } from '../../providers/dev/dev-pages-route-definition-provider'
import { BaseRouteDefinitionManager } from '../base-route-definition-manager'
import { RouteDefinitionManager } from '../route-definition-manager'
import { BaseFileReader } from '../../../helpers/file-reader/base-file-reader'
import { BatchedFileReader } from '../../../helpers/file-reader/batched-file-reader'
import { DevInternalAppRouteDefinitionProvider } from '../../providers/dev/dev-internal-app-route-definition-provider'
import { DevMultiInternalRootRouteDefinitionProvider } from '../../providers/dev/dev-internal-root-route-definition-provider'
import { findPagesDir } from '../../../../../lib/find-pages-dir'

export class NextDevRouteDefinitionManagerBuilder {
  public static build(
    dir: string,
    pageExtensions: ReadonlyArray<string>,
    i18nProvider: I18NProvider | null
  ): RouteDefinitionManager {
    // Check the directory locations.
    const { pagesDir, appDir } = findPagesDir(dir)

    // Create a batched file reader to optimize disk reads.
    const fileReader: FileReader = BatchedFileReader.findOrCreateShared(
      BaseFileReader.findOrCreateShared()
    )

    const providers: RouteDefinitionProvider[] = []

    if (pagesDir) {
      // Add support for internal pages in the `pages/` directory.
      providers.push(
        new DevInternalPagesRouteDefinitionProvider(
          pagesDir,
          pageExtensions,
          fileReader
        )
      )

      // Add support for pages in the `pages/` directory.
      providers.push(
        new DevPagesRouteDefinitionProvider(
          pagesDir,
          pageExtensions,
          fileReader,
          i18nProvider
        )
      )

      // Add support for API routes in the `pages/api/` directory.
      providers.push(
        new DevPagesAPIRouteDefinitionProvider(
          pagesDir,
          pageExtensions,
          fileReader
        )
      )
    } else {
      // As the pages directory is not defined, we should still add support for
      // the built-in internal pages.
      providers.push(new DevInternalBuiltInPagesRouteDefinitionProvider())
    }

    if (appDir) {
      // Add support for internal pages in the `app/` directory.
      providers.push(
        new DevInternalAppRouteDefinitionProvider(
          appDir,
          pageExtensions,
          fileReader
        )
      )

      // Match app pages under `app/`.
      providers.push(
        new DevAppPageRouteDefinitionProvider(
          appDir,
          pageExtensions,
          fileReader
        )
      )

      // Match app routes under `app/`.
      providers.push(
        new DevAppRouteRouteDefinitionProvider(
          appDir,
          pageExtensions,
          fileReader
        )
      )
    }

    providers.push(
      new DevMultiInternalRootRouteDefinitionProvider(
        dir,
        pageExtensions,
        fileReader
      )
    )

    return new BaseRouteDefinitionManager(providers)
  }
}
