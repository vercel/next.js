import path from 'path'
import fs from 'fs/promises'
import { webpack, sources } from 'next/dist/compiled/webpack/webpack'
import {
  PAGES_MANIFEST,
  APP_PATHS_MANIFEST,
} from '../../../shared/lib/constants'
import getRouteFromEntrypoint from '../../../server/get-route-from-entrypoint'
import { normalizePathSep } from '../../../shared/lib/page-path/normalize-path-sep'

export type PagesManifest = { [page: string]: string }

export let edgeServerPages = {}
export let nodeServerPages = {}
export let edgeServerAppPaths = {}
export let nodeServerAppPaths = {}

// This plugin creates a pages-manifest.json from page entrypoints.
// This is used for mapping paths like `/` to `.next/server/static/<buildid>/pages/index.js` when doing SSR
// It's also used by next export to provide defaultPathMap
export default class PagesManifestPlugin
  implements webpack.WebpackPluginInstance
{
  dev: boolean
  distDir?: string
  isEdgeRuntime: boolean
  appDirEnabled: boolean

  constructor({
    dev,
    distDir,
    isEdgeRuntime,
    appDirEnabled,
  }: {
    dev: boolean
    distDir?: string
    isEdgeRuntime: boolean
    appDirEnabled: boolean
  }) {
    this.dev = dev
    this.distDir = distDir
    this.isEdgeRuntime = isEdgeRuntime
    this.appDirEnabled = appDirEnabled
  }

  async createAssets(compilation: any, assets: any) {
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

    // handle parallel compilers writing to the same
    // manifest path by merging existing manifest with new
    const writeMergedManifest = async (
      manifestPath: string,
      entries: Record<string, string>
    ) => {
      await fs.mkdir(path.dirname(manifestPath), { recursive: true })
      await fs.writeFile(
        manifestPath,
        JSON.stringify(
          {
            ...(await fs
              .readFile(manifestPath, 'utf8')
              .then((res) => JSON.parse(res))
              .catch(() => ({}))),
            ...entries,
          },
          null,
          2
        )
      )
    }

    if (this.distDir) {
      const pagesManifestPath = path.join(
        this.distDir,
        'server',
        PAGES_MANIFEST
      )
      await writeMergedManifest(pagesManifestPath, {
        ...edgeServerPages,
        ...nodeServerPages,
      })
    } else {
      const pagesManifestPath =
        (!this.dev && !this.isEdgeRuntime ? '../' : '') + PAGES_MANIFEST
      assets[pagesManifestPath] = new sources.RawSource(
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

    if (this.appDirEnabled) {
      if (this.distDir) {
        const appPathsManifestPath = path.join(
          this.distDir,
          'server',
          APP_PATHS_MANIFEST
        )
        await writeMergedManifest(appPathsManifestPath, {
          ...edgeServerAppPaths,
          ...nodeServerAppPaths,
        })
      } else {
        assets[
          (!this.dev && !this.isEdgeRuntime ? '../' : '') + APP_PATHS_MANIFEST
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
  }

  apply(compiler: webpack.Compiler): void {
    compiler.hooks.make.tap('NextJsPagesManifest', (compilation) => {
      compilation.hooks.processAssets.tapPromise(
        {
          name: 'NextJsPagesManifest',
          stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
        },
        (assets) => this.createAssets(compilation, assets)
      )
    })
  }
}
