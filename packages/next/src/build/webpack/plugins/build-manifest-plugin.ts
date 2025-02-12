import type { BloomFilter } from '../../../shared/lib/bloom-filter'
import type { Rewrite, CustomRoutes } from '../../../lib/load-custom-routes'
import devalue from 'next/dist/compiled/devalue'
import { webpack, sources } from 'next/dist/compiled/webpack/webpack'
import {
  BUILD_MANIFEST,
  MIDDLEWARE_BUILD_MANIFEST,
  CLIENT_STATIC_FILES_PATH,
  CLIENT_STATIC_FILES_RUNTIME_MAIN,
  CLIENT_STATIC_FILES_RUNTIME_MAIN_APP,
  CLIENT_STATIC_FILES_RUNTIME_POLYFILLS_SYMBOL,
  CLIENT_STATIC_FILES_RUNTIME_REACT_REFRESH,
  CLIENT_STATIC_FILES_RUNTIME_AMP,
  SYSTEM_ENTRYPOINTS,
} from '../../../shared/lib/constants'
import type { BuildManifest } from '../../../server/get-page-files'
import getRouteFromEntrypoint from '../../../server/get-route-from-entrypoint'
import { ampFirstEntryNamesMap } from './next-drop-client-page-plugin'
import { getSortedRoutes } from '../../../shared/lib/router/utils'
import { spans } from './profiling-plugin'
import { Span } from '../../../trace'

type DeepMutable<T> = { -readonly [P in keyof T]: DeepMutable<T[P]> }

export type ClientBuildManifest = {
  [key: string]: string[]
}

// Add the runtime ssg manifest file as a lazy-loaded file dependency.
// We also stub this file out for development mode (when it is not
// generated).
export const srcEmptySsgManifest = `self.__SSG_MANIFEST=new Set;self.__SSG_MANIFEST_CB&&self.__SSG_MANIFEST_CB()`

// nodejs: '/static/<build id>/low-priority.js'
function buildNodejsLowPriorityPath(filename: string, buildId: string) {
  return `${CLIENT_STATIC_FILES_PATH}/${buildId}/${filename}`
}

function createEdgeRuntimeManifest(originAssetMap: BuildManifest): string {
  const manifestFilenames = ['_buildManifest.js', '_ssgManifest.js']

  const assetMap: BuildManifest = {
    ...originAssetMap,
    lowPriorityFiles: [],
  }

  // we use globalThis here because middleware can be node
  // which doesn't have "self"
  const manifestDefCode = `globalThis.__BUILD_MANIFEST = ${JSON.stringify(
    assetMap,
    null,
    2
  )};\n`
  // edge lowPriorityFiles item: '"/static/" + process.env.__NEXT_BUILD_ID + "/low-priority.js"'.
  // Since lowPriorityFiles is not fixed and relying on `process.env.__NEXT_BUILD_ID`, we'll produce code creating it dynamically.
  const lowPriorityFilesCode =
    `globalThis.__BUILD_MANIFEST.lowPriorityFiles = [\n` +
    manifestFilenames
      .map((filename) => {
        return `"/static/" + process.env.__NEXT_BUILD_ID + "/${filename}",\n`
      })
      .join(',') +
    `\n];`

  return manifestDefCode + lowPriorityFilesCode
}

function normalizeRewrite(item: {
  source: string
  destination: string
  has?: any
}): CustomRoutes['rewrites']['beforeFiles'][0] {
  return {
    has: item.has,
    source: item.source,
    destination: item.destination,
  }
}

export function normalizeRewritesForBuildManifest(
  rewrites: CustomRoutes['rewrites']
): CustomRoutes['rewrites'] {
  return {
    afterFiles: rewrites.afterFiles
      ?.map(processRoute)
      ?.map((item) => normalizeRewrite(item)),
    beforeFiles: rewrites.beforeFiles
      ?.map(processRoute)
      ?.map((item) => normalizeRewrite(item)),
    fallback: rewrites.fallback
      ?.map(processRoute)
      ?.map((item) => normalizeRewrite(item)),
  }
}

// This function takes the asset map generated in BuildManifestPlugin and creates a
// reduced version to send to the client.
export function generateClientManifest(
  assetMap: BuildManifest,
  rewrites: CustomRoutes['rewrites'],
  clientRouterFilters?: {
    staticFilter: ReturnType<BloomFilter['export']>
    dynamicFilter: ReturnType<BloomFilter['export']>
  },
  compiler?: any,
  compilation?: any
): string | undefined {
  const compilationSpan = compilation
    ? spans.get(compilation)
    : compiler
      ? spans.get(compiler)
      : new Span({ name: 'client-manifest' })

  const genClientManifestSpan = compilationSpan?.traceChild(
    'NextJsBuildManifest-generateClientManifest'
  )

  return genClientManifestSpan?.traceFn(() => {
    const clientManifest: ClientBuildManifest = {
      __rewrites: normalizeRewritesForBuildManifest(rewrites) as any,
      __routerFilterStatic: clientRouterFilters?.staticFilter as any,
      __routerFilterDynamic: clientRouterFilters?.dynamicFilter as any,
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
}

export function getEntrypointFiles(entrypoint: any): string[] {
  return (
    entrypoint
      ?.getFiles()
      .filter((file: string) => {
        // We don't want to include `.hot-update.js` files into the initial page
        return /(?<!\.hot-update)\.(js|css)($|\?)/.test(file)
      })
      .map((file: string) => file.replace(/\\/g, '/')) ?? []
  )
}

export const processRoute = (r: Rewrite) => {
  const rewrite = { ...r }

  // omit external rewrite destinations since these aren't
  // handled client-side
  if (!rewrite?.destination?.startsWith('/')) {
    delete (rewrite as any).destination
  }
  return rewrite
}

// This plugin creates a build-manifest.json for all assets that are being output
// It has a mapping of "entry" filename to real filename. Because the real filename can be hashed in production
export default class BuildManifestPlugin {
  private buildId: string
  private rewrites: CustomRoutes['rewrites']
  private isDevFallback: boolean
  private appDirEnabled: boolean
  private clientRouterFilters?: Parameters<typeof generateClientManifest>[2]

  constructor(options: {
    buildId: string
    rewrites: CustomRoutes['rewrites']
    isDevFallback?: boolean
    appDirEnabled: boolean
    clientRouterFilters?: Parameters<typeof generateClientManifest>[2]
  }) {
    this.buildId = options.buildId
    this.isDevFallback = !!options.isDevFallback
    this.rewrites = {
      beforeFiles: [],
      afterFiles: [],
      fallback: [],
    }
    this.appDirEnabled = options.appDirEnabled
    this.clientRouterFilters = options.clientRouterFilters
    this.rewrites.beforeFiles = options.rewrites.beforeFiles.map(processRoute)
    this.rewrites.afterFiles = options.rewrites.afterFiles.map(processRoute)
    this.rewrites.fallback = options.rewrites.fallback.map(processRoute)
  }

  createAssets(compiler: any, compilation: any) {
    const compilationSpan = spans.get(compilation) || spans.get(compiler)
    const createAssetsSpan = compilationSpan?.traceChild(
      'NextJsBuildManifest-createassets'
    )
    return createAssetsSpan?.traceFn(() => {
      const entrypoints: Map<string, any> = compilation.entrypoints
      const assetMap: DeepMutable<BuildManifest> = {
        polyfillFiles: [],
        devFiles: [],
        ampDevFiles: [],
        lowPriorityFiles: [],
        rootMainFiles: [],
        rootMainFilesTree: {},
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

      const mainFiles = new Set(
        getEntrypointFiles(entrypoints.get(CLIENT_STATIC_FILES_RUNTIME_MAIN))
      )

      if (this.appDirEnabled) {
        assetMap.rootMainFiles = [
          ...new Set(
            getEntrypointFiles(
              entrypoints.get(CLIENT_STATIC_FILES_RUNTIME_MAIN_APP)
            )
          ),
        ]
      }

      const compilationAssets: {
        name: string
        source: typeof sources.RawSource
        info: object
      }[] = compilation.getAssets()

      assetMap.polyfillFiles = compilationAssets
        .filter((p) => {
          // Ensure only .js files are passed through
          if (!p.name.endsWith('.js')) {
            return false
          }

          return (
            p.info && CLIENT_STATIC_FILES_RUNTIME_POLYFILLS_SYMBOL in p.info
          )
        })
        .map((v) => v.name)

      assetMap.devFiles = getEntrypointFiles(
        entrypoints.get(CLIENT_STATIC_FILES_RUNTIME_REACT_REFRESH)
      ).filter((file) => !mainFiles.has(file))

      assetMap.ampDevFiles = getEntrypointFiles(
        entrypoints.get(CLIENT_STATIC_FILES_RUNTIME_AMP)
      )

      for (const entrypoint of compilation.entrypoints.values()) {
        if (SYSTEM_ENTRYPOINTS.has(entrypoint.name)) continue
        const pagePath = getRouteFromEntrypoint(entrypoint.name)

        if (!pagePath) {
          continue
        }

        const filesForPage = getEntrypointFiles(entrypoint)

        assetMap.pages[pagePath] = [...new Set([...mainFiles, ...filesForPage])]
      }

      if (!this.isDevFallback) {
        // Add the runtime build manifest file (generated later in this file)
        // as a dependency for the app. If the flag is false, the file won't be
        // downloaded by the client.
        const buildManifestPath = buildNodejsLowPriorityPath(
          '_buildManifest.js',
          this.buildId
        )
        const ssgManifestPath = buildNodejsLowPriorityPath(
          '_ssgManifest.js',
          this.buildId
        )
        assetMap.lowPriorityFiles.push(buildManifestPath, ssgManifestPath)
        compilation.emitAsset(
          ssgManifestPath,
          new sources.RawSource(srcEmptySsgManifest)
        )
      }

      assetMap.pages = Object.keys(assetMap.pages)
        .sort()
        .reduce(
          // eslint-disable-next-line
          (a, c) => ((a[c] = assetMap.pages[c]), a),
          {} as typeof assetMap.pages
        )

      let buildManifestName = BUILD_MANIFEST

      if (this.isDevFallback) {
        buildManifestName = `fallback-${BUILD_MANIFEST}`
      }

      compilation.emitAsset(
        buildManifestName,
        new sources.RawSource(JSON.stringify(assetMap, null, 2))
      )

      compilation.emitAsset(
        `server/${MIDDLEWARE_BUILD_MANIFEST}.js`,
        new sources.RawSource(`${createEdgeRuntimeManifest(assetMap)}`)
      )

      if (!this.isDevFallback) {
        compilation.emitAsset(
          `${CLIENT_STATIC_FILES_PATH}/${this.buildId}/_buildManifest.js`,
          new sources.RawSource(
            `self.__BUILD_MANIFEST = ${generateClientManifest(
              assetMap,
              this.rewrites,
              this.clientRouterFilters,
              compiler,
              compilation
            )};self.__BUILD_MANIFEST_CB && self.__BUILD_MANIFEST_CB()`
          )
        )
      }
    })
  }

  apply(compiler: webpack.Compiler) {
    compiler.hooks.make.tap('NextJsBuildManifest', (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: 'NextJsBuildManifest',
          stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
        },
        () => {
          this.createAssets(compiler, compilation)
        }
      )
    })
    return
  }
}
