import type { ClientPagesLoaderOptions } from './webpack/loaders/next-client-pages-loader'
import type { MiddlewareLoaderOptions } from './webpack/loaders/next-middleware-loader'
import type { EdgeSSRLoaderQuery } from './webpack/loaders/next-edge-ssr-loader'
import type { EdgeAppRouteLoaderQuery } from './webpack/loaders/next-edge-app-route-loader'
import type { NextConfigComplete } from '../server/config-shared'
import type { webpack } from 'next/dist/compiled/webpack/webpack'
import type {
  MiddlewareConfig,
  MiddlewareMatcher,
} from './analysis/get-page-static-info'
import type { LoadedEnvFiles } from '@next/env'
import chalk from 'next/dist/compiled/chalk'
import { posix, join } from 'path'
import { stringify } from 'querystring'
import {
  PAGES_DIR_ALIAS,
  ROOT_DIR_ALIAS,
  APP_DIR_ALIAS,
  WEBPACK_LAYERS,
  INSTRUMENTATION_HOOK_FILENAME,
} from '../lib/constants'
import { isAPIRoute } from '../lib/is-api-route'
import { isEdgeRuntime } from '../lib/is-edge-runtime'
import { APP_CLIENT_INTERNALS, RSC_MODULE_TYPES } from '../shared/lib/constants'
import {
  CLIENT_STATIC_FILES_RUNTIME_AMP,
  CLIENT_STATIC_FILES_RUNTIME_MAIN,
  CLIENT_STATIC_FILES_RUNTIME_MAIN_APP,
  CLIENT_STATIC_FILES_RUNTIME_POLYFILLS,
  CLIENT_STATIC_FILES_RUNTIME_REACT_REFRESH,
  CompilerNameValues,
  COMPILER_NAMES,
  EDGE_RUNTIME_WEBPACK,
} from '../shared/lib/constants'
import { __ApiPreviewProps } from '../server/api-utils'
import { warn } from './output/log'
import {
  isMiddlewareFile,
  isMiddlewareFilename,
  isInstrumentationHookFile,
  NestedMiddlewareError,
} from './utils'
import { getPageStaticInfo } from './analysis/get-page-static-info'
import { normalizePathSep } from '../shared/lib/page-path/normalize-path-sep'
import { normalizePagePath } from '../shared/lib/page-path/normalize-page-path'
import { ServerRuntime } from '../../types'
import { normalizeAppPath } from '../shared/lib/router/utils/app-paths'
import { encodeMatchers } from './webpack/loaders/next-middleware-loader'
import { EdgeFunctionLoaderOptions } from './webpack/loaders/next-edge-function-loader'
import { isAppRouteRoute } from '../lib/is-app-route-route'

type ObjectValue<T> = T extends { [key: string]: infer V } ? V : never

/**
 * For a given page path removes the provided extensions.
 */
export function getPageFromPath(pagePath: string, pageExtensions: string[]) {
  let page = normalizePathSep(
    pagePath.replace(new RegExp(`\\.+(${pageExtensions.join('|')})$`), '')
  )

  page = page.replace(/\/index$/, '')

  return page === '' ? '/' : page
}

export function createPagesMapping({
  isDev,
  pageExtensions,
  pagePaths,
  pagesType,
  pagesDir,
}: {
  isDev: boolean
  pageExtensions: string[]
  pagePaths: string[]
  pagesType: 'pages' | 'root' | 'app'
  pagesDir: string | undefined
}): { [page: string]: string } {
  const previousPages: { [key: string]: string } = {}
  const pages = pagePaths.reduce<{ [key: string]: string }>(
    (result, pagePath) => {
      // Do not process .d.ts files inside the `pages` folder
      if (pagePath.endsWith('.d.ts') && pageExtensions.includes('ts')) {
        return result
      }

      const pageKey = getPageFromPath(pagePath, pageExtensions)

      if (pageKey in result) {
        warn(
          `Duplicate page detected. ${chalk.cyan(
            join('pages', previousPages[pageKey])
          )} and ${chalk.cyan(
            join('pages', pagePath)
          )} both resolve to ${chalk.cyan(pageKey)}.`
        )
      } else {
        previousPages[pageKey] = pagePath
      }

      result[pageKey] = normalizePathSep(
        join(
          pagesType === 'pages'
            ? PAGES_DIR_ALIAS
            : pagesType === 'app'
            ? APP_DIR_ALIAS
            : ROOT_DIR_ALIAS,
          pagePath
        )
      )
      return result
    },
    {}
  )

  if (pagesType !== 'pages') {
    return pages
  }

  if (isDev) {
    delete pages['/_app']
    delete pages['/_error']
    delete pages['/_document']
  }

  // In development we always alias these to allow Webpack to fallback to
  // the correct source file so that HMR can work properly when a file is
  // added or removed.
  const root = isDev && pagesDir ? PAGES_DIR_ALIAS : 'next/dist/pages'

  return {
    '/_app': `${root}/_app`,
    '/_error': `${root}/_error`,
    '/_document': `${root}/_document`,
    ...pages,
  }
}

export interface CreateEntrypointsParams {
  buildId: string
  config: NextConfigComplete
  envFiles: LoadedEnvFiles
  isDev?: boolean
  pages: { [page: string]: string }
  pagesDir?: string
  previewMode: __ApiPreviewProps
  rootDir: string
  rootPaths?: Record<string, string>
  appDir?: string
  appPaths?: Record<string, string>
  pageExtensions: string[]
  hasInstrumentationHook?: boolean
}

export function getEdgeServerEntry(opts: {
  rootDir: string
  absolutePagePath: string
  buildId: string
  bundlePath: string
  config: NextConfigComplete
  isDev: boolean
  isServerComponent: boolean
  page: string
  pages: { [page: string]: string }
  middleware?: Partial<MiddlewareConfig>
  pagesType: 'app' | 'pages' | 'root'
  appDirLoader?: string
  hasInstrumentationHook?: boolean
}) {
  if (
    opts.pagesType === 'app' &&
    isAppRouteRoute(opts.page) &&
    opts.appDirLoader
  ) {
    const loaderParams: EdgeAppRouteLoaderQuery = {
      absolutePagePath: opts.absolutePagePath,
      page: opts.page,
      appDirLoader: Buffer.from(opts.appDirLoader || '').toString('base64'),
    }

    return `next-edge-app-route-loader?${stringify(loaderParams)}!`
  }
  if (isMiddlewareFile(opts.page)) {
    const loaderParams: MiddlewareLoaderOptions = {
      absolutePagePath: opts.absolutePagePath,
      page: opts.page,
      rootDir: opts.rootDir,
      matchers: opts.middleware?.matchers
        ? encodeMatchers(opts.middleware.matchers)
        : '',
    }

    return `next-middleware-loader?${stringify(loaderParams)}!`
  }

  if (isAPIRoute(opts.page)) {
    const loaderParams: EdgeFunctionLoaderOptions = {
      absolutePagePath: opts.absolutePagePath,
      page: opts.page,
      rootDir: opts.rootDir,
    }

    return `next-edge-function-loader?${stringify(loaderParams)}!`
  }

  if (isInstrumentationHookFile(opts.page)) {
    return {
      import: opts.absolutePagePath,
      filename: `edge-${INSTRUMENTATION_HOOK_FILENAME}.js`,
    }
  }

  const loaderParams: EdgeSSRLoaderQuery = {
    absolute500Path: opts.pages['/500'] || '',
    absoluteAppPath: opts.pages['/_app'],
    absoluteDocumentPath: opts.pages['/_document'],
    absoluteErrorPath: opts.pages['/_error'],
    absolutePagePath: opts.absolutePagePath,
    buildId: opts.buildId,
    dev: opts.isDev,
    isServerComponent: opts.isServerComponent,
    page: opts.page,
    stringifiedConfig: JSON.stringify(opts.config),
    pagesType: opts.pagesType,
    appDirLoader: Buffer.from(opts.appDirLoader || '').toString('base64'),
    sriEnabled: !opts.isDev && !!opts.config.experimental.sri?.algorithm,
    incrementalCacheHandlerPath:
      opts.config.experimental.incrementalCacheHandlerPath,
  }

  return {
    import: `next-edge-ssr-loader?${stringify(loaderParams)}!`,
    // The Edge bundle includes the server in its entrypoint, so it has to
    // be in the SSR layer — we later convert the page request to the RSC layer
    // via a webpack rule.
    layer: opts.appDirLoader ? WEBPACK_LAYERS.client : undefined,
  }
}

export function getAppEntry(opts: {
  name: string
  pagePath: string
  appDir: string
  appPaths: ReadonlyArray<string> | null
  pageExtensions: string[]
  assetPrefix: string
  isDev?: boolean
  rootDir?: string
  tsconfigPath?: string
}) {
  return {
    import: `next-app-loader?${stringify(opts)}!`,
    layer: WEBPACK_LAYERS.server,
  }
}

export function getClientEntry(opts: {
  absolutePagePath: string
  page: string
}) {
  const loaderOptions: ClientPagesLoaderOptions = {
    absolutePagePath: opts.absolutePagePath,
    page: opts.page,
  }

  const pageLoader = `next-client-pages-loader?${stringify(loaderOptions)}!`

  // Make sure next/router is a dependency of _app or else chunk splitting
  // might cause the router to not be able to load causing hydration
  // to fail
  return opts.page === '/_app'
    ? [pageLoader, require.resolve('../client/router')]
    : pageLoader
}

export async function runDependingOnPageType<T>(params: {
  onClient: () => T
  onEdgeServer: () => T
  onServer: () => T
  page: string
  pageRuntime: ServerRuntime
  pageType?: 'app' | 'pages' | 'root'
}): Promise<void> {
  if (params.pageType === 'root' && isInstrumentationHookFile(params.page)) {
    await Promise.all([params.onServer(), params.onEdgeServer()])
    return
  }

  if (isMiddlewareFile(params.page)) {
    await params.onEdgeServer()
    return
  }
  if (isAPIRoute(params.page)) {
    if (isEdgeRuntime(params.pageRuntime)) {
      await params.onEdgeServer()
      return
    }

    await params.onServer()
    return
  }
  if (params.page === '/_document') {
    await params.onServer()
    return
  }
  if (
    params.page === '/_app' ||
    params.page === '/_error' ||
    params.page === '/404' ||
    params.page === '/500'
  ) {
    await Promise.all([params.onClient(), params.onServer()])
    return
  }
  if (isEdgeRuntime(params.pageRuntime)) {
    await Promise.all([params.onClient(), params.onEdgeServer()])
    return
  }

  await Promise.all([params.onClient(), params.onServer()])
  return
}

export async function createEntrypoints(params: CreateEntrypointsParams) {
  const {
    config,
    pages,
    pagesDir,
    isDev,
    rootDir,
    rootPaths,
    appDir,
    appPaths,
    pageExtensions,
  } = params
  const edgeServer: webpack.EntryObject = {}
  const server: webpack.EntryObject = {}
  const client: webpack.EntryObject = {}
  const nestedMiddleware: string[] = []
  let middlewareMatchers: MiddlewareMatcher[] | undefined = undefined

  let appPathsPerRoute: Record<string, string[]> = {}
  if (appDir && appPaths) {
    for (const pathname in appPaths) {
      const normalizedPath = normalizeAppPath(pathname)
      if (!appPathsPerRoute[normalizedPath]) {
        appPathsPerRoute[normalizedPath] = []
      }
      appPathsPerRoute[normalizedPath].push(pathname)
    }

    // Make sure to sort parallel routes to make the result deterministic.
    appPathsPerRoute = Object.fromEntries(
      Object.entries(appPathsPerRoute).map(([k, v]) => [k, v.sort()])
    )
  }

  const getEntryHandler =
    (mappings: Record<string, string>, pagesType: 'app' | 'pages' | 'root') =>
    async (page: string) => {
      const bundleFile = normalizePagePath(page)
      const clientBundlePath = posix.join(pagesType, bundleFile)
      const serverBundlePath =
        pagesType === 'pages'
          ? posix.join('pages', bundleFile)
          : pagesType === 'app'
          ? posix.join('app', bundleFile)
          : bundleFile.slice(1)
      const absolutePagePath = mappings[page]

      // Handle paths that have aliases
      const pageFilePath = (() => {
        if (absolutePagePath.startsWith(PAGES_DIR_ALIAS) && pagesDir) {
          return absolutePagePath.replace(PAGES_DIR_ALIAS, pagesDir)
        }

        if (absolutePagePath.startsWith(APP_DIR_ALIAS) && appDir) {
          return absolutePagePath.replace(APP_DIR_ALIAS, appDir)
        }

        if (absolutePagePath.startsWith(ROOT_DIR_ALIAS)) {
          return absolutePagePath.replace(ROOT_DIR_ALIAS, rootDir)
        }

        return require.resolve(absolutePagePath)
      })()

      /**
       * When we find a middleware file that is not in the ROOT_DIR we fail.
       * There is no need to check on `dev` as this should only happen when
       * building for production.
       */
      if (
        !absolutePagePath.startsWith(ROOT_DIR_ALIAS) &&
        /[\\\\/]_middleware$/.test(page)
      ) {
        nestedMiddleware.push(page)
      }

      const isInsideAppDir =
        !!appDir &&
        (absolutePagePath.startsWith(APP_DIR_ALIAS) ||
          absolutePagePath.startsWith(appDir))

      const staticInfo = await getPageStaticInfo({
        nextConfig: config,
        pageFilePath,
        isDev,
        page,
        pageType: isInsideAppDir ? 'app' : 'pages',
      })

      const isServerComponent =
        isInsideAppDir && staticInfo.rsc !== RSC_MODULE_TYPES.client

      if (isMiddlewareFile(page)) {
        middlewareMatchers = staticInfo.middleware?.matchers ?? [
          { regexp: '.*' },
        ]
      }

      await runDependingOnPageType({
        page,
        pageRuntime: staticInfo.runtime,
        pageType: pagesType,
        onClient: () => {
          if (isServerComponent || isInsideAppDir) {
            // We skip the initial entries for server component pages and let the
            // server compiler inject them instead.
          } else {
            client[clientBundlePath] = getClientEntry({
              absolutePagePath: mappings[page],
              page,
            })
          }
        },
        onServer: () => {
          if (pagesType === 'app' && appDir) {
            const matchedAppPaths = appPathsPerRoute[normalizeAppPath(page)]
            server[serverBundlePath] = getAppEntry({
              name: serverBundlePath,
              pagePath: mappings[page],
              appDir,
              appPaths: matchedAppPaths,
              pageExtensions,
              assetPrefix: config.assetPrefix,
            })
          } else {
            if (isInstrumentationHookFile(page) && pagesType === 'root') {
              server[serverBundlePath.replace('src/', '')] = {
                import: mappings[page],
                // the '../' is needed to make sure the file is not chunked
                filename: `../${INSTRUMENTATION_HOOK_FILENAME}.js`,
              }
            } else {
              server[serverBundlePath] = [mappings[page]]
            }
          }
        },
        onEdgeServer: () => {
          let appDirLoader: string = ''
          if (pagesType === 'app') {
            const matchedAppPaths = appPathsPerRoute[normalizeAppPath(page)]
            appDirLoader = getAppEntry({
              name: serverBundlePath,
              pagePath: mappings[page],
              appDir: appDir!,
              appPaths: matchedAppPaths,
              pageExtensions,
              assetPrefix: config.assetPrefix,
            }).import
          }
          const normalizedServerBundlePath =
            isInstrumentationHookFile(page) && pagesType === 'root'
              ? serverBundlePath.replace('src/', '')
              : serverBundlePath
          edgeServer[normalizedServerBundlePath] = getEdgeServerEntry({
            ...params,
            rootDir,
            absolutePagePath: mappings[page],
            bundlePath: clientBundlePath,
            isDev: false,
            isServerComponent,
            page,
            middleware: staticInfo?.middleware,
            pagesType,
            appDirLoader,
          })
        },
      })
    }

  if (appDir && appPaths) {
    const entryHandler = getEntryHandler(appPaths, 'app')
    await Promise.all(Object.keys(appPaths).map(entryHandler))
  }
  if (rootPaths) {
    await Promise.all(
      Object.keys(rootPaths).map(getEntryHandler(rootPaths, 'root'))
    )
  }
  await Promise.all(Object.keys(pages).map(getEntryHandler(pages, 'pages')))

  if (nestedMiddleware.length > 0) {
    throw new NestedMiddlewareError(
      nestedMiddleware,
      rootDir,
      (appDir || pagesDir)!
    )
  }

  return {
    client,
    server,
    edgeServer,
    middlewareMatchers,
  }
}

export function finalizeEntrypoint({
  name,
  compilerType,
  value,
  isServerComponent,
  hasAppDir,
}: {
  compilerType?: CompilerNameValues
  name: string
  value: ObjectValue<webpack.EntryObject>
  isServerComponent?: boolean
  hasAppDir?: boolean
}): ObjectValue<webpack.EntryObject> {
  const entry =
    typeof value !== 'object' || Array.isArray(value)
      ? { import: value }
      : value

  const isApi = name.startsWith('pages/api/')
  if (compilerType === COMPILER_NAMES.server) {
    return {
      publicPath: isApi ? '' : undefined,
      runtime: isApi ? 'webpack-api-runtime' : 'webpack-runtime',
      layer: isApi
        ? WEBPACK_LAYERS.api
        : isServerComponent
        ? WEBPACK_LAYERS.server
        : undefined,
      ...entry,
    }
  }

  if (compilerType === COMPILER_NAMES.edgeServer) {
    return {
      layer:
        isMiddlewareFilename(name) || isApi
          ? WEBPACK_LAYERS.middleware
          : undefined,
      library: { name: ['_ENTRIES', `middleware_[name]`], type: 'assign' },
      runtime: EDGE_RUNTIME_WEBPACK,
      asyncChunks: false,
      ...entry,
    }
  }

  const isAppLayer =
    hasAppDir &&
    (name === CLIENT_STATIC_FILES_RUNTIME_MAIN_APP ||
      name === APP_CLIENT_INTERNALS ||
      name.startsWith('app/'))

  if (
    // Client special cases
    name !== CLIENT_STATIC_FILES_RUNTIME_POLYFILLS &&
    name !== CLIENT_STATIC_FILES_RUNTIME_MAIN &&
    name !== CLIENT_STATIC_FILES_RUNTIME_MAIN_APP &&
    name !== CLIENT_STATIC_FILES_RUNTIME_AMP &&
    name !== CLIENT_STATIC_FILES_RUNTIME_REACT_REFRESH
  ) {
    if (isAppLayer) {
      return {
        dependOn: CLIENT_STATIC_FILES_RUNTIME_MAIN_APP,
        layer: WEBPACK_LAYERS.appClient,
        ...entry,
      }
    }

    return {
      dependOn:
        name.startsWith('pages/') && name !== 'pages/_app'
          ? 'pages/_app'
          : CLIENT_STATIC_FILES_RUNTIME_MAIN,
      ...entry,
    }
  }

  if (isAppLayer) {
    return {
      layer: WEBPACK_LAYERS.appClient,
      ...entry,
    }
  }

  return entry
}
