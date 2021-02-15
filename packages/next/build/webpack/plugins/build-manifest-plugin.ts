import devalue from 'next/dist/compiled/devalue'
import {
  webpack,
  isWebpack5,
  sources,
} from 'next/dist/compiled/webpack/webpack'
import {
  BUILD_MANIFEST,
  CLIENT_STATIC_FILES_PATH,
  CLIENT_STATIC_FILES_RUNTIME_MAIN,
  CLIENT_STATIC_FILES_RUNTIME_POLYFILLS,
  CLIENT_STATIC_FILES_RUNTIME_REACT_REFRESH,
  CLIENT_STATIC_FILES_RUNTIME_AMP,
} from '../../../next-server/lib/constants'
import { BuildManifest } from '../../../next-server/server/get-page-files'
import getRouteFromEntrypoint from '../../../next-server/server/get-route-from-entrypoint'
import { ampFirstEntryNamesMap } from './next-drop-client-page-plugin'
import { Rewrite } from '../../../lib/load-custom-routes'
import { getSortedRoutes } from '../../../next-server/lib/router/utils'
import { tracer, traceFn } from '../../tracer'
import { spans } from './profiling-plugin'

type DeepMutable<T> = { -readonly [P in keyof T]: DeepMutable<T[P]> }

export type ClientBuildManifest = Record<string, string[]>

// This function takes the asset map generated in BuildManifestPlugin and creates a
// reduced version to send to the client.
function generateClientManifest(
  compiler: any,
  assetMap: BuildManifest,
  rewrites: Rewrite[]
): string {
  return tracer.withSpan(spans.get(compiler), () => {
    const span = tracer.startSpan('NextJsBuildManifest-generateClientManifest')
    return traceFn(span, () => {
      const clientManifest: ClientBuildManifest = {
        // TODO: update manifest type to include rewrites
        __rewrites: rewrites as any,
      }
      const appDependencies = new Set(assetMap.pages['/_app'])
      const sortedPageKeys = getSortedRoutes(Object.keys(assetMap.pages))

      sortedPageKeys.forEach((page) => {
        const dependencies = assetMap.pages[page]

        if (page === '/_app') return
        // Filter out dependencies in the _app entry, because those will have already
        // been loaded by the client prior to a navigation event
        const filteredDeps = dependencies.filter(
          (dep) => !appDependencies.has(dep)
        )

        // The manifest can omit the page if it has no requirements
        if (filteredDeps.length) {
          clientManifest[page] = filteredDeps
        }
      })
      // provide the sorted pages as an array so we don't rely on the object's keys
      // being in order and we don't slow down look-up time for page assets
      clientManifest.sortedPages = sortedPageKeys

      return devalue(clientManifest)
    })
  })
}

function isJsFile(file: string): boolean {
  // We don't want to include `.hot-update.js` files into the initial page
  return !file.endsWith('.hot-update.js') && file.endsWith('.js')
}

function getFilesArray(files: any) {
  if (!files) {
    return []
  }
  if (isWebpack5) {
    return Array.from(files)
  }

  return files
}

// This plugin creates a build-manifest.json for all assets that are being output
// It has a mapping of "entry" filename to real filename. Because the real filename can be hashed in production
export default class BuildManifestPlugin {
  private buildId: string
  private rewrites: Rewrite[]

  constructor(options: { buildId: string; rewrites: Rewrite[] }) {
    this.buildId = options.buildId

    this.rewrites = options.rewrites.map((r) => {
      const rewrite = { ...r }

      // omit external rewrite destinations since these aren't
      // handled client-side
      if (!rewrite.destination.startsWith('/')) {
        delete (rewrite as any).destination
      }
      return rewrite
    })
  }

  createAssets(compiler: any, compilation: any, assets: any) {
    return tracer.withSpan(spans.get(compiler), () => {
      const span = tracer.startSpan('NextJsBuildManifest-createassets')
      return traceFn(span, () => {
        const namedChunks: Map<string, webpack.compilation.Chunk> =
          compilation.namedChunks
        const assetMap: DeepMutable<BuildManifest> = {
          polyfillFiles: [],
          devFiles: [],
          ampDevFiles: [],
          lowPriorityFiles: [],
          pages: { '/_app': [] },
          ampFirstPages: [],
        }

        const ampFirstEntryNames = ampFirstEntryNamesMap.get(compilation)
        if (ampFirstEntryNames) {
          for (const entryName of ampFirstEntryNames) {
            const pagePath = getRouteFromEntrypoint(entryName)
            if (!pagePath) {
              continue
            }

            assetMap.ampFirstPages.push(pagePath)
          }
        }

        const mainJsChunk = namedChunks.get(CLIENT_STATIC_FILES_RUNTIME_MAIN)

        const mainJsFiles: string[] = getFilesArray(mainJsChunk?.files).filter(
          isJsFile
        )

        const polyfillChunk = namedChunks.get(
          CLIENT_STATIC_FILES_RUNTIME_POLYFILLS
        )

        // Create a separate entry  for polyfills
        assetMap.polyfillFiles = getFilesArray(polyfillChunk?.files).filter(
          isJsFile
        )

        const reactRefreshChunk = namedChunks.get(
          CLIENT_STATIC_FILES_RUNTIME_REACT_REFRESH
        )
        assetMap.devFiles = getFilesArray(reactRefreshChunk?.files).filter(
          isJsFile
        )

        for (const entrypoint of compilation.entrypoints.values()) {
          const isAmpRuntime =
            entrypoint.name === CLIENT_STATIC_FILES_RUNTIME_AMP

          if (isAmpRuntime) {
            for (const file of entrypoint.getFiles()) {
              if (!(isJsFile(file) || file.endsWith('.css'))) {
                continue
              }

              assetMap.ampDevFiles.push(file.replace(/\\/g, '/'))
            }
            continue
          }
          const pagePath = getRouteFromEntrypoint(entrypoint.name)

          if (!pagePath) {
            continue
          }

          const filesForEntry: string[] = []

          // getFiles() - helper function to read the files for an entrypoint from stats object
          for (const file of entrypoint.getFiles()) {
            if (!(isJsFile(file) || file.endsWith('.css'))) {
              continue
            }

            filesForEntry.push(file.replace(/\\/g, '/'))
          }

          assetMap.pages[pagePath] = [...mainJsFiles, ...filesForEntry]
        }

        // Add the runtime build manifest file (generated later in this file)
        // as a dependency for the app. If the flag is false, the file won't be
        // downloaded by the client.
        assetMap.lowPriorityFiles.push(
          `${CLIENT_STATIC_FILES_PATH}/${this.buildId}/_buildManifest.js`
        )

        // Add the runtime ssg manifest file as a lazy-loaded file dependency.
        // We also stub this file out for development mode (when it is not
        // generated).
        const srcEmptySsgManifest = `self.__SSG_MANIFEST=new Set;self.__SSG_MANIFEST_CB&&self.__SSG_MANIFEST_CB()`

        const ssgManifestPath = `${CLIENT_STATIC_FILES_PATH}/${this.buildId}/_ssgManifest.js`
        assetMap.lowPriorityFiles.push(ssgManifestPath)
        assets[ssgManifestPath] = new sources.RawSource(srcEmptySsgManifest)

        assetMap.pages = Object.keys(assetMap.pages)
          .sort()
          // eslint-disable-next-line
          .reduce((a, c) => ((a[c] = assetMap.pages[c]), a), {} as any)

        assets[BUILD_MANIFEST] = new sources.RawSource(
          JSON.stringify(assetMap, null, 2)
        )

        const clientManifestPath = `${CLIENT_STATIC_FILES_PATH}/${this.buildId}/_buildManifest.js`

        assets[clientManifestPath] = new sources.RawSource(
          `self.__BUILD_MANIFEST = ${generateClientManifest(
            compiler,
            assetMap,
            this.rewrites
          )};self.__BUILD_MANIFEST_CB && self.__BUILD_MANIFEST_CB()`
        )

        return assets
      })
    })
  }

  apply(compiler: webpack.Compiler) {
    if (isWebpack5) {
      compiler.hooks.make.tap('NextJsBuildManifest', (compilation) => {
        // @ts-ignore TODO: Remove ignore when webpack 5 is stable
        compilation.hooks.processAssets.tap(
          {
            name: 'NextJsBuildManifest',
            // @ts-ignore TODO: Remove ignore when webpack 5 is stable
            stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
          },
          (assets: any) => {
            this.createAssets(compiler, compilation, assets)
          }
        )
      })
      return
    }

    compiler.hooks.emit.tap('NextJsBuildManifest', (compilation: any) => {
      this.createAssets(compiler, compilation, compilation.assets)
    })
  }
}
