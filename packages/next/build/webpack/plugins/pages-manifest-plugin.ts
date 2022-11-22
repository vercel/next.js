import { webpack, sources } from 'next/dist/compiled/webpack/webpack'
import {
  PAGES_MANIFEST,
  APP_PATHS_MANIFEST,
} from '../../../shared/lib/constants'
import getRouteFromEntrypoint from '../../../server/get-route-from-entrypoint'
import { normalizePathSep } from '../../../shared/lib/page-path/normalize-path-sep'

export type PagesManifest = { [page: string]: string }

let edgeServerPages = {}
let nodeServerPages = {}
let edgeServerAppPaths = {}
let nodeServerAppPaths = {}

// This plugin creates a pages-manifest.json from page entrypoints.
// This is used for mapping paths like `/` to `.next/server/static/<buildid>/pages/index.js` when doing SSR
// It's also used by next export to provide defaultPathMap
export default class PagesManifestPlugin
  implements webpack.WebpackPluginInstance
{
  dev: boolean
  isEdgeRuntime: boolean
  appDirEnabled: boolean

  constructor({
    dev,
    isEdgeRuntime,
    appDirEnabled,
  }: {
    dev: boolean
    isEdgeRuntime: boolean
    appDirEnabled: boolean
  }) {
    this.dev = dev
    this.isEdgeRuntime = isEdgeRuntime
    this.appDirEnabled = appDirEnabled
  }

  createAssets(compilation: any, assets: any) {
    const entrypoints = compilation.entrypoints
    const pages: PagesManifest = {}
    const appPaths: PagesManifest = {}

    for (const entrypoint of entrypoints.values()) {
      const pagePath = getRouteFromEntrypoint(
        entrypoint.name,
        this.appDirEnabled
      )

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

      // Skip entries which are empty
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

      if (entrypoint.name.startsWith('app/')) {
        appPaths[pagePath] = file
      } else {
        pages[pagePath] = file
      }
    }

    // This plugin is used by both the Node server and Edge server compilers,
    // we need to merge both pages to generate the full manifest.
    if (this.isEdgeRuntime) {
      edgeServerPages = pages
      edgeServerAppPaths = appPaths
    } else {
      nodeServerPages = pages
      nodeServerAppPaths = appPaths
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

    if (this.appDirEnabled) {
      assets[
        `${!this.dev && !this.isEdgeRuntime ? '../' : ''}` + APP_PATHS_MANIFEST
      ] = new sources.RawSource(
        JSON.stringify(
          {
            ...edgeServerAppPaths,
            ...nodeServerAppPaths,
          },
          null,
          2
        )
      )
    }
  }

  apply(compiler: webpack.Compiler): void {
    compiler.hooks.make.tap('NextJsPagesManifest', (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: 'NextJsPagesManifest',
          stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
        },
        (assets: any) => {
          this.createAssets(compilation, assets)
        }
      )
    })
  }
}
