import type webpack from 'webpack'
import { getModuleBuildInfo } from './get-module-build-info'
import { stringifyRequest } from '../stringify-request'
import type { ProxyConfig } from '../../analysis/get-page-static-info'

export type EdgeFunctionLoaderOptions = {
  absolutePagePath: string
  page: string
  rootDir: string
  preferredRegion: string | string[] | undefined
  middlewareConfig: string
}

const nextEdgeFunctionLoader: webpack.LoaderDefinitionFunction<EdgeFunctionLoaderOptions> =
  function nextEdgeFunctionLoader(this) {
    const {
      absolutePagePath,
      page,
      rootDir,
      preferredRegion,
      middlewareConfig: middlewareConfigBase64,
    }: EdgeFunctionLoaderOptions = this.getOptions()
    const stringifiedPagePath = stringifyRequest(this, absolutePagePath)
    const buildInfo = getModuleBuildInfo(this._module as any)
    const middlewareConfig: ProxyConfig = JSON.parse(
      Buffer.from(middlewareConfigBase64, 'base64').toString()
    )
    buildInfo.route = {
      page: page || '/',
      absolutePagePath,
      preferredRegion,
      middlewareConfig,
    }
    buildInfo.nextEdgeApiFunction = {
      page: page || '/',
    }
    buildInfo.rootDir = rootDir

    return `
        import 'next/dist/esm/server/web/globals'
        import { adapter } from 'next/dist/esm/server/web/adapter'
        import { IncrementalCache } from 'next/dist/esm/server/lib/incremental-cache'
        import { wrapApiHandler } from 'next/dist/esm/server/api-utils'

        import handler from ${stringifiedPagePath}

        if (typeof handler !== 'function') {
          throw new Error('The Edge Function "pages${page}" must export a \`default\` function');
        }

        export default function nHandler (opts) {
          return adapter({
              ...opts,
              IncrementalCache,
              page: ${JSON.stringify(page)},
              handler: wrapApiHandler(${JSON.stringify(page)}, handler),
          })
        }
    `
  }

export default nextEdgeFunctionLoader
