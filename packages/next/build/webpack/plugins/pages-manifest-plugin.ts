import { webpack, sources } from 'next/dist/compiled/webpack/webpack'
import { PAGES_MANIFEST } from '../../../shared/lib/constants'
import getRouteFromEntrypoint from '../../../server/get-route-from-entrypoint'

export type PagesManifest = { [page: string]: string }

let edgeServerPages = {}
let nodeServerPages = {}

// This plugin creates a pages-manifest.json from page entrypoints.
// This is used for mapping paths like `/` to `.next/server/static/<buildid>/pages/index.js` when doing SSR
// It's also used by next export to provide defaultPathMap
export default class PagesManifestPlugin implements webpack.Plugin {
  serverless: boolean
  dev: boolean
  isEdgeRuntime: boolean

  constructor({
    serverless,
    dev,
    isEdgeRuntime,
  }: {
    serverless: boolean
    dev: boolean
    isEdgeRuntime: boolean
  }) {
    this.serverless = serverless
    this.dev = dev
    this.isEdgeRuntime = isEdgeRuntime
  }

  createAssets(compilation: any, assets: any) {
    const entrypoints = compilation.entrypoints
    const pages: PagesManifest = {}

    for (const entrypoint of entrypoints.values()) {
      const pagePath = getRouteFromEntrypoint(entrypoint.name)

      if (!pagePath) {
        continue
      }

      const files = entrypoint
        .getFiles()
        .filter(
          (file: string) =>
            !file.includes('webpack-runtime') &&
            !file.includes('webpack-api-runtime') &&
            file.endsWith('.js')
        )

      // Skip _app.server entry which is empty
      if (!files.length) {
        continue
      }
      // Write filename, replace any backslashes in path (on windows) with forwardslashes for cross-platform consistency.
      pages[pagePath] = files[files.length - 1]

      if (!this.dev) {
        if (!this.isEdgeRuntime) {
          pages[pagePath] = pages[pagePath].slice(3)
        }
      }
      pages[pagePath] = pages[pagePath].replace(/\\/g, '/')
    }

    // This plugin is used by both the Node server and Edge server compilers,
    // we need to merge both pages to generate the full manifest.
    if (this.isEdgeRuntime) {
      edgeServerPages = pages
    } else {
      nodeServerPages = pages
    }

    assets[
      `${!this.dev && !this.isEdgeRuntime ? '../' : ''}` + PAGES_MANIFEST
    ] = new sources.RawSource(
      JSON.stringify(
        {
          ...edgeServerPages,
          ...nodeServerPages,
        },
        null,
        2
      )
    )
  }

  apply(compiler: webpack.Compiler): void {
    compiler.hooks.make.tap('NextJsPagesManifest', (compilation) => {
      // @ts-ignore TODO: Remove ignore when webpack 5 is stable
      compilation.hooks.processAssets.tap(
        {
          name: 'NextJsPagesManifest',
          // @ts-ignore TODO: Remove ignore when webpack 5 is stable
          stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
        },
        (assets: any) => {
          this.createAssets(compilation, assets)
        }
      )
    })
  }
}
