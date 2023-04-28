import type { RouteModule } from '../../route-modules/route-module'
import type { AssetBinding } from '../../../../build/webpack/loaders/get-module-build-info'
import type { EdgeFunctionDefinition } from '../../../../build/webpack/plugins/middleware-plugin'

import path from '../../../../shared/lib/isomorphic/path'
import { getRuntimeContext } from '../../../web/sandbox'

export class EdgeModuleLoader {
  public constructor(private readonly distDir: string) {}

  public static async load<M extends RouteModule>(
    distDir: string,
    edgeInfo: EdgeFunctionDefinition
  ): Promise<M> {
    const loader = new EdgeModuleLoader(distDir)
    return await loader.load<M>(edgeInfo)
  }

  public async load<M extends RouteModule>(
    edgeInfo: EdgeFunctionDefinition
  ): Promise<M> {
    const runtime = await getRuntimeContext({
      paths: edgeInfo.files.map((file: string) =>
        path.join(this.distDir, file)
      ),
      env: edgeInfo.env,
      edgeFunctionEntry: {
        ...edgeInfo,
        wasm: (edgeInfo.wasm ?? []).map((binding: AssetBinding) => ({
          ...binding,
          filePath: path.join(this.distDir, binding.filePath),
        })),
      },
      name: edgeInfo.name,
      useCache: true,
      distDir: this.distDir,
    })

    // The runtime context when executed will create this context object with the
    // route marked as an entry. The `routeModule` export is available due to the
    // exported variable from the edge route loader.
    return runtime.context._ENTRIES[`middleware_${edgeInfo.name}`].routeModule
  }
}
