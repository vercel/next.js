import path from 'path'
import crypto from 'crypto'
import fs from 'fs/promises'
import { pathToFileURL } from 'url'
import * as Log from '../output/log'
import { isMiddlewareFilename } from '../utils'
import { RenderingMode } from '../rendering-mode'
import { interopDefault } from '../../lib/interop-default'
import type { RouteHas } from '../../lib/load-custom-routes'
import { recursiveReadDir } from '../../lib/recursive-readdir'
import { isDynamicRoute } from '../../shared/lib/router/utils'
import type { Revalidate } from '../../server/lib/cache-control'
import type { NextConfigComplete } from '../../server/config-shared'
import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'
import { AdapterOutputType, type PHASE_TYPE } from '../../shared/lib/constants'
import { normalizePagePath } from '../../shared/lib/page-path/normalize-page-path'
import {
  convertRedirects,
  convertRewrites,
  convertHeaders,
} from 'next/dist/compiled/@vercel/routing-utils'

import type {
  MiddlewareManifest,
  EdgeFunctionDefinition,
} from '../webpack/plugins/middleware-plugin'

import type {
  RoutesManifest,
  PrerenderManifest,
  ManifestRewriteRoute,
  FunctionsConfigManifest,
  DynamicPrerenderManifestRoute,
  ManifestHeaderRoute,
} from '..'

import {
  CACHE_ONE_YEAR_SECONDS,
  HTML_CONTENT_TYPE_HEADER,
  JSON_CONTENT_TYPE_HEADER,
  NEXT_QUERY_PARAM_PREFIX,
  NEXT_RESUME_HEADER,
} from '../../lib/constants'

import { normalizeLocalePath } from '../../shared/lib/i18n/normalize-locale-path'
import { getStaticMetadataPrerenderPathname } from '../../lib/metadata/get-metadata-route'
import { isStaticMetadataFile } from '../../lib/metadata/is-metadata-route'
import { addPathPrefix } from '../../shared/lib/router/utils/add-path-prefix'
import { getRedirectStatus, modifyRouteRegex } from '../../lib/redirect-status'
import { getNamedRouteRegex } from '../../shared/lib/router/utils/route-regex'
import { escapeStringRegexp } from '../../shared/lib/escape-regexp'
import { sortSortableRoutes } from '../../shared/lib/router/utils/sortable-routes'
import { defaultOverrides } from '../../server/require-hook'
import { generateRoutesManifest } from '../generate-routes-manifest'
import { Bundler } from '../../lib/bundler'
import { resolveCacheHandlerPathToFilesystem } from '../../lib/format-dynamic-import-path'
import { isAPIRoute } from '../../lib/is-api-route'

interface SharedRouteFields {
  /**
   * id is the unique identifier of the output
   */
  id: string
  /**
   * filePath is the location on disk of the built entrypoint asset
   */
  filePath: string
  /**
   * pathname is the URL pathname the asset should be served at
   */
  pathname: string

  /**
   * sourcePage is the original source in the app or pages folder
   */
  sourcePage: string

  /**
   * runtime is which runtime the entrypoint is built for
   */
  runtime: 'nodejs' | 'edge'

  /**
   * assets are all necessary traced assets that could be
   * loaded by the output to handle a request e.g. traced
   * node_modules or necessary manifests for Next.js.
   * The key is the relative path from the repo root
   */
  assets: Record<string, string>

  /**
   * Hashes of the contents of each `assets` entry (not including the output path!)
   */
  assetsHashes: Record<string, string>

  /**
   * wasmAssets are bundled wasm files. The key is the (opaque) name of asset
   */
  wasmAssets?: Record<string, string>

  /**
   * edgeRuntime contains canonical entry metadata for invoking
   * this output in an edge runtime.
   */
  edgeRuntime?: {
    /**
     * modulePath is the canonical module path that registers this
     * output in the edge runtime.
     */
    modulePath: string
    /**
     * entryKey is the canonical key used for the global edge entry registry.
     */
    entryKey: string
    /**
     * handlerExport is the export name to invoke on the edge entry.
     */
    handlerExport: string
  }

  /**
   * config related to the route
   */
  config: {
    /**
     * maxDuration is a segment config to signal the max
     * execution duration a route should be allowed before
     * it's timed out
     */
    maxDuration?: number
    /**
     * preferredRegion is a segment config to signal deployment
     * region preferences to the provider being used
     */
    preferredRegion?: string | string[]

    /**
     * env is the environment variables to expose, this is only
     * populated for edge runtime currently
     */
    env?: Record<string, string>
  }
}

export interface AdapterOutput {
  /**
   * `PAGES` represents all the React pages that are under `pages/`.
   */
  PAGES: SharedRouteFields & {
    type: AdapterOutputType.PAGES
  }

  /**
   * `PAGES_API` represents all the API routes under `pages/api/`.
   */
  PAGES_API: SharedRouteFields & {
    type: AdapterOutputType.PAGES_API
  }
  /**
   * `APP_PAGE` represents all the React pages that are under `app/` with the
   * filename of `page.{j,t}s{,x}`.
   */
  APP_PAGE: SharedRouteFields & {
    type: AdapterOutputType.APP_PAGE
  }

  /**
   * `APP_ROUTE` represents all the API routes and metadata routes that are under `app/` with the
   * filename of `route.{j,t}s{,x}`.
   */
  APP_ROUTE: SharedRouteFields & {
    type: AdapterOutputType.APP_ROUTE
  }

  /**
   * `PRERENDER` represents an ISR enabled route that might
   * have a seeded cache entry or fallback generated during build
   */
  PRERENDER: {
    id: string
    pathname: string
    type: AdapterOutputType.PRERENDER

    /**
     * For prerenders the parent output is the originating
     * page that the prerender is created from
     */
    parentOutputId: string

    /**
     * groupId is the identifier for a group of prerenders that should be
     * revalidated together
     */
    groupId: number

    pprChain?: {
      headers: Record<string, string>
    }

    /**
     * parentFallbackMode signals whether additional routes can be generated
     * e.g. fallback: false or 'blocking' in getStaticPaths in pages router
     */
    parentFallbackMode?: DynamicPrerenderManifestRoute['fallback']

    /**
     * fallback is initial cache data generated during build for a prerender
     */
    fallback?: {
      /**
       * path to the fallback file can be HTML/JSON/RSC,
       */
      filePath: string | undefined
      /**
       * initialStatus is the status code that should be applied
       * when serving the fallback
       */
      initialStatus?: number
      /**
       * initialHeaders are the headers that should be sent when
       * serving the fallback
       */
      initialHeaders?: Record<string, string | string[]>
      /**
       * initial expiration is how long until the fallback entry
       * is considered expired and no longer valid to serve
       */
      initialExpiration?: number
      /**
       * initial revalidate is how long until the fallback is
       * considered stale and should be revalidated
       */
      initialRevalidate?: Revalidate

      /**
       * postponedState is the PPR state when it postponed and is used for resuming
       */
      postponedState: string | undefined
    }

    /**
     * config related to the route
     */
    config: {
      /**
       * allowQuery is the allowed query values to be passed
       * to an ISR function and what should be considered for the cacheKey
       * e.g. for /blog/[slug], "slug" is the only allowQuery
       */
      allowQuery?: string[]
      /**
       * allowHeader is the allowed headers to be passed to an
       * ISR function to prevent accidentally poisoning the cache
       * from leaking additional information that can impact the render
       */
      allowHeader?: string[]
      /**
       * bypass for is a list of has conditions the cache
       * should be bypassed and invoked directly e.g. action header
       */
      bypassFor?: RouteHas[]
      /**
       * renderingMode signals PPR or not for a prerender
       */
      renderingMode?: RenderingMode
      /**
       * partialFallback signals this prerender serves a partial fallback shell
       * and should be upgraded to a full route in the background.
       */
      partialFallback?: boolean

      /**
       * bypassToken is the generated token that signals a prerender cache
       * should be bypassed
       */
      bypassToken?: string
    }
  }

  /**
   * `STATIC_FILE` represents a static file (ie /_next/static) or a purely
   * static HTML asset e.g. an automatically statically optimized page
   * that does not use ISR
   */
  STATIC_FILE: {
    /**
     * Unique identifier for this static file output
     */
    id: string
    /**
     * Absolute filesystem path to the built file
     */
    filePath: string
    /**
     * The routable URL pathname for this static file
     */
    pathname: string
    type: AdapterOutputType.STATIC_FILE
    /**
     * If this static file is immutable (because its filename contains a content hash), then this
     * field contains the untruncated content hash.
     */
    immutableHash: string | undefined
  }

  /**
   * `MIDDLEWARE` represents the middleware output if present
   */
  MIDDLEWARE: SharedRouteFields & {
    type: AdapterOutputType.MIDDLEWARE
    /**
     * config related to the route
     */
    config: SharedRouteFields['config'] & {
      /**
       * matchers are the configured matchers for middleware
       */
      matchers?: Array<{
        source: string
        sourceRegex: string
        has: RouteHas[] | undefined
        missing: RouteHas[] | undefined
      }>
    }
  }
}

export interface AdapterOutputs {
  pages: Array<AdapterOutput['PAGES']>
  middleware?: AdapterOutput['MIDDLEWARE']
  appPages: Array<AdapterOutput['APP_PAGE']>
  pagesApi: Array<AdapterOutput['PAGES_API']>
  appRoutes: Array<AdapterOutput['APP_ROUTE']>
  prerenders: Array<AdapterOutput['PRERENDER']>
  staticFiles: Array<AdapterOutput['STATIC_FILE']>
}

type RewriteItem = {
  source: string
  sourceRegex: string
  destination: string
  has: RouteHas[] | undefined
  missing: RouteHas[] | undefined
}

type DynamicRouteItem = {
  source: string
  sourceRegex: string
  destination: string
  has: RouteHas[] | undefined
  missing: RouteHas[] | undefined
}

type Route = {
  // regex as string can have named or un-named matches
  source?: string
  sourceRegex: string
  // destination can have matches to replace in destination
  // keyed by $1 for un-named and $name for named
  destination?: string
  headers?: Record<string, string>
  has?: RouteHas[]
  missing?: RouteHas[]
  status?: number
  priority?: boolean
}

export interface NextAdapter {
  name: string
  /**
   * modifyConfig is called for any CLI command that loads the next.config
   * to only apply for specific commands the "phase" should be used
   * @param config
   * @param ctx
   * @returns
   */
  modifyConfig?: (
    config: NextConfigComplete,
    ctx: {
      phase: PHASE_TYPE
      /**
       * nextVersion is the current version of Next.js being used
       */
      nextVersion: string
      /**
       * projectDir is the absolute directory the Next.js application is in
       */
      projectDir: string
    }
  ) => Promise<NextConfigComplete> | NextConfigComplete
  onBuildComplete?: (ctx: {
    routing: {
      beforeMiddleware: Array<Route>
      /**
       * middlewareMatchers are the middleware matcher definitions emitted by
       * Next.js for this build and can be used to decide whether middleware
       * should be invoked for a given request.
       */
      middlewareMatchers: Array<Route>
      beforeFiles: Array<Route>
      afterFiles: Array<Route>
      dynamicRoutes: Array<Route>
      onMatch: Array<Route>
      fallback: Array<Route>
      /**
       * shouldNormalizeNextData indicates whether Next.js data URLs
       * (e.g., /_next/data/BUILD_ID/page.json) should be normalized
       * during route resolution. This is true when middleware is present
       * and there are pages router items to resolve.
       */
      shouldNormalizeNextData: boolean
      rsc: RoutesManifest['rsc']
    }
    outputs: AdapterOutputs
    /**
     * projectDir is the absolute directory the Next.js application is in
     */
    projectDir: string
    /**
     * repoRoot is the absolute path of the detected root of the repo
     */
    repoRoot: string
    /**
     * distDir is the absolute path to the dist directory
     */
    distDir: string
    /**
     * config is the loaded next.config (has modifyConfig applied)
     */
    config: NextConfigComplete
    /**
     * nextVersion is the current version of Next.js being used
     */
    nextVersion: string
    /**
     * buildId is the current unique ID for the build, this can be
     * influenced by NextConfig.generateBuildId
     */
    buildId: string
  }) => Promise<void> | void
}

function normalizePathnames(
  config: NextConfigComplete,
  outputs: AdapterOutputs
) {
  // normalize pathname field with basePath
  if (config.basePath) {
    for (const output of [
      ...outputs.pages,
      ...outputs.pagesApi,
      ...outputs.appPages,
      ...outputs.appRoutes,
      ...outputs.prerenders,
      ...outputs.staticFiles,
    ]) {
      output.pathname =
        addPathPrefix(output.pathname, config.basePath).replace(/\/$/, '') ||
        '/'
    }
  }
}

export async function handleBuildComplete({
  dir,
  config,
  appType,
  buildId,
  configOutDir,
  distDir,
  pageKeys,
  bundler,
  repoRoot,
  outputFileTracingRoot,
  adapterPath,
  appPageKeys,
  staticPages,
  nextVersion,
  hasStatic404,
  hasStatic500,
  routesManifest,
  serverPropsPages,
  hasNodeMiddleware,
  prerenderManifest,
  middlewareManifest,
  requiredServerFiles,
  hasInstrumentationHook,
  functionsConfigManifest,
}: {
  /** The folder containing the next.config.js file */
  dir: string
  appType: 'app' | 'pages' | 'hybrid'
  /** The .next folder */
  distDir: string
  buildId: string
  configOutDir: string
  adapterPath: string
  /** The repository root. The base for relative output paths. */
  repoRoot: string
  /** A normalized version of config.outputFileTracingRoot  */
  outputFileTracingRoot: string
  nextVersion: string
  hasStatic404: boolean
  hasStatic500: boolean
  bundler: Bundler
  staticPages: Set<string>
  hasNodeMiddleware: boolean
  config: NextConfigComplete
  pageKeys: readonly string[]
  serverPropsPages: Set<string>
  requiredServerFiles: string[]
  routesManifest: RoutesManifest
  hasInstrumentationHook: boolean
  prerenderManifest: PrerenderManifest
  middlewareManifest: MiddlewareManifest
  appPageKeys?: readonly string[] | undefined
  functionsConfigManifest: FunctionsConfigManifest
}) {
  const adapterMod = interopDefault(
    await import(pathToFileURL(require.resolve(adapterPath)).href)
  ) as NextAdapter

  if (typeof adapterMod.onBuildComplete === 'function') {
    const outputs: AdapterOutputs = {
      pages: [],
      pagesApi: [],
      appPages: [],
      appRoutes: [],
      prerenders: [],
      staticFiles: [],
    }

    if (config.output === 'export') {
      // collect export assets and provide as static files
      const exportFiles = await recursiveReadDir(configOutDir)

      for (const file of exportFiles) {
        let pathname = (
          file.endsWith('.html') ? file.replace(/\.html$/, '') : file
        ).replace(/\\/g, '/')

        pathname = pathname.startsWith('/') ? pathname : `/${pathname}`

        outputs.staticFiles.push({
          id: file,
          pathname,
          filePath: path.join(configOutDir, file),
          type: AdapterOutputType.STATIC_FILE,
          immutableHash: undefined,
        } satisfies AdapterOutput['STATIC_FILE'])
      }
    } else {
      const staticFiles = await recursiveReadDir(path.join(distDir, 'static'))

      const clientHashes: Record<string, string> | undefined =
        bundler === Bundler.Turbopack &&
        config.experimental.supportsImmutableAssets
          ? JSON.parse(
              await fs.readFile(
                path.join(distDir, 'immutable-static-hashes.json'),
                'utf8'
              )
            )
          : undefined

      for (const file of staticFiles) {
        const pathname = path.posix.join('/_next/static', file)
        const filePath = path.join(distDir, 'static', file)
        const id = path.join('static', file)
        outputs.staticFiles.push({
          type: AdapterOutputType.STATIC_FILE,
          id,
          pathname,
          filePath,
          immutableHash: clientHashes?.[id],
        })
      }

      const {
        sharedNodeAssets,
        sharedNodeAssetsHashes,
        pagesSharedNodeAssets,
        pagesSharedNodeAssetsHashes,
        appPagesSharedNodeAssets,
        appPagesSharedNodeAssetsHashes,
      } = await getSharedNodeAssets({
        distDir,
        requiredServerFiles,
        dir,
        repoRoot,
        outputFileTracingRoot,
        bundler,
        hasInstrumentationHook,
        config,
      })

      async function handleTraceFiles(
        entryFilePath: string,
        type: 'pages' | 'app' | 'neutral'
      ) {
        const assets: Record<string, string> = {}
        const assetsHashes: Record<string, string> = {}
        const { entryHash } = await loadNFT(
          assets,
          assetsHashes,
          repoRoot,
          `${entryFilePath}.nft.json`
        )
        Object.assign(
          assets,
          sharedNodeAssets,
          type === 'pages' ? pagesSharedNodeAssets : {},
          type === 'app' ? appPagesSharedNodeAssets : {}
        )
        Object.assign(
          assetsHashes,
          sharedNodeAssetsHashes,
          type === 'pages' ? pagesSharedNodeAssetsHashes : {},
          type === 'app' ? appPagesSharedNodeAssetsHashes : {}
        )
        if (entryHash) {
          assetsHashes[path.relative(repoRoot, entryFilePath)] = entryHash
        }
        return { assets, assetsHashes, entryHash }
      }

      async function handleEdgeFunction(
        page: EdgeFunctionDefinition,
        isMiddleware: boolean = false
      ) {
        let type: AdapterOutputType = AdapterOutputType.PAGES
        const isAppPrefix = page.name.startsWith('app/')
        const isAppPage = isAppPrefix && page.name.endsWith('/page')
        const isAppRoute = isAppPrefix && page.name.endsWith('/route')
        let currentOutputs: Array<
          | AdapterOutput['PAGES']
          | AdapterOutput['PAGES_API']
          | AdapterOutput['APP_PAGE']
          | AdapterOutput['APP_ROUTE']
        > = outputs.pages

        if (isMiddleware) {
          type = AdapterOutputType.MIDDLEWARE
        } else if (isAppPage) {
          currentOutputs = outputs.appPages
          type = AdapterOutputType.APP_PAGE
        } else if (isAppRoute) {
          currentOutputs = outputs.appRoutes
          type = AdapterOutputType.APP_ROUTE
        } else if (page.page.startsWith('/api')) {
          currentOutputs = outputs.pagesApi
          type = AdapterOutputType.PAGES_API
        }

        const route = page.page.replace(/^(app|pages)\//, '')
        const pathname = isAppPrefix
          ? normalizeAppPath(route)
          : route === '/index'
            ? '/'
            : route
        const edgeEntrypointRelativePath = page.entrypoint
        const edgeEntrypointPath = path.join(
          distDir,
          edgeEntrypointRelativePath
        )

        const output: Omit<AdapterOutput[typeof type], 'type'> & {
          type: any
        } = {
          type,
          id: page.name,
          runtime: 'edge',
          sourcePage: route,
          pathname,
          filePath: edgeEntrypointPath,
          edgeRuntime: {
            modulePath: edgeEntrypointPath,
            entryKey: `middleware_${page.name}`,
            handlerExport: 'handler',
          },
          assets: {},
          assetsHashes: {},
          // Computing assetsHash for edge functions isn't implemented for now
          wasmAssets: {},
          config: {
            env: page.env,
            preferredRegion: page.regions,
          },
        }

        for (const file of page.files) {
          const originalPath = path.join(distDir, file)
          const fileOutputPath = path.relative(
            config.distDir,
            path.join(path.relative(repoRoot, distDir), file)
          )
          output.assets[fileOutputPath] = originalPath
        }
        for (const item of [...(page.assets || [])]) {
          output.assets[item.name] = path.join(distDir, item.filePath)
        }
        for (const item of page.wasm || []) {
          if (!output.wasmAssets) {
            output.wasmAssets = {}
          }
          output.wasmAssets[item.name] = path.join(distDir, item.filePath)
        }

        if (type === AdapterOutputType.MIDDLEWARE) {
          ;(output as AdapterOutput['MIDDLEWARE']).config.matchers =
            page.matchers.map((item) => {
              return {
                source: item.originalSource,
                sourceRegex: item.regexp,
                has: item.has,
                missing: [
                  ...(item.missing || []),
                  // always skip middleware for on-demand revalidate
                  {
                    type: 'header',
                    key: 'x-prerender-revalidate',
                    value: prerenderManifest.preview.previewModeId,
                  },
                ],
              }
            })
          output.pathname = '/_middleware'
          output.id = page.name
          outputs.middleware = output
        } else {
          currentOutputs.push(output)
        }

        // need to add matching .rsc output
        if (isAppPage) {
          const rscPathname = normalizePagePath(output.pathname) + '.rsc'
          outputs.appPages.push({
            ...output,
            pathname: rscPathname,
            id: page.name + '.rsc',
          })
        } else if (
          type !== AdapterOutputType.MIDDLEWARE &&
          serverPropsPages.has(pathname)
        ) {
          const nextDataPath = path.posix.join(
            '/_next/data/',
            buildId,
            normalizePagePath(pathname) + '.json'
          )
          outputs.pages.push({
            ...output,
            pathname: nextDataPath,
          })
        }
      }

      const edgeFunctionHandlers: Promise<any>[] = []

      for (const middleware of Object.values(middlewareManifest.middleware)) {
        if (isMiddlewareFilename(middleware.name)) {
          edgeFunctionHandlers.push(handleEdgeFunction(middleware, true))
        }
      }

      for (const page of Object.values(middlewareManifest.functions)) {
        edgeFunctionHandlers.push(handleEdgeFunction(page))
      }
      const pagesDistDir = path.join(distDir, 'server', 'pages')
      const pageOutputMap: Record<
        string,
        AdapterOutput['PAGES'] | AdapterOutput['PAGES_API']
      > = {}

      const rscFallbackPath = path.join(distDir, 'server', 'rsc-fallback.json')

      if (appPageKeys && appPageKeys.length > 0 && pageKeys.length > 0) {
        await fs.writeFile(rscFallbackPath, '{}')
      }

      for (const page of pageKeys) {
        if (page === '/_app' || page === '/_document') {
          continue
        }

        if (middlewareManifest.functions.hasOwnProperty(page)) {
          continue
        }

        const route = normalizePagePath(page)
        const pageFile = path.join(pagesDistDir, `${route}.js`)

        // if it's an auto static optimized page it's just
        // a static file
        if (staticPages.has(page)) {
          if (config.i18n) {
            for (const locale of config.i18n.locales || []) {
              const localePage =
                page === '/' ? `/${locale}` : addPathPrefix(page, `/${locale}`)

              const localeOutput = {
                id: localePage,
                pathname: localePage,
                type: AdapterOutputType.STATIC_FILE,
                filePath: path.join(
                  pagesDistDir,
                  `${normalizePagePath(localePage)}.html`
                ),
                immutableHash: undefined,
              } satisfies AdapterOutput['STATIC_FILE']

              outputs.staticFiles.push(localeOutput)

              if (appPageKeys && appPageKeys.length > 0) {
                outputs.staticFiles.push({
                  id: `${localePage}.rsc`,
                  pathname: `${localePage}.rsc`,
                  type: AdapterOutputType.STATIC_FILE,
                  filePath: rscFallbackPath,
                  immutableHash: undefined,
                })
              }
            }
          } else {
            const staticOutput = {
              id: page,
              pathname: route,
              type: AdapterOutputType.STATIC_FILE,
              filePath: pageFile.replace(/\.js$/, '.html'),
              immutableHash: undefined,
            } satisfies AdapterOutput['STATIC_FILE']

            outputs.staticFiles.push(staticOutput)

            if (appPageKeys && appPageKeys.length > 0) {
              outputs.staticFiles.push({
                id: `${page}.rsc`,
                pathname: `${route}.rsc`,
                type: AdapterOutputType.STATIC_FILE,
                filePath: rscFallbackPath,
                immutableHash: undefined,
              })
            }
          }
          // if was a static file output don't create page output as well
          continue
        }

        const { assets, assetsHashes } = await handleTraceFiles(
          pageFile,
          'pages'
        ).catch((err) => {
          if (err.code !== 'ENOENT' || (page !== '/404' && page !== '/500')) {
            Log.warn(`Failed to locate traced assets for ${pageFile}`, err)
          }
          return { assets: {}, assetsHashes: {} }
        })
        const functionConfig = functionsConfigManifest.functions[route] || {}
        let sourcePage = route.replace(/^\//, '')

        sourcePage = sourcePage === 'api' ? 'api/index' : sourcePage

        const output: AdapterOutput['PAGES'] | AdapterOutput['PAGES_API'] = {
          id: route,
          type: page.startsWith('/api')
            ? AdapterOutputType.PAGES_API
            : AdapterOutputType.PAGES,
          filePath: pageFile,
          pathname: route,
          sourcePage,
          assets,
          assetsHashes,
          runtime: 'nodejs',
          config: {
            maxDuration: functionConfig.maxDuration,
            preferredRegion: functionConfig.regions,
          },
        }
        pageOutputMap[page] = output

        if (output.type === AdapterOutputType.PAGES) {
          outputs.pages.push(output)

          // if page is get server side props we need to create
          // the _next/data output as well
          if (serverPropsPages.has(page)) {
            const dataPathname = path.posix.join(
              '/_next/data',
              buildId,
              normalizePagePath(page) + '.json'
            )
            outputs.pages.push({
              ...output,
              pathname: dataPathname,
              id: dataPathname,
            })

            if (appPageKeys && appPageKeys.length > 0) {
              const rscPage = `${page === '/' ? '/index' : page}.rsc`
              outputs.staticFiles.push({
                id: rscPage,
                pathname: rscPage,
                type: AdapterOutputType.STATIC_FILE,
                filePath: rscFallbackPath,
                immutableHash: undefined,
              })
            }
          }

          for (const locale of config.i18n?.locales || []) {
            const localePage =
              page === '/' ? `/${locale}` : addPathPrefix(page, `/${locale}`)

            outputs.pages.push({
              ...output,
              id: localePage,
              pathname: localePage,
            })

            if (serverPropsPages.has(page)) {
              const dataPathname = path.posix.join(
                '/_next/data',
                buildId,
                localePage + '.json'
              )
              outputs.pages.push({
                ...output,
                pathname: dataPathname,
                id: dataPathname,
              })
              if (appPageKeys && appPageKeys.length > 0) {
                outputs.staticFiles.push({
                  id: `${localePage}.rsc`,
                  pathname: `${localePage}.rsc`,
                  type: AdapterOutputType.STATIC_FILE,
                  filePath: rscFallbackPath,
                  immutableHash: undefined,
                })
              }
            }
          }
        } else {
          outputs.pagesApi.push(output)
        }
      }

      if (hasNodeMiddleware) {
        const middlewareFile = path.join(distDir, 'server', 'middleware.js')
        const { assets, assetsHashes } = await handleTraceFiles(
          middlewareFile,
          'neutral'
        )
        const functionConfig =
          functionsConfigManifest.functions['/_middleware'] || {}

        outputs.middleware = {
          pathname: '/_middleware',
          id: '/_middleware',
          sourcePage: 'middleware',
          assets,
          assetsHashes,
          type: AdapterOutputType.MIDDLEWARE,
          runtime: 'nodejs',
          filePath: middlewareFile,
          config: {
            matchers:
              functionConfig.matchers?.map((item) => {
                return {
                  source: item.originalSource,
                  sourceRegex: item.regexp,
                  has: item.has,
                  missing: [
                    ...(item.missing || []),
                    // always skip middleware for on-demand revalidate
                    {
                      type: 'header',
                      key: 'x-prerender-revalidate',
                      value: prerenderManifest.preview.previewModeId,
                    },
                  ],
                }
              }) || [],
          },
        } satisfies AdapterOutput['MIDDLEWARE']
      }
      const appOutputMap: Record<
        string,
        AdapterOutput['APP_PAGE'] | AdapterOutput['APP_ROUTE']
      > = {}
      const appDistDir = path.join(distDir, 'server', 'app')

      if (appPageKeys) {
        for (const page of appPageKeys) {
          if (middlewareManifest.functions.hasOwnProperty(page)) {
            continue
          }
          const normalizedPage = normalizeAppPath(page)

          // Skip static metadata routes only when they are prerendered.
          // Dynamic metadata routes (e.g. robots/sitemap using connection())
          // should remain app routes in adapter outputs.
          const isStaticMetadataRoute = isStaticMetadataFile(normalizedPage)
          const staticMetadataPrerenderPathname =
            getStaticMetadataPrerenderPathname(normalizedPage) ?? normalizedPage
          const isPrerenderedMetadataRoute =
            prerenderManifest.routes[staticMetadataPrerenderPathname] ||
            config.i18n?.locales?.some((locale) => {
              const localePathname = path.posix.join(
                '/',
                locale,
                staticMetadataPrerenderPathname.slice(1)
              )
              return prerenderManifest.routes[localePathname]
            })

          if (isStaticMetadataRoute && isPrerenderedMetadataRoute) {
            continue
          }
          const pageFile = path.join(appDistDir, `${page}.js`)
          let { assets, assetsHashes } = await handleTraceFiles(
            pageFile,
            'app'
          ).catch((err) => {
            Log.warn(`Failed to copy traced files for ${pageFile}`, err)
            return { assets: {}, assetsHashes: {} }
          })

          // If this is a parallel route we just need to merge
          // the assets as they share the same pathname
          const existingOutput = appOutputMap[normalizedPage]
          if (existingOutput) {
            Object.assign(existingOutput.assets, assets)
            Object.assign(existingOutput.assetsHashes, assetsHashes)
            await pushAsset(
              existingOutput.assets,
              existingOutput.assetsHashes,
              path.relative(repoRoot, pageFile),
              pageFile,
              bundler
            )
            continue
          }

          const functionConfig =
            functionsConfigManifest.functions[normalizedPage] || {}

          const output: AdapterOutput['APP_PAGE'] | AdapterOutput['APP_ROUTE'] =
            {
              pathname: normalizedPage,
              id: normalizedPage,
              sourcePage: page,
              assets,
              assetsHashes,
              type: page.endsWith('/route')
                ? AdapterOutputType.APP_ROUTE
                : AdapterOutputType.APP_PAGE,
              runtime: 'nodejs',
              filePath: pageFile,
              config: {
                maxDuration: functionConfig.maxDuration,
                preferredRegion: functionConfig.regions,
              },
            }
          appOutputMap[normalizedPage] = output

          if (output.type === AdapterOutputType.APP_PAGE) {
            outputs.appPages.push({
              ...output,
              pathname: normalizePagePath(output.pathname) + '.rsc',
              id: normalizePagePath(output.pathname) + '.rsc',
            })
            outputs.appPages.push(output)
          } else {
            outputs.appRoutes.push(output)
            outputs.appRoutes.push({
              ...output,
              pathname: normalizePagePath(output.pathname) + '.rsc',
              id: normalizePagePath(output.pathname) + '.rsc',
            })
          }
        }
      }

      const getParentOutput = (
        srcRoute: string,
        childRoute: string,
        allowMissing?: boolean
      ) => {
        const normalizedSrcRoute = normalizeLocalePath(
          srcRoute,
          config.i18n?.locales || []
        ).pathname
        const parentOutput =
          pageOutputMap[normalizedSrcRoute] || appOutputMap[normalizedSrcRoute]

        if (!parentOutput && !allowMissing) {
          console.error({
            appOutputs: Object.keys(appOutputMap),
            pageOutputs: Object.keys(pageOutputMap),
          })
          throw new Error(
            `Invariant: failed to find source route ${srcRoute} for prerender ${childRoute}`
          )
        }
        return parentOutput
      }

      const {
        prefetchSegmentDirSuffix,
        prefetchSegmentSuffix,
        varyHeader,
        didPostponeHeader,
        contentTypeHeader: rscContentTypeHeader,
      } = routesManifest.rsc

      const handleAppMeta = async (
        route: string,
        initialOutput: AdapterOutput['PRERENDER'],
        meta: AppRouteMeta,
        ctx: {
          htmlAllowQuery?: string[]
          dataAllowQuery?: string[]
        }
      ) => {
        if (meta.postponed && initialOutput.fallback) {
          initialOutput.fallback.postponedState = meta.postponed
        }

        if (meta?.segmentPaths) {
          const normalizedRoute = normalizePagePath(route)
          const segmentsDir = path.join(
            appDistDir,
            `${normalizedRoute}${prefetchSegmentDirSuffix}`
          )

          // If client param parsing is enabled, we follow the same logic as
          // the HTML allowQuery as it's already going to vary based on if
          // there's a static shell generated or if there's fallback root
          // params. If there are fallback root params, and we can serve a
          // fallback, then we should follow the same logic for the segment
          // prerenders.
          //
          // If client param parsing is not enabled, we have to use the
          // allowQuery because the segment payloads will contain dynamic
          // segment values.
          const segmentAllowQuery = routesManifest.rsc.clientParamParsing
            ? ctx.htmlAllowQuery
            : ctx.dataAllowQuery

          for (const segmentPath of meta.segmentPaths) {
            const outputSegmentPath =
              path.join(
                normalizedRoute + prefetchSegmentDirSuffix,
                segmentPath
              ) + prefetchSegmentSuffix

            // Only use the fallback value when the allowQuery is defined and
            // either: (1) it is empty, meaning segments do not vary by params,
            // or (2) client param parsing is enabled, meaning the segment
            // payloads are safe to reuse across params.
            const shouldAttachSegmentFallback =
              segmentAllowQuery &&
              (segmentAllowQuery.length === 0 ||
                routesManifest.rsc.clientParamParsing)

            const fallbackPathname = shouldAttachSegmentFallback
              ? path.join(segmentsDir, segmentPath + prefetchSegmentSuffix)
              : undefined

            outputs.prerenders.push({
              id: outputSegmentPath,
              pathname: outputSegmentPath,
              type: AdapterOutputType.PRERENDER,
              parentOutputId: initialOutput.parentOutputId,
              groupId: initialOutput.groupId,

              config: {
                ...initialOutput.config,
                bypassFor: undefined,
                partialFallback: initialOutput.config.partialFallback,
              },

              fallback: {
                filePath: fallbackPathname,
                postponedState: undefined,
                initialExpiration: initialOutput.fallback?.initialExpiration,
                initialRevalidate: initialOutput.fallback?.initialRevalidate,

                initialHeaders: {
                  ...meta.headers,
                  ...initialOutput.fallback?.initialHeaders,
                  vary: varyHeader,
                  'content-type': rscContentTypeHeader,
                  [didPostponeHeader]: '2',
                },
              },
            } satisfies AdapterOutput['PRERENDER'])
          }
        }
      }

      let prerenderGroupId = 1

      type AppRouteMeta = {
        segmentPaths?: string[]
        postponed?: string
        headers?: Record<string, string>
        status?: number
      }

      const getAppRouteMeta = async (
        route: string,
        isAppPage: boolean
      ): Promise<AppRouteMeta> => {
        const basename = route.endsWith('/') ? `${route}index` : route
        const meta: AppRouteMeta = isAppPage
          ? JSON.parse(
              await fs
                .readFile(path.join(appDistDir, `${basename}.meta`), 'utf8')
                .catch(() => '{}')
            )
          : {}

        if (meta.headers) {
          // normalize these for consistency
          for (const key of Object.keys(meta.headers)) {
            const keyLower = key.toLowerCase()
            let value = meta.headers[key]

            // normalize values to strings (e.g. set-cookie can be an array)
            if (Array.isArray(value)) {
              value = value.join(', ')
            } else if (typeof value !== 'string') {
              value = String(value)
            }

            if (keyLower !== key) {
              delete meta.headers[key]
            }
            meta.headers[keyLower] = value
          }
        }

        return meta
      }

      const filePathCache = new Map<string, Promise<boolean>>()
      const cachedFilePathCheck = async (filePath: string) => {
        if (filePathCache.has(filePath)) {
          return filePathCache.get(filePath)
        }
        const newCheck = fs
          .access(filePath)
          .then(() => true)
          .catch(() => false)
        filePathCache.set(filePath, newCheck)

        return newCheck
      }

      for (const route in prerenderManifest.routes) {
        const {
          initialExpireSeconds: initialExpiration,
          initialRevalidateSeconds: initialRevalidate,
          initialHeaders,
          initialStatus,
          dataRoute,
          prefetchDataRoute,
          renderingMode,
          allowHeader,
          experimentalBypassFor,
        } = prerenderManifest.routes[route]

        const srcRoute = prerenderManifest.routes[route].srcRoute || route
        const srcRouteInfo = prerenderManifest.dynamicRoutes[srcRoute]

        const isAppPage =
          Boolean(appOutputMap[srcRoute]) || srcRoute === '/_not-found'

        // if we already have 404.html favor that instead of
        // _not-found prerender
        if (srcRoute === '/_not-found' && hasStatic404) {
          continue
        }

        const isNotFoundTrue = prerenderManifest.notFoundRoutes.includes(route)

        let allowQuery: string[] | undefined
        const routeKeys = routesManifest.dynamicRoutes.find(
          (item) => item.page === srcRoute
        )?.routeKeys

        if (!isDynamicRoute(route)) {
          // for non-dynamic routes we use an empty array since
          // no query values bust the cache for non-dynamic prerenders
          // prerendered paths also do not pass allowQuery as they match
          // during handle: 'filesystem' so should not cache differently
          // by query values
          allowQuery = []
        } else if (routeKeys) {
          // if we have routeKeys in the routes-manifest we use those
          // for allowQuery for dynamic routes
          allowQuery = Object.values(routeKeys)
        }

        let filePath = path.join(
          isAppPage ? appDistDir : pagesDistDir,
          `${normalizePagePath(route)}.${isAppPage && !dataRoute ? 'body' : 'html'}`
        )

        // Check if this is a static metadata route (e.g., /favicon.ico, /icon.png, /opengraph-image.png)
        // These should be output as static files, not prerenders.
        if (isStaticMetadataFile(route)) {
          // For static metadata from app router, check if the .body file exists
          const staticMetadataFilePath = path.join(
            appDistDir,
            `${normalizePagePath(route)}.body`
          )
          if (await cachedFilePathCheck(staticMetadataFilePath)) {
            outputs.staticFiles.push({
              id: route,
              pathname: route,
              type: AdapterOutputType.STATIC_FILE,
              filePath: staticMetadataFilePath,
              immutableHash: undefined,
            })
            continue
          }
        }

        // we use the static 404 for notFound: true if available
        // if not we do a blocking invoke on first request
        if (isNotFoundTrue && hasStatic404) {
          const locale =
            config.i18n &&
            normalizeLocalePath(route, config.i18n?.locales).detectedLocale

          for (const currentFilePath of [
            path.join(pagesDistDir, locale || '', '404.html'),
            path.join(pagesDistDir, '404.html'),
          ]) {
            if (await cachedFilePathCheck(currentFilePath)) {
              filePath = currentFilePath
              break
            }
          }
        }

        const meta = await getAppRouteMeta(route, isAppPage)

        let htmlAllowQuery = allowQuery
        let dataAllowQuery = allowQuery
        const dataInitialHeaders: Record<string, string> = {}

        // We additionally vary based on if there's a postponed prerender
        // because if there isn't, then that means that we generated an
        // empty shell, and producing an empty RSC shell would be a waste.
        // If there is a postponed prerender, then the RSC shell would be
        // non-empty, and it would be valuable to also generate an empty
        // RSC shell.
        if (meta.postponed) {
          htmlAllowQuery = []

          if (routesManifest.rsc.dynamicRSCPrerender) {
            // If client param parsing is enabled, we follow the same logic as the
            // HTML allowQuery as it's already going to vary based on if there's a
            // static shell generated or if there's fallback root params. If there
            // are fallback root params, and we can serve a fallback, then we
            // should follow the same logic for the dynamic RSC routes.
            //
            // If client param parsing is not enabled, we have to use the
            // allowQuery because the RSC payloads will contain dynamic segment
            // values.
            if (routesManifest.rsc.clientParamParsing) {
              dataAllowQuery = htmlAllowQuery
            }
          }
        }

        if (renderingMode === RenderingMode.PARTIALLY_STATIC) {
          // Dynamic RSC requests cannot be cached, so we explicity set it
          // here to ensure that the response is not cached by the browser.
          dataInitialHeaders['cache-control'] =
            'private, no-store, no-cache, max-age=0, must-revalidate'
        }

        const initialOutput: AdapterOutput['PRERENDER'] = {
          id: route,
          type: AdapterOutputType.PRERENDER,
          pathname: route,
          parentOutputId:
            srcRoute === '/_not-found'
              ? srcRoute
              : getParentOutput(srcRoute, route).id,
          groupId: prerenderGroupId,

          pprChain:
            isAppPage && renderingMode === RenderingMode.PARTIALLY_STATIC
              ? {
                  headers: {
                    [NEXT_RESUME_HEADER]: '1',
                  },
                }
              : undefined,

          parentFallbackMode: srcRouteInfo?.fallback,

          fallback:
            !isNotFoundTrue || (isNotFoundTrue && hasStatic404)
              ? {
                  filePath,
                  postponedState: undefined,
                  initialStatus:
                    initialStatus ??
                    meta.status ??
                    (isNotFoundTrue ? 404 : undefined),
                  initialHeaders: {
                    ...initialHeaders,
                    vary: varyHeader,
                    'content-type': HTML_CONTENT_TYPE_HEADER,
                    ...meta.headers,
                  },
                  initialExpiration,
                  initialRevalidate:
                    typeof initialRevalidate === 'undefined'
                      ? 1
                      : initialRevalidate,
                }
              : undefined,
          config: {
            allowQuery,
            allowHeader,
            renderingMode,
            bypassFor:
              isAppPage && srcRoute !== '/_not-found'
                ? experimentalBypassFor
                : undefined,
            bypassToken: prerenderManifest.preview.previewModeId,
          },
        }
        outputs.prerenders.push(initialOutput)

        if (!isAppPage && appPageKeys && appPageKeys.length > 0) {
          const rscPage = `${route === '/' ? '/index' : route}.rsc`
          outputs.staticFiles.push({
            id: rscPage,
            pathname: rscPage,
            type: AdapterOutputType.STATIC_FILE,
            filePath: rscFallbackPath,
            immutableHash: undefined,
          })
        }

        if (dataRoute) {
          let dataFilePath: string | undefined = path.join(
            pagesDistDir,
            `${normalizePagePath(route)}.json`
          )
          let postponed = meta.postponed

          const dataRouteToUse =
            renderingMode === RenderingMode.PARTIALLY_STATIC &&
            prefetchDataRoute
              ? prefetchDataRoute
              : dataRoute

          if (isAppPage) {
            // When experimental PPR is enabled, we expect that the data
            // that should be served as a part of the prerender should
            // be from the prefetch data route. If this isn't enabled
            // for ppr, the only way to get the data is from the data
            // route.
            dataFilePath = path.join(
              appDistDir,
              (dataRouteToUse ?? dataRoute)?.replace(/^\//, '')
            )
          }

          if (
            renderingMode === RenderingMode.PARTIALLY_STATIC &&
            !(await cachedFilePathCheck(dataFilePath))
          ) {
            outputs.prerenders.push({
              ...initialOutput,
              id: dataRoute,
              pathname: dataRoute,
              fallback: {
                ...initialOutput.fallback,
                postponedState: postponed,
                initialStatus: undefined,
                initialHeaders: {
                  ...initialOutput.fallback?.initialHeaders,
                  ...dataInitialHeaders,
                  'content-type': isAppPage
                    ? rscContentTypeHeader
                    : JSON_CONTENT_TYPE_HEADER,
                },
                filePath: undefined,
              },
            })
          } else {
            outputs.prerenders.push({
              ...initialOutput,
              id: dataRoute,
              pathname: dataRoute,
              fallback: isNotFoundTrue
                ? undefined
                : {
                    ...initialOutput.fallback,
                    initialStatus: undefined,
                    initialHeaders: {
                      ...initialOutput.fallback?.initialHeaders,
                      ...dataInitialHeaders,
                      'content-type': isAppPage
                        ? rscContentTypeHeader
                        : JSON_CONTENT_TYPE_HEADER,
                    },
                    postponedState: undefined,
                    filePath: dataFilePath,
                  },
            })
          }
        }

        if (isAppPage) {
          await handleAppMeta(route, initialOutput, meta, {
            htmlAllowQuery,
            dataAllowQuery,
          })
        }
        prerenderGroupId += 1
      }

      for (const dynamicRoute in prerenderManifest.dynamicRoutes) {
        if (isStaticMetadataFile(dynamicRoute)) {
          continue
        }

        const {
          fallback,
          fallbackExpire,
          fallbackRevalidate,
          fallbackHeaders,
          fallbackStatus,
          fallbackSourceRoute,
          fallbackRootParams,
          remainingPrerenderableParams,
          allowHeader,
          dataRoute,
          renderingMode,
          experimentalBypassFor,
        } = prerenderManifest.dynamicRoutes[dynamicRoute]

        const srcRoute = fallbackSourceRoute || dynamicRoute
        const parentOutput = getParentOutput(srcRoute, dynamicRoute)
        const isAppPage = Boolean(appOutputMap[srcRoute])

        const meta = await getAppRouteMeta(dynamicRoute, isAppPage)
        const routeKeys =
          routesManifest.dynamicRoutes.find(
            (item) => item.page === dynamicRoute
          )?.routeKeys || {}
        const allowQuery = Object.values(routeKeys)
        const partialFallback =
          isAppPage &&
          remainingPrerenderableParams !== undefined &&
          remainingPrerenderableParams.length > 0 &&
          renderingMode === RenderingMode.PARTIALLY_STATIC &&
          typeof fallback === 'string' &&
          Boolean(meta.postponed)

        const canEmitPartialFallback =
          partialFallback && fallbackRootParams?.length === 0
        let htmlAllowQuery = allowQuery

        // We only want to vary on the shell contents if there is a fallback
        // present and able to be served.
        if (typeof fallback === 'string') {
          if (fallbackRootParams && fallbackRootParams.length > 0) {
            htmlAllowQuery = fallbackRootParams as string[]
          }

          // We additionally vary based on if there's a postponed prerender
          // because if there isn't, then that means that we generated an
          // empty shell, and producing an empty RSC shell would be a waste.
          // If there is a postponed prerender, then the RSC shell would be
          // non-empty, and it would be valuable to also generate an empty
          // RSC shell.
          else if (meta.postponed) {
            // If there's postponed fallback content, we usually collapse to a shared shell (`[]`).
            // For partial fallbacks in cache components, keep only the
            // params that can still complete this shell.
            const remainingPrerenderableQueryKeys = new Set(
              (remainingPrerenderableParams ?? []).map(
                (param) => `${NEXT_QUERY_PARAM_PREFIX}${param.paramName}`
              )
            )
            htmlAllowQuery =
              canEmitPartialFallback && routesManifest.rsc.clientParamParsing
                ? Object.values(routeKeys).filter((routeKey) =>
                    remainingPrerenderableQueryKeys.has(routeKey)
                  )
                : []
          }
        }

        const initialOutput: AdapterOutput['PRERENDER'] = {
          id: dynamicRoute,
          type: AdapterOutputType.PRERENDER,
          pathname: dynamicRoute,
          parentOutputId: parentOutput.id,
          groupId: prerenderGroupId,

          pprChain:
            isAppPage && renderingMode === RenderingMode.PARTIALLY_STATIC
              ? {
                  headers: {
                    [NEXT_RESUME_HEADER]: '1',
                  },
                }
              : undefined,

          fallback:
            typeof fallback === 'string'
              ? {
                  filePath: path.join(
                    isAppPage ? appDistDir : pagesDistDir,
                    // app router dynamic route fallbacks don't have the
                    // extension so ensure it's added here
                    fallback.endsWith('.html') ? fallback : `${fallback}.html`
                  ),
                  postponedState: undefined,
                  initialStatus: fallbackStatus ?? meta.status,
                  initialHeaders: {
                    ...fallbackHeaders,
                    ...(appPageKeys?.length ? { vary: varyHeader } : {}),
                    'content-type': HTML_CONTENT_TYPE_HEADER,
                    ...meta.headers,
                  },
                  initialExpiration: fallbackExpire,
                  initialRevalidate: fallbackRevalidate ?? 1,
                }
              : undefined,
          config: {
            allowQuery: htmlAllowQuery,
            allowHeader,
            renderingMode,
            partialFallback: canEmitPartialFallback || undefined,
            bypassFor: isAppPage ? experimentalBypassFor : undefined,
            bypassToken: prerenderManifest.preview.previewModeId,
          },
        }

        if (!config.i18n || isAppPage) {
          outputs.prerenders.push(initialOutput)

          if (
            !isAppPage &&
            fallback !== false &&
            appPageKeys &&
            appPageKeys.length > 0
          ) {
            const rscPage = `${srcRoute === '/' ? '/index' : srcRoute}.rsc`
            outputs.staticFiles.push({
              id: rscPage,
              pathname: rscPage,
              type: AdapterOutputType.STATIC_FILE,
              filePath: rscFallbackPath,
              immutableHash: undefined,
            })
          }

          let dataAllowQuery = allowQuery
          const dataInitialHeaders: Record<string, string> = {}

          if (meta.postponed && routesManifest.rsc.dynamicRSCPrerender) {
            // If client param parsing is enabled, we follow the same logic as the
            // HTML allowQuery as it's already going to vary based on if there's a
            // static shell generated or if there's fallback root params. If there
            // are fallback root params, and we can serve a fallback, then we
            // should follow the same logic for the dynamic RSC routes.
            //
            // If client param parsing is not enabled, we have to use the
            // allowQuery because the RSC payloads will contain dynamic segment
            // values.
            if (routesManifest.rsc.clientParamParsing) {
              dataAllowQuery = htmlAllowQuery
            }
          }

          if (renderingMode === RenderingMode.PARTIALLY_STATIC) {
            // Dynamic RSC requests cannot be cached, so we explicity set it
            // here to ensure that the response is not cached by the browser.
            dataInitialHeaders['cache-control'] =
              'private, no-store, no-cache, max-age=0, must-revalidate'
          }

          if (isAppPage) {
            await handleAppMeta(dynamicRoute, initialOutput, meta, {
              htmlAllowQuery,
              dataAllowQuery,
            })
          }

          if (renderingMode === RenderingMode.PARTIALLY_STATIC) {
            outputs.prerenders.push({
              ...initialOutput,
              id: `${dynamicRoute}.rsc`,
              pathname: `${dynamicRoute}.rsc`,
              fallback: {
                ...initialOutput.fallback,
                filePath: undefined,
                postponedState: meta.postponed,
                initialStatus: undefined,
                initialHeaders: {
                  ...initialOutput.fallback?.initialHeaders,
                  ...dataInitialHeaders,
                  'content-type': isAppPage
                    ? rscContentTypeHeader
                    : JSON_CONTENT_TYPE_HEADER,
                },
              },

              config: {
                ...initialOutput.config,
                allowQuery: dataAllowQuery,
                partialFallback: undefined,
              },
            })
          } else if (dataRoute) {
            outputs.prerenders.push({
              ...initialOutput,
              id: dataRoute,
              pathname: dataRoute,
              fallback: undefined,
              config: {
                ...initialOutput.config,
                partialFallback: undefined,
              },
            })
          }
          prerenderGroupId += 1
        } else {
          for (const locale of config.i18n.locales) {
            const currentOutput: AdapterOutput['PRERENDER'] = {
              ...initialOutput,
              pathname: path.posix.join(`/${locale}`, initialOutput.pathname),
              id: path.posix.join(`/${locale}`, initialOutput.id),
              fallback:
                typeof fallback === 'string'
                  ? {
                      ...initialOutput.fallback,
                      initialStatus: undefined,
                      postponedState: undefined,
                      filePath: path.join(
                        pagesDistDir,
                        locale,
                        // app router dynamic route fallbacks don't have the
                        // extension so ensure it's added here
                        fallback.endsWith('.html')
                          ? fallback
                          : `${fallback}.html`
                      ),
                    }
                  : undefined,
              groupId: prerenderGroupId,
            }
            outputs.prerenders.push(currentOutput)

            if (
              !isAppPage &&
              fallback !== false &&
              appPageKeys &&
              appPageKeys.length > 0
            ) {
              const rscPage = `${path.posix.join(`/${locale}`, initialOutput.pathname)}.rsc`
              outputs.staticFiles.push({
                id: rscPage,
                pathname: rscPage,
                type: AdapterOutputType.STATIC_FILE,
                filePath: rscFallbackPath,
                immutableHash: undefined,
              })
            }

            if (dataRoute) {
              const dataPathname = path.posix.join(
                `/_next/data`,
                buildId,
                locale,
                dynamicRoute + '.json'
              )
              outputs.prerenders.push({
                ...initialOutput,
                id: dataPathname,
                pathname: dataPathname,
                // data route doesn't have skeleton fallback
                fallback: undefined,
                config: {
                  ...initialOutput.config,
                  partialFallback: undefined,
                },
                groupId: prerenderGroupId,
              })
            }
            prerenderGroupId += 1
          }
        }
      }

      // ensure 404
      const staticErrorDocs = [
        ...(hasStatic404 ? ['/404'] : []),
        ...(hasStatic500 ? ['/500'] : []),
      ]

      for (const errorDoc of staticErrorDocs) {
        const errorDocPath = path.posix.join(
          '/',
          config.i18n?.defaultLocale || '',
          errorDoc
        )

        if (!prerenderManifest.routes[errorDocPath]) {
          for (const currentDocPath of [
            errorDocPath,
            ...(config.i18n?.locales?.map((locale) =>
              path.posix.join('/', locale, errorDoc)
            ) || []),
          ]) {
            const currentFilePath = path.join(
              pagesDistDir,
              `${currentDocPath}.html`
            )
            if (await cachedFilePathCheck(currentFilePath)) {
              outputs.staticFiles.push({
                pathname: currentDocPath,
                id: currentDocPath,
                type: AdapterOutputType.STATIC_FILE,
                filePath: currentFilePath,
                immutableHash: undefined,
              })
            }
          }
        }
      }
    }

    normalizePathnames(config, outputs)

    const dynamicRoutes: DynamicRouteItem[] = []
    const dynamicDataRoutes: DynamicRouteItem[] = []
    const dynamicSegmentRoutes: DynamicRouteItem[] = []

    const getDestinationQuery = (routeKeys: Record<string, string>) => {
      const items = Object.entries(routeKeys ?? {})
      if (items.length === 0) return ''

      return '?' + items.map(([key, value]) => `${value}=$${key}`).join('&')
    }

    const fallbackFalseHasCondition: RouteHas[] = [
      {
        type: 'cookie',
        key: '__prerender_bypass',
        value: prerenderManifest.preview.previewModeId,
      },
      {
        type: 'cookie',
        key: '__next_preview_data',
      },
    ]

    for (const route of routesManifest.dynamicRoutes) {
      const shouldLocalize = Boolean(config.i18n) && !isAPIRoute(route.page)

      const routeRegex = getNamedRouteRegex(route.page, {
        prefixRouteKeys: true,
      })

      const isFallbackFalse =
        prerenderManifest.dynamicRoutes[route.page]?.fallback === false

      const sourceRegex = routeRegex.namedRegex.replace(
        '^',
        `^${config.basePath && config.basePath !== '/' ? path.posix.join('/', config.basePath || '') : ''}[/]?${shouldLocalize ? '(?<nextLocale>[^/]{1,})' : ''}`
      )
      const destination =
        path.posix.join(
          '/',
          config.basePath,
          shouldLocalize ? '/$nextLocale' : '',
          route.page
        ) + getDestinationQuery(route.routeKeys)

      if (appPageKeys && appPageKeys.length > 0) {
        dynamicRoutes.push({
          source: route.page + '.rsc',
          sourceRegex: sourceRegex.replace(
            new RegExp(escapeStringRegexp('(?:/)?$')),
            '(?<rscSuffix>\\.rsc|\\.segments/.+\\.segment\\.rsc)(?:/)?$'
          ),
          destination: destination?.replace(/($|\?)/, '$rscSuffix$1'),
          has:
            isFallbackFalse && !pageKeys.includes(route.page)
              ? fallbackFalseHasCondition
              : undefined,
          missing: undefined,
        })
      }

      // needs basePath and locale handling if pages router
      dynamicRoutes.push({
        source: route.page,
        sourceRegex,
        destination,
        has: isFallbackFalse ? fallbackFalseHasCondition : undefined,
        missing: undefined,
      })

      for (const segmentRoute of route.prefetchSegmentDataRoutes || []) {
        dynamicSegmentRoutes.push({
          source: route.page,
          sourceRegex: segmentRoute.source.replace(
            '^',
            `^${config.basePath && config.basePath !== '/' ? path.posix.join('/', config.basePath || '') : ''}[/]?`
          ),
          destination: path.posix.join(
            '/',
            config.basePath,
            segmentRoute.destination +
              getDestinationQuery(segmentRoute.routeKeys)
          ),
          has: undefined,
          missing: undefined,
        })
      }
    }

    const needsMiddlewareResolveRoutes =
      outputs.middleware && outputs.pages.length > 0

    const dataRoutePages = new Set([
      ...routesManifest.dataRoutes.map((item) => item.page),
    ])
    const sortedDataPages = sortSortableRoutes([
      ...(needsMiddlewareResolveRoutes
        ? [...staticPages].map((page) => ({ sourcePage: page, page }))
        : []),
      ...routesManifest.dataRoutes.map((item) => ({
        sourcePage: item.page,
        page: item.page,
      })),
    ])

    for (const { page } of sortedDataPages) {
      if (needsMiddlewareResolveRoutes || isDynamicRoute(page)) {
        const shouldLocalize = config.i18n
        const isFallbackFalse =
          prerenderManifest.dynamicRoutes[page]?.fallback === false

        const routeRegex = getNamedRouteRegex(page + '.json', {
          prefixRouteKeys: true,
          includeSuffix: true,
        })
        const isDataRoute = dataRoutePages.has(page)

        const destination = path.posix.join(
          '/',
          config.basePath,
          ...(isDataRoute ? [`_next/data`, buildId] : ''),
          ...(page === '/'
            ? [shouldLocalize ? '$nextLocale.json' : 'index.json']
            : [
                shouldLocalize ? '$nextLocale' : '',
                page +
                  (isDataRoute ? '.json' : '') +
                  getDestinationQuery(routeRegex.routeKeys || {}),
              ])
        )

        dynamicDataRoutes.push({
          source: page,
          sourceRegex:
            shouldLocalize && page === '/'
              ? '^' +
                path.posix.join(
                  '/',
                  config.basePath,
                  '_next/data',
                  escapeStringRegexp(buildId),
                  '(?<nextLocale>[^/]{1,}).json'
                )
              : routeRegex.namedRegex.replace(
                  '^',
                  `^${path.posix.join(
                    '/',
                    config.basePath,
                    `_next/data`,
                    escapeStringRegexp(buildId)
                  )}[/]?${shouldLocalize ? '(?<nextLocale>[^/]{1,})' : ''}`
                ),
          destination,
          has: isFallbackFalse ? fallbackFalseHasCondition : undefined,
          missing: undefined,
        })
      }
    }

    const buildRewriteItem = (route: ManifestRewriteRoute): RewriteItem => {
      const converted = convertRewrites([route], ['nextInternalLocale'])[0]
      const regex = converted.src || route.regex

      return {
        source: route.source,
        sourceRegex: route.internal ? regex : modifyRouteRegex(regex),
        destination: converted.dest || route.destination,
        has: route.has,
        missing: route.missing,
      } satisfies Route
    }

    const buildRouteFromHeader = (route: ManifestHeaderRoute): Route => {
      const converted = convertHeaders([route])[0]
      const regex = converted.src || route.regex
      return {
        source: route.source,
        sourceRegex: route.internal ? regex : modifyRouteRegex(regex),
        headers: 'headers' in converted ? converted.headers || {} : {},
        has: route.has,
        missing: route.missing,
        priority: route.internal || undefined,
      } satisfies Route
    }

    try {
      Log.info(`Running onBuildComplete from ${adapterMod.name}`)

      const combinedDynamicRoutes = [
        ...dynamicDataRoutes,
        ...dynamicSegmentRoutes,
        ...dynamicRoutes,
      ] satisfies Route[]

      const rewrites = {
        beforeFiles: routesManifest.rewrites.beforeFiles.map(buildRewriteItem),
        afterFiles: routesManifest.rewrites.afterFiles.map(buildRewriteItem),
        fallback: routesManifest.rewrites.fallback.map(buildRewriteItem),
      }

      const redirects = routesManifest.redirects.map((route) => {
        const converted = convertRedirects([route], 307)[0]
        const regex = converted.src || route.regex

        return {
          source: route.source,
          sourceRegex: route.internal ? regex : modifyRouteRegex(regex),
          headers: 'headers' in converted ? converted.headers || {} : {},
          status: converted.status || getRedirectStatus(route),
          has: route.has,
          missing: route.missing,
          priority: route.internal || undefined,
        } satisfies Route
      })

      const headers = routesManifest.headers.map((route) =>
        buildRouteFromHeader(route)
      )
      const onMatchHeaders = routesManifest.onMatchHeaders.map((route) =>
        buildRouteFromHeader(route)
      )

      await adapterMod.onBuildComplete({
        routing: {
          beforeMiddleware: [...headers, ...redirects],
          middlewareMatchers:
            outputs.middleware?.config.matchers?.map((matcher) => ({
              source: matcher.source,
              sourceRegex: matcher.sourceRegex,
              has: matcher.has,
              missing: matcher.missing,
            })) ?? [],
          beforeFiles: rewrites.beforeFiles,
          afterFiles: rewrites.afterFiles,
          dynamicRoutes: combinedDynamicRoutes,
          onMatch: [
            {
              // This ensures we only match known emitted-by-Next.js files and not
              // user-emitted files which may be missing a hash in their filename.
              sourceRegex: `${path.posix.join(config.basePath || '/', '_next/static', `/(?:[^/]+/pages|pages|chunks|immutable|runtime|css|image|media|${escapeStringRegexp(buildId)})/.+`)}`,
              // Next.js assets contain a hash or entropy in their filenames, so they
              // are guaranteed to be unique and cacheable indefinitely.
              headers: {
                'cache-control': `public,max-age=${CACHE_ONE_YEAR_SECONDS},immutable`,
              },
            },
            ...onMatchHeaders,
          ],
          fallback: rewrites.fallback,
          shouldNormalizeNextData: !!needsMiddlewareResolveRoutes,
          rsc: generateRoutesManifest({
            appType,
            pageKeys: {
              pages: pageKeys as string[],
              app: appPageKeys as string[],
            },
            config,
            redirects: [],
            headers: [],
            onMatchHeaders: [],
            rewrites,
            restrictedRedirectPaths: [],
            isAppPPREnabled: config.cacheComponents,
          }).routesManifest.rsc,
        },
        outputs,

        config,
        distDir,
        buildId,
        nextVersion,
        projectDir: dir,
        repoRoot: repoRoot,
      })
    } catch (err) {
      Log.error(`Failed to run onBuildComplete from ${adapterMod.name}`)
      throw err
    }
  }
}

async function getSharedNodeAssets({
  dir,
  bundler,
  distDir,
  repoRoot,
  outputFileTracingRoot,
  requiredServerFiles,
  hasInstrumentationHook,
  config,
}: {
  dir: string
  bundler: Bundler
  distDir: string
  repoRoot: string
  outputFileTracingRoot: string
  requiredServerFiles: string[]
  hasInstrumentationHook: boolean
  config: NextConfigComplete
}) {
  const sharedNodeAssets: Record<string, string> = {}
  const sharedNodeAssetsHashes: Record<string, string> = {}
  const pagesSharedNodeAssets: Record<string, string> = {}
  const pagesSharedNodeAssetsHashes: Record<string, string> = {}
  const appPagesSharedNodeAssets: Record<string, string> = {}
  const appPagesSharedNodeAssetsHashes: Record<string, string> = {}

  const moduleTypes = ['app-page', 'pages'] as const

  for (const type of moduleTypes) {
    const currentDependencies: string[] = []
    const modulePath = require.resolve(
      `next/dist/server/route-modules/${type}/module.compiled`
    )
    currentDependencies.push(modulePath)

    const contextDir = path.join(
      path.dirname(modulePath),
      'vendored',
      'contexts'
    )

    for (const item of await fs.readdir(contextDir)) {
      if (item.match(/\.(mjs|cjs|js)$/)) {
        currentDependencies.push(path.join(contextDir, item))
      }
    }

    for (const dependencyPath of currentDependencies) {
      const rootRelativeFilePath = path.relative(repoRoot, dependencyPath)

      if (type === 'pages') {
        await pushAsset(
          pagesSharedNodeAssets,
          pagesSharedNodeAssetsHashes,
          rootRelativeFilePath,
          path.join(repoRoot, rootRelativeFilePath),
          bundler
        )
      } else {
        await pushAsset(
          appPagesSharedNodeAssets,
          appPagesSharedNodeAssetsHashes,
          rootRelativeFilePath,
          path.join(repoRoot, rootRelativeFilePath),
          bundler
        )
      }
    }
  }

  // add "next/setup-node-env" stub so it can be required top-level
  // TODO: should we make this always available without adapters
  const setupNodeStubPath = path.join(
    path.dirname(require.resolve('next/package.json')),
    'setup-node-env.js'
  )
  await pushAsset(
    sharedNodeAssets,
    sharedNodeAssetsHashes,
    path.relative(repoRoot, setupNodeStubPath),
    require.resolve('next/dist/build/adapter/setup-node-env.external'),
    bundler
  )

  // Turbopack handles this automatically and these files are listed in the nft.json files.
  if (bundler !== Bundler.Turbopack) {
    const { nodeFileTrace } =
      require('next/dist/compiled/@vercel/nft') as typeof import('next/dist/compiled/@vercel/nft')
    const { makeIgnoreFn } =
      require('../collect-build-traces') as typeof import('../collect-build-traces')

    const sharedTraceIgnores = [
      '**/next/dist/compiled/next-server/**/*.dev.js',
      '**/next/dist/compiled/webpack/*',
      '**/node_modules/webpack5/**/*',
      '**/next/dist/server/lib/route-resolver*',
      'next/dist/compiled/semver/semver/**/*.js',
      '**/node_modules/react{,-dom,-dom-server-turbopack}/**/*.development.js',
      '**/*.d.ts',
      '**/*.map',
      '**/next/dist/pages/**/*',
      '**/node_modules/sharp/**/*',
      '**/@img/sharp-libvips*/**/*',
      '**/next/dist/compiled/edge-runtime/**/*',
      '**/next/dist/server/web/sandbox/**/*',
      '**/next/dist/server/post-process.js',
    ]
    const sharedIgnoreFn = makeIgnoreFn(
      outputFileTracingRoot,
      sharedTraceIgnores
    )

    // These are modules that are necessary for bootstrapping node env
    const necessaryNodeDependencies = [
      require.resolve('next/dist/server/node-environment'),
      require.resolve('next/dist/server/require-hook'),
      require.resolve('next/dist/server/node-polyfill-crypto'),
      ...Object.values(defaultOverrides).filter((item) => path.extname(item)),
    ]

    const { cacheHandler, cacheHandlers } = config
    // ensure we trace any dependencies needed for a custom incremental cache handler
    if (cacheHandler) {
      const resolvedPath = resolveCacheHandlerPathToFilesystem(cacheHandler)
      necessaryNodeDependencies.push(
        require.resolve(
          path.isAbsolute(resolvedPath)
            ? resolvedPath
            : path.join(dir, resolvedPath)
        )
      )
    }
    if (cacheHandlers) {
      for (const handlerPath of Object.values(cacheHandlers)) {
        if (handlerPath) {
          const resolvedPath = resolveCacheHandlerPathToFilesystem(handlerPath)
          necessaryNodeDependencies.push(
            require.resolve(
              path.isAbsolute(resolvedPath)
                ? resolvedPath
                : path.join(dir, resolvedPath)
            )
          )
        }
      }
    }

    const { fileList, esmFileList } = await nodeFileTrace(
      necessaryNodeDependencies,
      {
        base: outputFileTracingRoot,
        ignore: sharedIgnoreFn,
        moduleSyncCatchall: true,
      }
    )
    esmFileList.forEach((item) => fileList.add(item))

    for (const tracingRootRelativeFilePath of fileList) {
      // nodeFileTrace returns paths relative to `base` (outputFileTracingRoot),
      // so resolve to an absolute path and re-relativize against repoRoot, which
      // is the root all adapter output keys/source paths are based on.
      const absoluteFilePath = path.join(
        outputFileTracingRoot,
        tracingRootRelativeFilePath
      )
      await pushAsset(
        sharedNodeAssets,
        sharedNodeAssetsHashes,
        path.relative(repoRoot, absoluteFilePath),
        absoluteFilePath,
        bundler
      )
    }
  }

  if (hasInstrumentationHook) {
    const { entryHash: instrumentationEntryHash } = await loadNFT(
      sharedNodeAssets,
      sharedNodeAssetsHashes,
      repoRoot,
      path.join(distDir, 'server', 'instrumentation.js.nft.json')
    )

    const fileOutputPath = path.relative(
      repoRoot,
      path.join(distDir, 'server', 'instrumentation.js')
    )
    await pushAsset(
      sharedNodeAssets,
      sharedNodeAssetsHashes,
      fileOutputPath,
      path.join(distDir, 'server', 'instrumentation.js'),
      bundler,
      instrumentationEntryHash
    )
  }

  // Run after hasInstrumentationHook, which inserts the NFT-provided file hash for .next/server/instrumentation.js
  for (const file of requiredServerFiles) {
    // add to shared node assets
    const filePath = path.join(dir, file)
    const fileOutputPath = path.relative(repoRoot, filePath)
    await pushAsset(
      sharedNodeAssets,
      sharedNodeAssetsHashes,
      fileOutputPath,
      filePath,
      bundler
    )
  }

  return {
    sharedNodeAssets,
    sharedNodeAssetsHashes,
    pagesSharedNodeAssets,
    pagesSharedNodeAssetsHashes,
    appPagesSharedNodeAssets,
    appPagesSharedNodeAssetsHashes,
  }
}

async function pushAsset(
  assets: Record<string, string>,
  assetsHashes: Record<string, string>,
  targetFilePath: string,
  sourceFilePath: string,
  bundler: Bundler,
  hashOverride?: string
) {
  if (!(targetFilePath in assets)) {
    assets[targetFilePath] = sourceFilePath
    if (bundler === Bundler.Turbopack) {
      assetsHashes[targetFilePath] =
        hashOverride ?? (await hashFile(sourceFilePath))
    }
  }
}

async function loadNFT(
  assets: Record<string, string>,
  assetsHashes: Record<string, string>,
  repoRoot: string,
  traceFilePath: string
): Promise<{ entryHash?: string }> {
  const { files, fileHashes, entryHash } = (await JSON.parse(
    await fs.readFile(traceFilePath, 'utf8')
  )) as {
    files: string[]
    fileHashes?: string[]
    entryHash?: string
  }

  const traceFileDir = path.dirname(traceFilePath)
  for (let i = 0; i < files.length; i++) {
    const relativeFile = files[i]
    const contentHash = fileHashes?.[i]
    const tracedFilePath = path.join(traceFileDir, relativeFile)
    const fileOutputPath = path.relative(repoRoot, tracedFilePath)
    assets[fileOutputPath] = tracedFilePath
    if (contentHash) {
      assetsHashes[fileOutputPath] = contentHash
    }
  }
  return { entryHash }
}

async function hashFile(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256')
  try {
    // Try symlink first, since readFile just transparently resolves those (or fails if it's a
    // directory symlink).
    const linkTarget = await fs.readlink(filePath)
    hash.update('link')
    hash.update(linkTarget)
  } catch (e: any) {
    if (e.code === 'EINVAL') {
      // Not a symlink
      hash.update('file:')
      hash.update(await fs.readFile(filePath))
    } else {
      throw e
    }
  }
  return hash.digest('hex')
}
