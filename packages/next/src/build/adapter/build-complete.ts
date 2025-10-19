import path from 'path'
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
import type { ProxyMatcher } from '../analysis/get-page-static-info'
import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'
import { AdapterOutputType, type PHASE_TYPE } from '../../shared/lib/constants'
import { normalizePagePath } from '../../shared/lib/page-path/normalize-page-path'

import type {
  MiddlewareManifest,
  EdgeFunctionDefinition,
} from '../webpack/plugins/middleware-plugin'

import type {
  ManifestRoute,
  RoutesManifest,
  PrerenderManifest,
  ManifestHeaderRoute,
  ManifestRewriteRoute,
  ManifestRedirectRoute,
  FunctionsConfigManifest,
} from '..'

import {
  HTML_CONTENT_TYPE_HEADER,
  JSON_CONTENT_TYPE_HEADER,
  NEXT_RESUME_HEADER,
} from '../../lib/constants'
import { normalizeLocalePath } from '../../shared/lib/i18n/normalize-locale-path'
import { addPathPrefix } from '../../shared/lib/router/utils/add-path-prefix'

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
   * runtime is which runtime the entrypoint is built for
   */
  runtime: 'nodejs' | 'edge'
  /**
   * assets are all necessary traced assets that could be
   * loaded by the output to handle a request e.g. traced
   * node_modules or necessary manifests for Next.js.
   * The key is the relative path from the repo root and the value
   * is the absolute path to the file
   */
  assets: Record<string, string>

  /**
   * wasmAssets are bundled wasm files with mapping of name
   * to filePath on disk
   */
  wasmAssets?: Record<string, string>

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
     * fallback is initial cache data generated during build for a prerender
     */
    fallback?: {
      /**
       * path to the fallback file can be HTML/JSON/RSC
       */
      filePath: string
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
      postponedState?: string
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
       * matchers are the configured matchers for middleware
       */
      matchers?: ProxyMatcher[]

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
    id: string
    filePath: string
    pathname: string
    type: AdapterOutputType.STATIC_FILE
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
      matchers?: ProxyMatcher[]
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
    }
  ) => Promise<NextConfigComplete> | NextConfigComplete
  onBuildComplete?: (ctx: {
    routes: {
      headers: Array<ManifestHeaderRoute>
      redirects: Array<ManifestRedirectRoute>
      rewrites: {
        beforeFiles: Array<ManifestRewriteRoute>
        afterFiles: Array<ManifestRewriteRoute>
        fallback: Array<ManifestRewriteRoute>
      }
      dynamicRoutes: ReadonlyArray<ManifestRoute>
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
      ...(outputs.middleware ? [outputs.middleware] : []),
    ]) {
      output.pathname = addPathPrefix(output.pathname, config.basePath)
    }
  }
}

export async function handleBuildComplete({
  dir,
  config,
  configOutDir,
  distDir,
  pageKeys,
  tracingRoot,
  adapterPath,
  appPageKeys,
  staticPages,
  nextVersion,
  hasStatic404,
  routesManifest,
  hasNodeMiddleware,
  prerenderManifest,
  middlewareManifest,
  requiredServerFiles,
  hasInstrumentationHook,
  functionsConfigManifest,
}: {
  dir: string
  distDir: string
  configOutDir: string
  adapterPath: string
  tracingRoot: string
  nextVersion: string
  hasStatic404: boolean
  staticPages: Set<string>
  hasNodeMiddleware: boolean
  config: NextConfigComplete
  pageKeys: readonly string[]
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
    Log.info(`Running onBuildComplete from ${adapterMod.name}`)

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
        } satisfies AdapterOutput['STATIC_FILE'])
      }
    } else {
      const staticFiles = await recursiveReadDir(path.join(distDir, 'static'))

      for (const file of staticFiles) {
        const pathname = path.posix.join('/_next/static', file)
        const filePath = path.join(distDir, 'static', file)
        outputs.staticFiles.push({
          type: AdapterOutputType.STATIC_FILE,
          id: path.join('static', file),
          pathname,
          filePath,
        })
      }

      const sharedNodeAssets: Record<string, string> = {}

      for (const file of requiredServerFiles) {
        // add to shared node assets
        const filePath = path.join(dir, file)
        const fileOutputPath = path.relative(tracingRoot, filePath)
        sharedNodeAssets[fileOutputPath] = filePath
      }

      if (hasInstrumentationHook) {
        const assets = await handleTraceFiles(
          path.join(distDir, 'server', 'instrumentation.js.nft.json')
        )
        const fileOutputPath = path.relative(
          tracingRoot,
          path.join(distDir, 'server', 'instrumentation.js')
        )
        sharedNodeAssets[fileOutputPath] = path.join(
          distDir,
          'server',
          'instrumentation.js'
        )
        Object.assign(sharedNodeAssets, assets)
      }

      async function handleTraceFiles(
        traceFilePath: string
      ): Promise<Record<string, string>> {
        const assets: Record<string, string> = Object.assign(
          {},
          sharedNodeAssets
        )
        const traceData = JSON.parse(
          await fs.readFile(traceFilePath, 'utf8')
        ) as {
          files: string[]
        }
        const traceFileDir = path.dirname(traceFilePath)

        for (const relativeFile of traceData.files) {
          const tracedFilePath = path.join(traceFileDir, relativeFile)
          const fileOutputPath = path.relative(tracingRoot, tracedFilePath)
          assets[fileOutputPath] = tracedFilePath
        }
        return assets
      }

      async function handleEdgeFunction(
        page: EdgeFunctionDefinition,
        isMiddleware: boolean = false
      ) {
        let type: AdapterOutputType = AdapterOutputType.PAGES
        const isAppPrefix = page.page.startsWith('app/')
        const isAppPage = isAppPrefix && page.page.endsWith('/page')
        const isAppRoute = isAppPrefix && page.page.endsWith('/route')
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

        const output: Omit<AdapterOutput[typeof type], 'type'> & {
          type: any
        } = {
          type,
          id: page.name,
          runtime: 'edge',
          pathname: isAppPrefix ? normalizeAppPath(page.name) : page.name,
          filePath: path.join(
            distDir,
            page.files.find(
              (item) =>
                item.startsWith('server/app') || item.startsWith('server/pages')
            ) ||
              // TODO: turbopack build doesn't name the main entry chunk
              // identifiably so we don't know which to mark here but
              // technically edge needs all chunks to load always so
              // should this field even be provided?
              page.files[0] ||
              ''
          ),
          assets: {},
          wasmAssets: {},
          config: {
            ...(type === AdapterOutputType.MIDDLEWARE
              ? {
                  matchers: page.matchers,
                }
              : {}),
            env: page.env,
          },
        }

        function handleFile(file: string) {
          const originalPath = path.join(distDir, file)
          const fileOutputPath = path.join(
            path.relative(tracingRoot, distDir),
            file
          )
          if (!output.assets) {
            output.assets = {}
          }
          output.assets[fileOutputPath] = originalPath
        }
        for (const file of page.files) {
          handleFile(file)
        }
        for (const item of [...(page.assets || [])]) {
          handleFile(item.filePath)
        }
        for (const item of page.wasm || []) {
          if (!output.wasmAssets) {
            output.wasmAssets = {}
          }
          output.wasmAssets[item.name] = item.filePath
        }

        if (type === AdapterOutputType.MIDDLEWARE) {
          outputs.middleware = output
        } else {
          currentOutputs.push(output)
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

      for (const page of pageKeys) {
        if (page === '/_app' || page === '/_document') {
          continue
        }

        if (middlewareManifest.functions.hasOwnProperty(page)) {
          continue
        }

        const route = normalizePagePath(page)
        const pageFile = path.join(
          pagesDistDir,
          `${normalizePagePath(page)}.js`
        )

        // if it's an auto static optimized page it's just
        // a static file
        if (staticPages.has(page)) {
          if (config.i18n) {
            for (const locale of config.i18n.locales || []) {
              const localePage =
                page === '/' ? `/${locale}` : addPathPrefix(page, `/${locale}`)
              outputs.staticFiles.push({
                id: localePage,
                pathname: localePage,
                type: AdapterOutputType.STATIC_FILE,
                filePath: path.join(
                  pagesDistDir,
                  `${normalizePagePath(localePage)}.html`
                ),
              } satisfies AdapterOutput['STATIC_FILE'])
            }
          } else {
            outputs.staticFiles.push({
              id: page,
              pathname: route,
              type: AdapterOutputType.STATIC_FILE,
              filePath: pageFile.replace(/\.js$/, '.html'),
            } satisfies AdapterOutput['STATIC_FILE'])
          }
          continue
        }

        const pageTraceFile = `${pageFile}.nft.json`
        const assets = await handleTraceFiles(pageTraceFile).catch((err) => {
          if (err.code !== 'ENOENT' || (page !== '/404' && page !== '/500')) {
            Log.warn(`Failed to locate traced assets for ${pageFile}`, err)
          }
          return {} as Record<string, string>
        })
        const functionConfig = functionsConfigManifest.functions[route] || {}

        const output: AdapterOutput['PAGES'] | AdapterOutput['PAGES_API'] = {
          id: route,
          type: page.startsWith('/api')
            ? AdapterOutputType.PAGES_API
            : AdapterOutputType.PAGES,
          filePath: pageTraceFile.replace(/\.nft\.json$/, ''),
          pathname: route,
          assets,
          runtime: 'nodejs',
          config: {
            maxDuration: functionConfig.maxDuration,
            preferredRegion: functionConfig.regions,
          },
        }
        pageOutputMap[page] = output

        if (output.type === AdapterOutputType.PAGES) {
          outputs.pages.push(output)
        } else {
          outputs.pagesApi.push(output)
        }
      }

      if (hasNodeMiddleware) {
        const middlewareFile = path.join(distDir, 'server', 'middleware.js')
        const middlewareTrace = `${middlewareFile}.nft.json`
        const assets = await handleTraceFiles(middlewareTrace)
        const functionConfig =
          functionsConfigManifest.functions['/_middleware'] || {}

        outputs.middleware = {
          pathname: '/_middleware',
          id: '/_middleware',
          assets,
          type: AdapterOutputType.MIDDLEWARE,
          runtime: 'nodejs',
          filePath: middlewareFile,
          config: {
            matchers: functionConfig.matchers,
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
          const pageFile = path.join(appDistDir, `${page}.js`)
          const pageTraceFile = `${pageFile}.nft.json`
          const assets = await handleTraceFiles(pageTraceFile).catch((err) => {
            Log.warn(`Failed to copy traced files for ${pageFile}`, err)
            return {} as Record<string, string>
          })
          const functionConfig =
            functionsConfigManifest.functions[normalizedPage] || {}

          const output: AdapterOutput['APP_PAGE'] | AdapterOutput['APP_ROUTE'] =
            {
              pathname: normalizedPage,
              id: normalizedPage,
              assets,
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
            outputs.appPages.push(output)
          } else {
            outputs.appRoutes.push(output)
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
        meta: {
          postponed?: string
          segmentPaths?: string[]
        }
      ) => {
        if (meta.postponed && initialOutput.fallback) {
          initialOutput.fallback.postponedState = meta.postponed
        }

        if (meta?.segmentPaths) {
          const segmentsDir = path.join(
            appDistDir,
            `${route}${prefetchSegmentDirSuffix}`
          )

          for (const segmentPath of meta.segmentPaths) {
            const outputSegmentPath =
              path.join(
                appDistDir,
                route + prefetchSegmentDirSuffix,
                segmentPath
              ) + prefetchSegmentSuffix

            const fallbackPathname = path.join(
              segmentsDir,
              segmentPath + prefetchSegmentSuffix
            )

            outputs.prerenders.push({
              id: outputSegmentPath,
              pathname: outputSegmentPath,
              type: AdapterOutputType.PRERENDER,
              parentOutputId: initialOutput.parentOutputId,
              groupId: initialOutput.groupId,

              config: {
                ...initialOutput.config,
              },

              fallback: {
                filePath: fallbackPathname,
                initialExpiration: initialOutput.fallback?.initialExpiration,
                initialRevalidate: initialOutput.fallback?.initialRevalidate,

                initialHeaders: {
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
        const meta: AppRouteMeta = isAppPage
          ? JSON.parse(
              await fs
                .readFile(path.join(appDistDir, `${route}.meta`), 'utf8')
                .catch(() => '{}')
            )
          : {}

        if (meta.headers) {
          // normalize these for consistency
          for (const key of Object.keys(meta.headers)) {
            const keyLower = key.toLowerCase()
            if (keyLower !== key) {
              const value = meta.headers[key]
              delete meta.headers[key]
              meta.headers[keyLower] = value
            }
          }
        }

        return meta
      }

      for (const route in prerenderManifest.routes) {
        const {
          initialExpireSeconds: initialExpiration,
          initialRevalidateSeconds: initialRevalidate,
          initialHeaders,
          initialStatus,
          prefetchDataRoute,
          dataRoute,
          renderingMode,
          allowHeader,
          experimentalBypassFor,
        } = prerenderManifest.routes[route]

        const srcRoute = prerenderManifest.routes[route].srcRoute || route
        const isAppPage =
          Boolean(appOutputMap[srcRoute]) || srcRoute === '/_not-found'

        const isNotFoundTrue = prerenderManifest.notFoundRoutes.includes(route)

        let allowQuery: string[] | undefined
        const routeKeys = routesManifest.dynamicRoutes.find(
          (item) => item.page === srcRoute
        )?.routeKeys

        if (!isDynamicRoute(srcRoute)) {
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
          `${route === '/' ? 'index' : route}.${isAppPage && !dataRoute ? 'body' : 'html'}`
        )

        // we use the static 404 for notFound: true if available
        // if not we do a blocking invoke on first request
        if (isNotFoundTrue && hasStatic404) {
          filePath = path.join(pagesDistDir, '404.html')
        }

        const meta = await getAppRouteMeta(route, isAppPage)

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
            isAppPage && config.experimental.ppr
              ? {
                  headers: {
                    [NEXT_RESUME_HEADER]: '1',
                  },
                }
              : undefined,

          fallback:
            !isNotFoundTrue || (isNotFoundTrue && hasStatic404)
              ? {
                  filePath,
                  initialStatus,
                  initialHeaders: {
                    ...initialHeaders,
                    vary: varyHeader,
                    'content-type': HTML_CONTENT_TYPE_HEADER,
                    ...meta.headers,
                  },
                  initialExpiration,
                  initialRevalidate: initialRevalidate || 1,
                }
              : undefined,
          config: {
            allowQuery,
            allowHeader,
            renderingMode,
            bypassFor: experimentalBypassFor,
            bypassToken: prerenderManifest.preview.previewModeId,
          },
        }
        outputs.prerenders.push(initialOutput)

        if (dataRoute) {
          let dataFilePath = path.join(
            pagesDistDir,
            `${route === '/' ? 'index' : route}.json`
          )

          if (isAppPage) {
            // When experimental PPR is enabled, we expect that the data
            // that should be served as a part of the prerender should
            // be from the prefetch data route. If this isn't enabled
            // for ppr, the only way to get the data is from the data
            // route.
            dataFilePath = path.join(
              appDistDir,
              prefetchDataRoute &&
                renderingMode === RenderingMode.PARTIALLY_STATIC
                ? prefetchDataRoute
                : dataRoute
            )
          }

          outputs.prerenders.push({
            ...initialOutput,
            id: dataRoute,
            pathname: dataRoute,
            fallback: isNotFoundTrue
              ? undefined
              : {
                  ...initialOutput.fallback,
                  initialHeaders: {
                    ...initialOutput.fallback?.initialHeaders,
                    'content-type': isAppPage
                      ? rscContentTypeHeader
                      : JSON_CONTENT_TYPE_HEADER,
                  },
                  filePath: dataFilePath,
                },
          })
        }

        if (isAppPage) {
          await handleAppMeta(route, initialOutput, meta)
        }
        prerenderGroupId += 1
      }

      for (const dynamicRoute in prerenderManifest.dynamicRoutes) {
        const {
          fallback,
          fallbackExpire,
          fallbackRevalidate,
          fallbackHeaders,
          fallbackStatus,
          allowHeader,
          dataRoute,
          renderingMode,
          experimentalBypassFor,
        } = prerenderManifest.dynamicRoutes[dynamicRoute]

        const isAppPage = Boolean(appOutputMap[dynamicRoute])

        const allowQuery = Object.values(
          routesManifest.dynamicRoutes.find(
            (item) => item.page === dynamicRoute
          )?.routeKeys || {}
        )
        const meta = await getAppRouteMeta(dynamicRoute, isAppPage)

        const initialOutput: AdapterOutput['PRERENDER'] = {
          id: dynamicRoute,
          type: AdapterOutputType.PRERENDER,
          pathname: dynamicRoute,
          parentOutputId: getParentOutput(dynamicRoute, dynamicRoute).id,
          groupId: prerenderGroupId,
          config: {
            allowQuery,
            allowHeader,
            renderingMode,
            bypassFor: experimentalBypassFor,
            bypassToken: prerenderManifest.preview.previewModeId,
          },
          fallback:
            typeof fallback === 'string'
              ? {
                  filePath: path.join(
                    isAppPage ? appDistDir : pagesDistDir,
                    // app router dynamic route fallbacks don't have the
                    // extension so ensure it's added here
                    fallback.endsWith('.html') ? fallback : `${fallback}.html`
                  ),
                  initialStatus: fallbackStatus,
                  initialHeaders: {
                    ...fallbackHeaders,
                    'content-type': HTML_CONTENT_TYPE_HEADER,
                  },
                  initialExpiration: fallbackExpire,
                  initialRevalidate: fallbackRevalidate || 1,
                }
              : undefined,
        }
        outputs.prerenders.push(initialOutput)

        if (isAppPage) {
          await handleAppMeta(dynamicRoute, initialOutput, meta)
        }

        if (dataRoute) {
          outputs.prerenders.push({
            ...initialOutput,
            id: dataRoute,
            pathname: dataRoute,
            fallback: undefined,
          })
        }
        prerenderGroupId += 1
      }
    }

    normalizePathnames(config, outputs)

    try {
      await adapterMod.onBuildComplete({
        routes: {
          dynamicRoutes: routesManifest.dynamicRoutes,
          rewrites: routesManifest.rewrites,
          redirects: routesManifest.redirects,
          headers: routesManifest.headers,
        },
        outputs,

        config,
        distDir,
        nextVersion,
        projectDir: dir,
        repoRoot: tracingRoot,
      })
    } catch (err) {
      Log.error(`Failed to run onBuildComplete from ${adapterMod.name}`)
      throw err
    }
  }
}
