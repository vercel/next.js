import { webpack, sources } from 'next/dist/compiled/webpack/webpack'
import {
  PAGES_MANIFEST,
  VIEW_PATHS_MANIFEST,
} from '../../../shared/lib/constants'
import getRouteFromEntrypoint from '../../../server/get-route-from-entrypoint'
import { normalizePathSep } from '../../../shared/lib/page-path/normalize-path-sep'

export type PagesManifest = { [page: string]: string }

let edgeServerPages = {}
let nodeServerPages = {}
let edgeServerRootPaths = {}
let nodeServerRootPaths = {}

// This plugin creates a pages-manifest.json from page entrypoints.
// This is used for mapping paths like `/` to `.next/server/static/<buildid>/pages/index.js` when doing SSR
// It's also used by next export to provide defaultPathMap
export default class PagesManifestPlugin implements webpack.Plugin {
  serverless: boolean
  dev: boolean
  isEdgeRuntime: boolean
  rootEnabled: boolean

  constructor({
    serverless,
    dev,
    isEdgeRuntime,
    rootEnabled,
  }: {
    serverless: boolean
    dev: boolean
    isEdgeRuntime: boolean
    rootEnabled: boolean
  }) {
    this.serverless = serverless
    this.dev = dev
    this.isEdgeRuntime = isEdgeRuntime
    this.rootEnabled = rootEnabled
  }

  createAssets(compilation: any, assets: any) {
    const entrypoints = compilation.entrypoints
    const pages: PagesManifest = {}
    const rootPaths: PagesManifest = {}

    for (const entrypoint of entrypoints.values()) {
      const pagePath = getRouteFromEntrypoint(entrypoint.name, this.rootEnabled)

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
      let file = files[files.length - 1]

      if (!this.dev) {
        if (!this.isEdgeRuntime) {
          file = file.slice(3)
        }
      }
      file = normalizePathSep(file)

      if (entrypoint.name.startsWith('views/')) {
        rootPaths[pagePath] = file
      } else {
        pages[pagePath] = file
      }
    }

    // This plugin is used by both the Node server and Edge server compilers,
    // we need to merge both pages to generate the full manifest.
    if (this.isEdgeRuntime) {
      edgeServerPages = pages
      edgeServerRootPaths = rootPaths
    } else {
      nodeServerPages = pages
      nodeServerRootPaths = rootPaths
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

    if (this.rootEnabled) {
      assets[
        `${!this.dev && !this.isEdgeRuntime ? '../' : ''}` + VIEW_PATHS_MANIFEST
      ] = new sources.RawSource(
        JSON.stringify(
          {
            ...edgeServerRootPaths,
            ...nodeServerRootPaths,
          },
          null,
          2
        )
      )
    }
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
