import type { webpack } from 'next/dist/compiled/webpack/webpack'

import { getModuleBuildInfo } from './get-module-build-info'
import { stringifyRequest } from '../stringify-request'
import { stringify } from 'querystring'
import { EdgeRouteModuleWrapOptions } from '../../../server/web/edge-route-module-wrapper'

type EdgeRouteLoaderQuery = {
  absolutePagePath: string
  page: string
  appDirLoader: string
  preferredRegion: string | string[] | undefined
  pagesType: 'app' | 'pages'
}

export function getEdgeRouteLoader(options: EdgeRouteLoaderQuery): string {
  return `next-edge-route-loader?${stringify(options)}!`
}

const EdgeRouteLoader: webpack.LoaderDefinitionFunction<EdgeRouteLoaderQuery> =
  async function (this) {
    const {
      page,
      absolutePagePath,
      preferredRegion,
      appDirLoader: appDirLoaderBase64 = '',
      pagesType,
    } = this.getOptions()

    const appDirLoader = Buffer.from(appDirLoaderBase64, 'base64').toString()

    // Ensure we only run this loader for as a module.
    if (!this._module) throw new Error('This loader is only usable as a module')

    const buildInfo = getModuleBuildInfo(this._module)

    buildInfo.nextEdgeSSR = {
      isServerComponent: false,
      page: page,
      isAppDir: pagesType === 'app',
    }
    buildInfo.route = {
      page,
      absolutePagePath,
      preferredRegion,
    }

    const stringifiedPagePath = stringifyRequest(this, absolutePagePath)
    const modulePath = `${appDirLoader}${stringifiedPagePath.substring(
      1,
      stringifiedPagePath.length - 1
    )}?__edge_ssr_entry__`

    const options: EdgeRouteModuleWrapOptions = {
      page,
    }

    return `
    import { EdgeRouteModuleWrapper } from 'next/dist/esm/server/web/edge-route-module-wrapper'
    import * as module from ${JSON.stringify(modulePath)}

    export const ComponentMod = module
    export const routeModule = module.routeModule

    export default EdgeRouteModuleWrapper.wrap(
      module.routeModule,
      ${JSON.stringify(options)},
    )`
  }

export default EdgeRouteLoader
