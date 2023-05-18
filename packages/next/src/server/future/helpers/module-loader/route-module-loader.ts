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
    if (process.env.NEXT_RUNTIME !== 'edge') {
      const { routeModule }: AppLoaderModule<M> = await loader.load(id)

      return routeModule
    }

    throw new Error('RouteModuleLoader is not supported in edge runtime.')
  }
}
