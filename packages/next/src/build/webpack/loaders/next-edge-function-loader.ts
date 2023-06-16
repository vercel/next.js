import type webpack from 'webpack'
import { getModuleBuildInfo } from './get-module-build-info'
import { stringifyRequest } from '../stringify-request'

export type EdgeFunctionLoaderOptions = {
  absolutePagePath: string
  page: string
  rootDir: string
  preferredRegion: string | string[] | undefined
  maxDuration: number | undefined
}

const nextEdgeFunctionLoader: webpack.LoaderDefinitionFunction<EdgeFunctionLoaderOptions> =
  function nextEdgeFunctionLoader(this) {
    const {
      absolutePagePath,
      page,
      rootDir,
      preferredRegion,
      maxDuration,
    }: EdgeFunctionLoaderOptions = this.getOptions()
    const stringifiedPagePath = stringifyRequest(this, absolutePagePath)
    const buildInfo = getModuleBuildInfo(this._module as any)
    buildInfo.route = {
      page: page || '/',
      absolutePagePath,
      preferredRegion,
      maxDuration,
    }
    buildInfo.nextEdgeApiFunction = {
      page: page || '/',
    }
    buildInfo.rootDir = rootDir

    return `
        import 'next/dist/esm/server/web/globals'
        import { adapter } from 'next/dist/esm/server/web/adapter'
        import { IncrementalCache } from 'next/dist/esm/server/lib/incremental-cache'

        import handler from ${stringifiedPagePath}

        if (typeof handler !== 'function') {
          throw new Error('The Edge Function "pages${page}" must export a \`default\` function');
        }

        export default function (opts) {
          return adapter({
              ...opts,
              IncrementalCache,
              page: ${JSON.stringify(page)},
              handler,
          })
        }
    `
  }

export default nextEdgeFunctionLoader
