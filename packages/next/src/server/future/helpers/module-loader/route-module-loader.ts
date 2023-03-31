import type { RouteModule } from '../../route-modules/route-module'
import type { ModuleLoader } from './module-loader'

import { NodeModuleLoader } from './node-module-loader'

export interface AppLoaderModule<M extends RouteModule = RouteModule> {
  routeModule: M
}

export class RouteModuleLoader {
  static load<M extends RouteModule>(
    id: string,
    loader: ModuleLoader = new NodeModuleLoader()
  ): M {
    if (process.env.NEXT_RUNTIME !== 'edge') {
      const { routeModule }: AppLoaderModule<M> = loader.load(id)

      return routeModule
    }

    throw new Error('RouteModuleLoader is not supported in edge runtime.')
  }
}
