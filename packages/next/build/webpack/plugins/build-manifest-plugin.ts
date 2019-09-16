import devalue from 'devalue'
import {
  BUILD_MANIFEST,
  CLIENT_STATIC_FILES_PATH,
  CLIENT_STATIC_FILES_RUNTIME_MAIN,
  IS_BUNDLED_PAGE_REGEX,
  ROUTE_NAME_REGEX,
} from '../../../next-server/lib/constants'
import { Compiler } from 'webpack'
import { RawSource } from 'webpack-sources'

interface AssetMap {
  devFiles: string[]
  pages: {
    '/_app': string[]
    [s: string]: string[]
  }
}

// This function takes the asset map generated in BuildManifestPlugin and creates a
// reduced version to send to the client.
const generateClientManifest = (
  assetMap: AssetMap,
  isModern: boolean
): string => {
  const clientManifest: { [s: string]: string[] } = {}
  const appDependencies = new Set(assetMap.pages['/_app'])

  Object.entries(assetMap.pages).forEach(([page, dependencies]) => {
    if (page === '/_app') return
    // Filter out dependencies in the _app entry, because those will have already
    // been loaded by the client prior to a navigation event
    const filteredDeps = dependencies.filter(
      dep => !appDependencies.has(dep) && /\.module\.js$/.test(dep) === isModern
    )

    // The manifest can omit the page if it has no requirements
    if (filteredDeps.length) {
      clientManifest[page] = filteredDeps
    }
  })
  return devalue(clientManifest)
}

// This plugin creates a build-manifest.json for all assets that are being output
// It has a mapping of "entry" filename to real filename. Because the real filename can be hashed in production
export default class BuildManifestPlugin {
  private buildId: string
  private clientManifest: boolean
  private modern: boolean

  constructor(options: {
    buildId: string
    clientManifest: boolean
    modern: boolean
  }) {
    this.buildId = options.buildId
    this.clientManifest = options.clientManifest
    this.modern = options.modern
  }

  apply(compiler: Compiler) {
    compiler.hooks.emit.tapAsync(
      'NextJsBuildManifest',
      (compilation, callback) => {
        const { chunks } = compilation
        const assetMap: AssetMap = { devFiles: [], pages: { '/_app': [] } }

        const mainJsChunk = chunks.find(
          c => c.name === CLIENT_STATIC_FILES_RUNTIME_MAIN
        )
        const mainJsFiles: string[] =
          mainJsChunk && mainJsChunk.files.length > 0
            ? mainJsChunk.files.filter((file: string) => /\.js$/.test(file))
            : []

        for (const filePath of Object.keys(compilation.assets)) {
          const path = filePath.replace(/\\/g, '/')
          if (/^static\/development\/dll\//.test(path)) {
            assetMap.devFiles.push(path)
          }
        }

        // compilation.entrypoints is a Map object, so iterating over it 0 is the key and 1 is the value
        for (const [, entrypoint] of compilation.entrypoints.entries()) {
          const result = ROUTE_NAME_REGEX.exec(entrypoint.name)
          if (!result) {
            continue
          }

          const pagePath = result[1]

          if (!pagePath) {
            continue
          }

          const filesForEntry: string[] = []
          for (const chunk of entrypoint.chunks) {
            // If there's no name or no files
            if (!chunk.name || !chunk.files) {
              continue
            }

            for (const file of chunk.files) {
              if (/\.map$/.test(file) || /\.hot-update\.js$/.test(file)) {
                continue
              }

              // Only `.js` and `.css` files are added for now. In the future we can also handle other file types.
              if (!/\.js$/.test(file) && !/\.css$/.test(file)) {
                continue
              }

              // The page bundles are manually added to _document.js as they need extra properties
              if (IS_BUNDLED_PAGE_REGEX.exec(file)) {
                continue
              }

              filesForEntry.push(file.replace(/\\/g, '/'))
            }
          }

          assetMap.pages[`/${pagePath.replace(/\\/g, '/')}`] = [
            ...filesForEntry,
            ...mainJsFiles,
          ]
        }

        if (typeof assetMap.pages['/index'] !== 'undefined') {
          assetMap.pages['/'] = assetMap.pages['/index']
        }

        // Add the runtime build manifest file (generated later in this file)
        // as a dependency for the app. If the flag is false, the file won't be
        // downloaded by the client.
        if (this.clientManifest) {
          assetMap.pages['/_app'].push(
            `${CLIENT_STATIC_FILES_PATH}/${this.buildId}/_buildManifest.js`
          )
          if (this.modern) {
            assetMap.pages['/_app'].push(
              `${CLIENT_STATIC_FILES_PATH}/${
                this.buildId
              }/_buildManifest.module.js`
            )
          }
        }

        assetMap.pages = Object.keys(assetMap.pages)
          .sort()
          // eslint-disable-next-line
          .reduce((a, c) => ((a[c] = assetMap.pages[c]), a), {} as any)

        compilation.assets[BUILD_MANIFEST] = new RawSource(
          JSON.stringify(assetMap, null, 2)
        )

        if (this.clientManifest) {
          const clientManifestPath = `${CLIENT_STATIC_FILES_PATH}/${
            this.buildId
          }/_buildManifest.js`

          compilation.assets[clientManifestPath] = new RawSource(
            `self.__BUILD_MANIFEST = ${generateClientManifest(
              assetMap,
              false
            )};` + `self.__BUILD_MANIFEST_CB && self.__BUILD_MANIFEST_CB()`
          )

          if (this.modern) {
            const modernClientManifestPath = `${CLIENT_STATIC_FILES_PATH}/${
              this.buildId
            }/_buildManifest.module.js`

            compilation.assets[modernClientManifestPath] = new RawSource(
              `self.__BUILD_MANIFEST = ${generateClientManifest(
                assetMap,
                true
              )};` + `self.__BUILD_MANIFEST_CB && self.__BUILD_MANIFEST_CB()`
            )
          }
        }
        callback()
      }
    )
  }
}
