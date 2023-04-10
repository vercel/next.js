import { getModuleBuildInfo } from '../get-module-build-info'
import { stringifyRequest } from '../../stringify-request'
import { NextConfig } from '../../../../server/config-shared'
import { webpack } from 'next/dist/compiled/webpack/webpack'

export type EdgeAppRouteLoaderQuery = {
  absolutePagePath: string
  page: string
  appDirLoader: string
  nextConfigOutput: NextConfig['output']
}

const EdgeAppRouteLoader: webpack.LoaderDefinitionFunction<EdgeAppRouteLoaderQuery> =
  async function (this) {
    const {
      page,
      absolutePagePath,
      appDirLoader: appDirLoaderBase64 = '',
    } = this.getOptions()

    const appDirLoader = Buffer.from(appDirLoaderBase64, 'base64').toString()

    // Ensure we only run this loader for as a module.
    if (!this._module) throw new Error('This loader is only usable as a module')

    const buildInfo = getModuleBuildInfo(this._module)

    buildInfo.nextEdgeSSR = {
      isServerComponent: false,
      page: page,
      isAppDir: true,
    }
    buildInfo.route = {
      page,
      absolutePagePath,
    }

    const stringifiedPagePath = stringifyRequest(this, absolutePagePath)
    const modulePath = `${appDirLoader}${stringifiedPagePath.substring(
      1,
      stringifiedPagePath.length - 1
    )}?__edge_ssr_entry__`

    return `
    import { EdgeRouteModuleWrapper } from 'next/dist/esm/server/web/edge-route-module-wrapper'
    import * as module from ${JSON.stringify(modulePath)}

    export const ComponentMod = module

    export default EdgeRouteModuleWrapper.wrap(module.routeModule)`
  }

export default EdgeAppRouteLoader
