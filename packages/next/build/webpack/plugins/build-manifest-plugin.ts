import devalue from 'next/dist/compiled/devalue'
import { Compiler } from 'webpack'
import { RawSource } from 'webpack-sources'
import {
  BUILD_MANIFEST,
  CLIENT_STATIC_FILES_PATH,
  CLIENT_STATIC_FILES_RUNTIME_MAIN,
  CLIENT_STATIC_FILES_RUNTIME_POLYFILLS,
  CLIENT_STATIC_FILES_RUNTIME_REACT_REFRESH,
  IS_BUNDLED_PAGE_REGEX,
} from '../../../next-server/lib/constants'
import { BuildManifest } from '../../../next-server/server/get-page-files'
import getRouteFromEntrypoint from '../../../next-server/server/get-route-from-entrypoint'

// This function takes the asset map generated in BuildManifestPlugin and creates a
// reduced version to send to the client.
const generateClientManifest = (
  assetMap: BuildManifest,
  isModern: boolean
): string => {
  const clientManifest: { [s: string]: string[] } = {}
  const appDependencies = new Set(assetMap.pages['/_app'])

  Object.entries(assetMap.pages).forEach(([page, dependencies]) => {
    if (page === '/_app' || page === '/_polyfills') return
    // Filter out dependencies in the _app entry, because those will have already
    // been loaded by the client prior to a navigation event
    const filteredDeps = dependencies.filter(
      (dep) =>
        !appDependencies.has(dep) &&
        (!dep.endsWith('.js') || dep.endsWith('.module.js') === isModern)
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
  private modern: boolean

  constructor(options: { buildId: string; modern: boolean }) {
    this.buildId = options.buildId
    this.modern = options.modern
  }

  apply(compiler: Compiler) {
    compiler.hooks.emit.tapAsync(
      'NextJsBuildManifest',
      (compilation, callback) => {
        const { chunks } = compilation
        const assetMap: BuildManifest = {
          polyfillFiles: [],
          devFiles: [],
          lowPriorityFiles: [],
          pages: { '/_app': [] },
        }

        const mainJsChunk = chunks.find(
          (c) => c.name === CLIENT_STATIC_FILES_RUNTIME_MAIN
        )
        const mainJsFiles: string[] =
          mainJsChunk && mainJsChunk.files.length > 0
            ? mainJsChunk.files.filter((file: string) => /\.js$/.test(file))
            : []

        const polyfillChunk = chunks.find(
          (c) => c.name === CLIENT_STATIC_FILES_RUNTIME_POLYFILLS
        )
        const polyfillFiles: string[] = polyfillChunk ? polyfillChunk.files : []

        const reactRefreshChunk = chunks.find(
          (c) => c.name === CLIENT_STATIC_FILES_RUNTIME_REACT_REFRESH
        )
        assetMap.devFiles.push(...(reactRefreshChunk?.files ?? []))

        for (const entrypoint of compilation.entrypoints.values()) {
          const pagePath = getRouteFromEntrypoint(entrypoint.name)

          if (!pagePath) {
            continue
          }

          const filesForEntry: string[] = []

          // getFiles() - helper function to read the files for an entrypoint from stats object
          for (const file of entrypoint.getFiles()) {
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

          assetMap.pages[pagePath] = [...filesForEntry, ...mainJsFiles]
        }

        // Create a separate entry  for polyfills
        assetMap.polyfillFiles = polyfillFiles

        // Add the runtime build manifest file (generated later in this file)
        // as a dependency for the app. If the flag is false, the file won't be
        // downloaded by the client.
        assetMap.lowPriorityFiles.push(
          `${CLIENT_STATIC_FILES_PATH}/${this.buildId}/_buildManifest.js`
        )
        if (this.modern) {
          assetMap.lowPriorityFiles.push(
            `${CLIENT_STATIC_FILES_PATH}/${this.buildId}/_buildManifest.module.js`
          )
        }

        // Add the runtime ssg manifest file as a lazy-loaded file dependency.
        // We also stub this file out for development mode (when it is not
        // generated).
        const srcEmptySsgManifest = `self.__SSG_MANIFEST=new Set;self.__SSG_MANIFEST_CB&&self.__SSG_MANIFEST_CB()`

        const ssgManifestPath = `${CLIENT_STATIC_FILES_PATH}/${this.buildId}/_ssgManifest.js`
        assetMap.lowPriorityFiles.push(ssgManifestPath)
        compilation.assets[ssgManifestPath] = new RawSource(srcEmptySsgManifest)

        if (this.modern) {
          const ssgManifestPathModern = `${CLIENT_STATIC_FILES_PATH}/${this.buildId}/_ssgManifest.module.js`
          assetMap.lowPriorityFiles.push(ssgManifestPathModern)
          compilation.assets[ssgManifestPathModern] = new RawSource(
            srcEmptySsgManifest
          )
        }

        assetMap.pages = Object.keys(assetMap.pages)
          .sort()
          // eslint-disable-next-line
          .reduce((a, c) => ((a[c] = assetMap.pages[c]), a), {} as any)

        compilation.assets[BUILD_MANIFEST] = new RawSource(
          JSON.stringify(assetMap, null, 2)
        )

        const clientManifestPath = `${CLIENT_STATIC_FILES_PATH}/${this.buildId}/_buildManifest.js`

        compilation.assets[clientManifestPath] = new RawSource(
          `self.__BUILD_MANIFEST = ${generateClientManifest(
            assetMap,
            false
          )};self.__BUILD_MANIFEST_CB && self.__BUILD_MANIFEST_CB()`
        )

        if (this.modern) {
          const modernClientManifestPath = `${CLIENT_STATIC_FILES_PATH}/${this.buildId}/_buildManifest.module.js`

          compilation.assets[modernClientManifestPath] = new RawSource(
            `self.__BUILD_MANIFEST = ${generateClientManifest(
              assetMap,
              true
            )};self.__BUILD_MANIFEST_CB && self.__BUILD_MANIFEST_CB()`
          )
        }
        callback()
      }
    )
  }
}
