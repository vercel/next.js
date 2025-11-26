import type { RouteModule } from '../../route-modules/route-module'
import type { ModuleLoader } from './module-loader'

import { NodeModuleLoader } from './node-module-loader'

export interface AppLoaderModule<M extends RouteModule = RouteModule> {
  routeModule: M
}

export class RouteModuleLoader {
  static async load<M extends RouteModule>(
    id: string,
    loader: ModuleLoader = new NodeModuleLoader()
  ): Promise<M> {
    const module: AppLoaderModule<M> = await loader.load(id)
    if ('routeModule' in module) {
      return module.routeModule
    }

    throw new Error(`Module "${id}" does not export a routeModule.`)
  }
}
