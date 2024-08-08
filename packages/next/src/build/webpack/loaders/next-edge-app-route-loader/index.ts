import { getModuleBuildInfo } from '../get-module-build-info'
import { stringifyRequest } from '../../stringify-request'
import type { NextConfig } from '../../../../server/config-shared'
import type { webpack } from 'next/dist/compiled/webpack/webpack'
import { WEBPACK_RESOURCE_QUERIES } from '../../../../lib/constants'
import type { MiddlewareConfig } from '../../../analysis/get-page-static-info'
import { loadEntrypoint } from '../../../load-entrypoint'

export type EdgeAppRouteLoaderQuery = {
  absolutePagePath: string
  page: string
  appDirLoader: string
  preferredRegion: string | string[] | undefined
  nextConfigOutput: NextConfig['output']
  middlewareConfig: string
}

const EdgeAppRouteLoader: webpack.LoaderDefinitionFunction<EdgeAppRouteLoaderQuery> =
  async function (this) {
    const {
      page,
      absolutePagePath,
      preferredRegion,
      appDirLoader: appDirLoaderBase64 = '',
      middlewareConfig: middlewareConfigBase64 = '',
    } = this.getOptions()

    const appDirLoader = Buffer.from(appDirLoaderBase64, 'base64').toString()
    const middlewareConfig: MiddlewareConfig = JSON.parse(
      Buffer.from(middlewareConfigBase64, 'base64').toString()
    )

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
      preferredRegion,
      middlewareConfig,
    }

    const stringifiedPagePath = stringifyRequest(this, absolutePagePath)
    const modulePath = `${appDirLoader}${stringifiedPagePath.substring(
      1,
      stringifiedPagePath.length - 1
    )}?${WEBPACK_RESOURCE_QUERIES.edgeSSREntry}`

    return await loadEntrypoint('edge-app-route', {
      VAR_USERLAND: modulePath,
    })
  }

export default EdgeAppRouteLoader
