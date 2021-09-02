import {
  webpack,
  isWebpack5,
  sources,
} from 'next/dist/compiled/webpack/webpack'
import { MIDDLEWARE_MANIFEST } from '../../../shared/lib/constants'
import { getMiddlewareRegex } from '../../../shared/lib/router/utils'
import { getSortedRoutes } from '../../../shared/lib/router/utils'

const MIDDLEWARE_FULL_ROUTE_REGEX = /^pages[/\\]?(.*)\/_middleware$/

export interface MiddlewareManifest {
  version: 1
  sortedMiddleware: string[]
  middleware: {
    [page: string]: {
      files: string[]
      name: string
      page: string
      regexp: string
    }
  }
}

export default class MiddlewareManifestPlugin {
  dev: boolean

  constructor({ dev }: { dev: boolean }) {
    this.dev = dev
  }

  createAssets(compilation: any, assets: any) {
    const entrypoints = compilation.entrypoints
    const middlewareManifest: MiddlewareManifest = {
      sortedMiddleware: [],
      middleware: {},
      version: 1,
    }

    for (const entrypoint of entrypoints.values()) {
      const result = MIDDLEWARE_FULL_ROUTE_REGEX.exec(entrypoint.name)
      const location = result ? `/${result[1]}` : null
      if (!location) {
        continue
      }

      const files = entrypoint
        .getFiles()
        .filter((file: string) => !file.endsWith('.hot-update.js'))

      middlewareManifest.middleware[location] = {
        files,
        name: entrypoint.name,
        page: location,
        regexp: getMiddlewareRegex(location).namedRegex!,
      }
    }

    middlewareManifest.sortedMiddleware = getSortedRoutes(
      Object.keys(middlewareManifest.middleware)
    )

    assets[`server/${MIDDLEWARE_MANIFEST}`] = new sources.RawSource(
      JSON.stringify(middlewareManifest, null, 2)
    )
  }

  apply(compiler: webpack.Compiler) {
    if (isWebpack5) {
      compiler.hooks.make.tap('NextJsMiddlewareManifest', (compilation) => {
        // @ts-ignore TODO: Remove ignore when webpack 5 is stable
        compilation.hooks.processAssets.tap(
          {
            name: 'NextJsMiddlewareManifest',
            // @ts-ignore TODO: Remove ignore when webpack 5 is stable
            stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
          },
          (assets: any) => {
            this.createAssets(compilation, assets)
          }
        )
      })
      return
    }

    compiler.hooks.emit.tap('NextJsMiddlewareManifest', (compilation: any) => {
      this.createAssets(compilation, compilation.assets)
    })
  }
}
