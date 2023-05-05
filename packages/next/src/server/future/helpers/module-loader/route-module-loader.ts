import type { RouteModule } from '../../route-modules/route-module'
import type { ModuleLoader } from './module-loader'

import { NodeModuleLoader } from './node-module-loader'

class ModuleNotFound extends Error {
  public constructor(id: string) {
    super(`Module "${id}" not found`)
  }
}

class RouteModuleMissing extends Error {
  public constructor(id: string, module: object) {
    super(
      `Module "${id}" does not have an exported routeModule, only ${
        Object.keys(module).join(', ') || 'N/A'
      }`
    )
  }
}

interface LoadedRouteModule<M extends RouteModule = RouteModule> {
  routeModule?: M
}

export class RouteModuleLoader {
  public static async load<M extends RouteModule>(
    id: string,
    loader: ModuleLoader = new NodeModuleLoader()
  ): Promise<M> {
    if (process.env.NEXT_RUNTIME !== 'edge') {
      const module: LoadedRouteModule<M> = await loader.load(id)
      if (!module) {
        throw new ModuleNotFound(id)
      } else if (!module.routeModule) {
        throw new RouteModuleMissing(id, module)
      }

      return module.routeModule
    }

    throw new Error('RouteModuleLoader is not supported in edge runtime.')
  }
}
