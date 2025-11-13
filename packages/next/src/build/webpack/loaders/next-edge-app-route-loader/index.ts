import { getModuleBuildInfo } from '../get-module-build-info'
import { stringifyRequest } from '../../stringify-request'
import type { webpack } from 'next/dist/compiled/webpack/webpack'
import { WEBPACK_RESOURCE_QUERIES } from '../../../../lib/constants'
import type { ProxyConfig } from '../../../analysis/get-page-static-info'
import { loadEntrypoint } from '../../../load-entrypoint'
import { isMetadataRoute } from '../../../../lib/metadata/is-metadata-route'

export type EdgeAppRouteLoaderQuery = {
  absolutePagePath: string
  page: string
  appDirLoader: string
  preferredRegion: string | string[] | undefined
  nextConfig: string
  middlewareConfig: string
  cacheHandlers: string
}

const EdgeAppRouteLoader: webpack.LoaderDefinitionFunction<EdgeAppRouteLoaderQuery> =
  async function (this) {
    const {
      page,
      absolutePagePath,
      preferredRegion,
      appDirLoader: appDirLoaderBase64 = '',
      middlewareConfig: middlewareConfigBase64 = '',
      nextConfig: nextConfigBase64,
      cacheHandlers: cacheHandlersStringified,
    } = this.getOptions()

    const appDirLoader = Buffer.from(appDirLoaderBase64, 'base64').toString()
    const middlewareConfig: ProxyConfig = JSON.parse(
      Buffer.from(middlewareConfigBase64, 'base64').toString()
    )

    const cacheHandlers = JSON.parse(cacheHandlersStringified || '{}')

    if (!cacheHandlers.default) {
      cacheHandlers.default = require.resolve(
        '../../../../server/lib/cache-handlers/default.external'
      )
    }

    // Ensure we only run this loader for as a module.
    if (!this._module) throw new Error('This loader is only usable as a module')

    const buildInfo = getModuleBuildInfo(this._module)

    buildInfo.nextEdgeSSR = {
      isServerComponent: !isMetadataRoute(page), // Needed for 'use cache'.
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

    const stringifiedConfig = Buffer.from(
      nextConfigBase64 || '',
      'base64'
    ).toString()

    return await loadEntrypoint(
      'edge-app-route',
      {
        VAR_USERLAND: modulePath,
        VAR_PAGE: page,
      },
      {
        nextConfig: stringifiedConfig,
      }
    )
  }

export default EdgeAppRouteLoader
