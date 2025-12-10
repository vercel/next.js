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
} from '..'

import {
  CACHE_ONE_YEAR,
  HTML_CONTENT_TYPE_HEADER,
  JSON_CONTENT_TYPE_HEADER,
  NEXT_RESUME_HEADER,
} from '../../lib/constants'
import { normalizeLocalePath } from '../../shared/lib/i18n/normalize-locale-path'
import { addPathPrefix } from '../../shared/lib/router/utils/add-path-prefix'
import { getRedirectStatus, modifyRouteRegex } from '../../lib/redirect-status'
import { getNamedRouteRegex } from '../../shared/lib/router/utils/route-regex'
import { escapeStringRegexp } from '../../shared/lib/escape-regexp'
import { sortSortableRoutes } from '../../shared/lib/router/utils/sortable-routes'
import { nodeFileTrace } from 'next/dist/compiled/@vercel/nft'
import { defaultOverrides } from '../../server/require-hook'
import { makeIgnoreFn } from '../collect-build-traces'

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
     * parentFallbackMode signals whether additional routes can be generated
     * e.g. fallback: false or 'blocking' in getStaticPaths in pages router
     */
    parentFallbackMode?: DynamicPrerenderManifestRoute['fallback']

    /**
     * fallback is initial cache data generated during build for a prerender
     */
    fallback?:
      | {
          /**
           * path to the fallback file can be HTML/JSON/RSC,
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
      | {
          /*
        a fallback filePath can be omitted when postponedState is
        present which signals the fallback should just resume with
        the postpone state but doesn't have fallback to seed cache
      */
          postponedState: string
          initialExpiration?: number
          initialRevalidate?: Revalidate
          initialHeaders?: Record<string, string | string[]>
          initialStatus?: number
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
    }
  ) => Promise<NextConfigComplete> | NextConfigComplete
  onBuildComplete?: (ctx: {
    routing: {
      beforeMiddleware: Array<Route>
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
  buildId,
  configOutDir,
  distDir,
  pageKeys,
  tracingRoot,
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
  dir: string
  distDir: string
  buildId: string
  configOutDir: string
  adapterPath: string
  tracingRoot: string
  nextVersion: string
  hasStatic404: boolean
  hasStatic500: boolean
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
      const pagesSharedNodeAssets: Record<string, string> = {}
      const appPagesSharedNodeAssets: Record<string, string> = {}

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
      const sharedIgnoreFn = makeIgnoreFn(tracingRoot, sharedTraceIgnores)

      for (const file of requiredServerFiles) {
        // add to shared node assets
        const filePath = path.join(dir, file)
        const fileOutputPath = path.relative(tracingRoot, filePath)
        sharedNodeAssets[fileOutputPath] = filePath
      }

      const moduleTypes = ['app-page', 'pages'] as const

      for (const type of moduleTypes) {
        const currentDependencies: string[] = []
        const modulePath = require.resolve(
          `next/dist/server/route-modules/${type}/module.compiled`
        )
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

        const { fileList, esmFileList } = await nodeFileTrace(
          currentDependencies,
          {
            base: tracingRoot,
            ignore: sharedIgnoreFn,
          }
        )
        esmFileList.forEach((item) => fileList.add(item))

        for (const rootRelativeFilePath of fileList) {
          if (type === 'pages') {
            pagesSharedNodeAssets[rootRelativeFilePath] = path.join(
              tracingRoot,
              rootRelativeFilePath
            )
          } else {
            appPagesSharedNodeAssets[rootRelativeFilePath] = path.join(
              tracingRoot,
              rootRelativeFilePath
            )
          }
        }
      }

      // These are modules that are necessary for bootstrapping node env
      const necessaryNodeDependencies = [
        require.resolve('next/dist/server/node-environment'),
        require.resolve('next/dist/server/require-hook'),
        require.resolve('next/dist/server/node-polyfill-crypto'),
        ...Object.values(defaultOverrides).filter((item) => path.extname(item)),
      ]

      const { fileList, esmFileList } = await nodeFileTrace(
        necessaryNodeDependencies,
        {
          base: tracingRoot,
          ignore: sharedIgnoreFn,
        }
      )
      esmFileList.forEach((item) => fileList.add(item))

      for (const rootRelativeFilePath of fileList) {
        sharedNodeAssets[rootRelativeFilePath] = path.join(
          tracingRoot,
          rootRelativeFilePath
        )
      }

      if (hasInstrumentationHook) {
        const assets = await handleTraceFiles(
          path.join(distDir, 'server', 'instrumentation.js.nft.json'),
          'neutral'
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
        traceFilePath: string,
        type: 'pages' | 'app' | 'neutral'
      ): Promise<Record<string, string>> {
        const assets: Record<string, string> = Object.assign(
          {},
          sharedNodeAssets,
          type === 'pages' ? pagesSharedNodeAssets : {},
          type === 'app' ? appPagesSharedNodeAssets : {}
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

        const output: Omit<AdapterOutput[typeof type], 'type'> & {
          type: any
        } = {
          type,
          id: page.name,
          runtime: 'edge',
          sourcePage: route,
          pathname: isAppPrefix ? normalizeAppPath(route) : route,
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
              } satisfies AdapterOutput['STATIC_FILE']

              outputs.staticFiles.push(localeOutput)

              if (appPageKeys && appPageKeys.length > 0) {
                outputs.staticFiles.push({
                  id: `${localePage}.rsc`,
                  pathname: `${localePage}.rsc`,
                  type: AdapterOutputType.STATIC_FILE,
                  filePath: rscFallbackPath,
                })
              }
            }
          } else {
            const staticOutput = {
              id: page,
              pathname: route,
              type: AdapterOutputType.STATIC_FILE,
              filePath: pageFile.replace(/\.js$/, '.html'),
            } satisfies AdapterOutput['STATIC_FILE']

            outputs.staticFiles.push(staticOutput)

            if (appPageKeys && appPageKeys.length > 0) {
              outputs.staticFiles.push({
                id: `${page}.rsc`,
                pathname: `${route}.rsc`,
                type: AdapterOutputType.STATIC_FILE,
                filePath: rscFallbackPath,
              })
            }
          }
          // if was a static file output don't create page output as well
          continue
        }

        const pageTraceFile = `${pageFile}.nft.json`
        const assets = await handleTraceFiles(pageTraceFile, 'pages').catch(
          (err) => {
            if (err.code !== 'ENOENT' || (page !== '/404' && page !== '/500')) {
              Log.warn(`Failed to locate traced assets for ${pageFile}`, err)
            }
            return {} as Record<string, string>
          }
        )
        const functionConfig = functionsConfigManifest.functions[route] || {}
        let sourcePage = route.replace(/^\//, '')

        sourcePage = sourcePage === 'api' ? 'api/index' : sourcePage

        const output: AdapterOutput['PAGES'] | AdapterOutput['PAGES_API'] = {
          id: route,
          type: page.startsWith('/api')
            ? AdapterOutputType.PAGES_API
            : AdapterOutputType.PAGES,
          filePath: pageTraceFile.replace(/\.nft\.json$/, ''),
          pathname: route,
          sourcePage,
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
            }
          }
        } else {
          outputs.pagesApi.push(output)
        }

        if (appPageKeys && appPageKeys.length > 0) {
          outputs.staticFiles.push({
            id: `${output.id}.rsc`,
            pathname: `${output.pathname}.rsc`,
            type: AdapterOutputType.STATIC_FILE,
            filePath: rscFallbackPath,
          })
        }
      }

      if (hasNodeMiddleware) {
        const middlewareFile = path.join(distDir, 'server', 'middleware.js')
        const middlewareTrace = `${middlewareFile}.nft.json`
        const assets = await handleTraceFiles(middlewareTrace, 'neutral')
        const functionConfig =
          functionsConfigManifest.functions['/_middleware'] || {}

        outputs.middleware = {
          pathname: '/_middleware',
          id: '/_middleware',
          sourcePage: 'middleware',
          assets,
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
          const pageFile = path.join(appDistDir, `${page}.js`)
          const pageTraceFile = `${pageFile}.nft.json`
          const assets = await handleTraceFiles(pageTraceFile, 'app').catch(
            (err) => {
              Log.warn(`Failed to copy traced files for ${pageFile}`, err)
              return {} as Record<string, string>
            }
          )

          // If this is a parallel route we just need to merge
          // the assets as they share the same pathname
          const existingOutput = appOutputMap[normalizedPage]
          if (existingOutput) {
            Object.assign(existingOutput.assets, assets)
            existingOutput.assets[path.relative(tracingRoot, pageFile)] =
              pageFile

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
          const normalizedRoute = normalizePagePath(route)
          const segmentsDir = path.join(
            appDistDir,
            `${normalizedRoute}${prefetchSegmentDirSuffix}`
          )

          for (const segmentPath of meta.segmentPaths) {
            const outputSegmentPath =
              path.join(
                normalizedRoute + prefetchSegmentDirSuffix,
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
            if (keyLower !== key) {
              const value = meta.headers[key]
              delete meta.headers[key]
              meta.headers[keyLower] = value
            }
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
          renderingMode,
          allowHeader,
          experimentalBypassFor,
        } = prerenderManifest.routes[route]

        const srcRoute = prerenderManifest.routes[route].srcRoute || route
        const srcRouteInfo = prerenderManifest.dynamicRoutes[srcRoute]

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
          `${normalizePagePath(route)}.${isAppPage && !dataRoute ? 'body' : 'html'}`
        )

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

          parentFallbackMode: srcRouteInfo?.fallback,

          fallback:
            !isNotFoundTrue || (isNotFoundTrue && hasStatic404)
              ? {
                  filePath,
                  initialStatus:
                    (initialStatus ?? isNotFoundTrue) ? 404 : undefined,
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
            bypassFor: experimentalBypassFor,
            bypassToken: prerenderManifest.preview.previewModeId,
          },
        }
        outputs.prerenders.push(initialOutput)

        if (dataRoute) {
          let dataFilePath: string | undefined = path.join(
            pagesDistDir,
            `${normalizePagePath(route)}.json`
          )
          let postponed = meta.postponed

          if (isAppPage) {
            // When experimental PPR is enabled, we expect that the data
            // that should be served as a part of the prerender should
            // be from the prefetch data route. If this isn't enabled
            // for ppr, the only way to get the data is from the data
            // route.
            dataFilePath = path.join(appDistDir, dataRoute)
          }

          if (
            renderingMode === RenderingMode.PARTIALLY_STATIC &&
            !(await cachedFilePathCheck(dataFilePath))
          ) {
            // TODO: allowQuery should diverge based on app client param
            // parsing flag
            outputs.prerenders.push({
              ...initialOutput,
              id: dataRoute,
              pathname: dataRoute,
              fallback: !postponed
                ? undefined
                : {
                    ...initialOutput.fallback,
                    postponedState: postponed,
                    initialHeaders: {
                      ...initialOutput.fallback?.initialHeaders,
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
          fallbackSourceRoute,
          allowHeader,
          dataRoute,
          renderingMode,
          experimentalBypassFor,
        } = prerenderManifest.dynamicRoutes[dynamicRoute]

        const srcRoute = fallbackSourceRoute || dynamicRoute
        const parentOutput = getParentOutput(srcRoute, dynamicRoute)
        const isAppPage = Boolean(appOutputMap[srcRoute])

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
          parentOutputId: parentOutput.id,
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

        if (!config.i18n || isAppPage) {
          outputs.prerenders.push(initialOutput)

          if (isAppPage) {
            await handleAppMeta(dynamicRoute, initialOutput, meta)
          }

          if (renderingMode === RenderingMode.PARTIALLY_STATIC) {
            outputs.prerenders.push({
              ...initialOutput,
              id: `${dynamicRoute}.rsc`,
              pathname: `${dynamicRoute}.rsc`,
              fallback: meta.postponed
                ? {
                    ...initialOutput.fallback,
                    postponedState: meta.postponed,
                    initialHeaders: {
                      ...initialOutput.fallback?.initialHeaders,
                      'content-type': isAppPage
                        ? rscContentTypeHeader
                        : JSON_CONTENT_TYPE_HEADER,
                    },
                  }
                : undefined,
            })
          } else if (dataRoute) {
            outputs.prerenders.push({
              ...initialOutput,
              id: dataRoute,
              pathname: dataRoute,
              fallback: undefined,
            })
          }
          prerenderGroupId += 1
        } else {
          for (const locale of config.i18n.locales) {
            const currentOutput = {
              ...initialOutput,
              pathname: path.posix.join(`/${locale}`, initialOutput.pathname),
              id: path.posix.join(`/${locale}`, initialOutput.id),
              fallback:
                typeof fallback === 'string'
                  ? {
                      ...initialOutput.fallback,
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
      const shouldLocalize = config.i18n

      const routeRegex = getNamedRouteRegex(route.page, {
        prefixRouteKeys: true,
      })

      const isFallbackFalse =
        prerenderManifest.dynamicRoutes[route.page]?.fallback === false

      const { hasFallbackRootParams } = route

      const sourceRegex = routeRegex.namedRegex.replace(
        '^',
        `^${config.basePath && config.basePath !== '/' ? path.posix.join('/', config.basePath || '') : ''}[/]?${shouldLocalize ? '(?<nextLocale>[^/]{1,})?' : ''}`
      )
      const destination =
        path.posix.join(
          '/',
          config.basePath,
          shouldLocalize ? '/$nextLocale' : '',
          route.page
        ) + getDestinationQuery(route.routeKeys)

      if (appPageKeys && appPageKeys.length > 0) {
        // If we have fallback root params (implying we've already
        // emitted a rewrite for the /_tree request), or if the route
        // has PPR enabled and client param parsing is enabled, then
        // we don't need to include any other suffixes.
        const shouldSkipSuffixes = hasFallbackRootParams

        dynamicRoutes.push({
          source: route.page + '.rsc',
          sourceRegex: sourceRegex.replace(
            new RegExp(escapeStringRegexp('(?:/)?$')),
            // Now than the upstream issues has been resolved, we can safely
            // add the suffix back, this resolves a bug related to segment
            // rewrites not capturing the correct suffix values when
            // enabled.
            shouldSkipSuffixes
              ? '(?<rscSuffix>\\.rsc|\\.segments/.+\\.segment\\.rsc)(?:/)?$'
              : '(?<rscSuffix>\\.rsc|\\.prefetch\\.rsc|\\.segments/.+\\.segment\\.rsc)(?:/)?$'
          ),
          destination: destination?.replace(/($|\?)/, '$rscSuffix$1'),
          has: isFallbackFalse ? fallbackFalseHasCondition : undefined,
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
                  )}[/]?${shouldLocalize ? '(?<nextLocale>[^/]{1,})?' : ''}`
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

      const headers = routesManifest.headers.map((route) => {
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
      })

      await adapterMod.onBuildComplete({
        routing: {
          beforeMiddleware: [...headers, ...redirects],
          beforeFiles: rewrites.beforeFiles,
          afterFiles: rewrites.afterFiles,
          dynamicRoutes: combinedDynamicRoutes,
          onMatch: [
            {
              // This ensures we only match known emitted-by-Next.js files and not
              // user-emitted files which may be missing a hash in their filename.
              sourceRegex: `^/${escapeStringRegexp(buildId)}/_next/static/(?:[^/]+/pages|pages|chunks|runtime|css|image|media|${escapeStringRegexp(buildId)})/.+`,
              // Next.js assets contain a hash or entropy in their filenames, so they
              // are guaranteed to be unique and cacheable indefinitely.
              headers: {
                'cache-control': `public,max-age=${CACHE_ONE_YEAR},immutable`,
              },
            },
          ],
          fallback: rewrites.fallback,
          shouldNormalizeNextData: !!needsMiddlewareResolveRoutes,
        },
        outputs,

        config,
        distDir,
        buildId,
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
