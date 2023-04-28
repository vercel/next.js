import type { ModuleLoader } from './module-loader'

import {
  APP_PATH_ROUTES_MANIFEST,
  PAGES_MANIFEST,
  SERVER_DIRECTORY,
} from '../../../../shared/lib/constants'
import path from '../../../../shared/lib/isomorphic/path'
import { RouteModule } from '../../route-modules/route-module'
import { NodeModuleLoader } from './node-module-loader'
import { StaticRouteModuleLoader } from './static-route-module-loader'
import { RouteModuleLoader } from './route-module-loader'

export class ManifestRouteModuleNotFound extends Error {
  public constructor(id: string) {
    super(`Route module "${id}" not found`)
  }
}

type ManifestName = typeof PAGES_MANIFEST | typeof APP_PATH_ROUTES_MANIFEST

export class ManifestRouteModuleLoader {
  public constructor(
    private readonly distDir: string,
    private readonly manifestName: ManifestName,
    private readonly loader: ModuleLoader = new NodeModuleLoader()
  ) {}

  private async find(id: string): Promise<string> {
    // Load the manifest.
    const manifest = this.loader.load(
      path.join(this.distDir, SERVER_DIRECTORY, this.manifestName)
    )

    const file = manifest[id]
    if (!file) {
      throw new ManifestRouteModuleNotFound(id)
    }

    return path.join(this.distDir, SERVER_DIRECTORY, file)
  }

  public static async load<M extends RouteModule = RouteModule>(
    distDir: string,
    manifestName: ManifestName,
    id: string
  ): Promise<M | string> {
    const loader = new ManifestRouteModuleLoader(distDir, manifestName)
    return await loader.load<M>(id)
  }

  public async load<M extends RouteModule = RouteModule>(
    id: string
  ): Promise<M | string> {
    const modulePath = await this.find(id)
    if (modulePath.endsWith('.html')) {
      return await StaticRouteModuleLoader.load(modulePath)
    }

    return RouteModuleLoader.load<M>(modulePath, this.loader)
  }
}
