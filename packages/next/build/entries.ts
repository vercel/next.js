import type { ClientPagesLoaderOptions } from './webpack/loaders/next-client-pages-loader'
import type { MiddlewareLoaderOptions } from './webpack/loaders/next-middleware-loader'
import type { EdgeSSRLoaderQuery } from './webpack/loaders/next-edge-ssr-loader'
import type { NextConfigComplete } from '../server/config-shared'
import type { ServerRuntime } from '../server/config-shared'
import type { ServerlessLoaderQuery } from './webpack/loaders/next-serverless-loader'
import type { webpack5 } from 'next/dist/compiled/webpack/webpack'
import type { LoadedEnvFiles } from '@next/env'
import chalk from 'next/dist/compiled/chalk'
import { posix, join } from 'path'
import { stringify } from 'querystring'
import {
  API_ROUTE,
  DOT_NEXT_ALIAS,
  PAGES_DIR_ALIAS,
  ROOT_DIR_ALIAS,
  APP_DIR_ALIAS,
  SERVER_RUNTIME,
} from '../lib/constants'
import {
  CLIENT_STATIC_FILES_RUNTIME_AMP,
  CLIENT_STATIC_FILES_RUNTIME_MAIN,
  CLIENT_STATIC_FILES_RUNTIME_MAIN_ROOT,
  CLIENT_STATIC_FILES_RUNTIME_REACT_REFRESH,
  EDGE_RUNTIME_WEBPACK,
} from '../shared/lib/constants'
import { __ApiPreviewProps } from '../server/api-utils'
import { isTargetLikeServerless } from '../server/utils'
import { warn } from './output/log'
import {
  isMiddlewareFile,
  isMiddlewareFilename,
  isServerComponentPage,
  NestedMiddlewareError,
  MiddlewareInServerlessTargetError,
} from './utils'
import { getPageStaticInfo } from './analysis/get-page-static-info'
import { normalizePathSep } from '../shared/lib/page-path/normalize-path-sep'
import { normalizePagePath } from '../shared/lib/page-path/normalize-page-path'
import { serverComponentRegex } from './webpack/loaders/utils'

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
  hasServerComponents,
  isDev,
  pageExtensions,
  pagePaths,
  pagesType,
}: {
  hasServerComponents: boolean
  isDev: boolean
  pageExtensions: string[]
  pagePaths: string[]
  pagesType: 'pages' | 'root' | 'app'
}): { [page: string]: string } {
  const previousPages: { [key: string]: string } = {}
  const pages = pagePaths.reduce<{ [key: string]: string }>(
    (result, pagePath) => {
      // Do not process .d.ts files inside the `pages` folder
      if (pagePath.endsWith('.d.ts') && pageExtensions.includes('ts')) {
        return result
      }

      const pageKey = getPageFromPath(pagePath, pageExtensions)

      // Assume that if there's a Client Component, that there is
      // a matching Server Component that will map to the page.
      // so we will not process it
      if (hasServerComponents && /\.client$/.test(pageKey)) {
        return result
      }

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
  const root = isDev ? PAGES_DIR_ALIAS : 'next/dist/pages'

  return {
    '/_app': `${root}/_app`,
    '/_error': `${root}/_error`,
    '/_document': `${root}/_document`,
    ...pages,
  }
}

interface CreateEntrypointsParams {
  buildId: string
  config: NextConfigComplete
  envFiles: LoadedEnvFiles
  isDev?: boolean
  pages: { [page: string]: string }
  pagesDir: string
  previewMode: __ApiPreviewProps
  rootDir: string
  rootPaths?: Record<string, string>
  target: 'server' | 'serverless' | 'experimental-serverless-trace'
  appDir?: string
  appPaths?: Record<string, string>
  pageExtensions: string[]
}

export function getEdgeServerEntry(opts: {
  absolutePagePath: string
  buildId: string
  bundlePath: string
  config: NextConfigComplete
  isDev: boolean
  isServerComponent: boolean
  page: string
  pages: { [page: string]: string }
  middleware?: { pathMatcher?: RegExp }
}) {
  if (isMiddlewareFile(opts.page)) {
    const loaderParams: MiddlewareLoaderOptions = {
      absolutePagePath: opts.absolutePagePath,
      page: opts.page,
      // pathMatcher can have special characters that break the loader params
      // parsing so we base64 encode/decode the string
      matcherRegexp: Buffer.from(
        (opts.middleware?.pathMatcher && opts.middleware.pathMatcher.source) ||
          ''
      ).toString('base64'),
    }

    return `next-middleware-loader?${stringify(loaderParams)}!`
  }

  if (opts.page.startsWith('/api/') || opts.page === '/api') {
    const loaderParams: MiddlewareLoaderOptions = {
      absolutePagePath: opts.absolutePagePath,
      page: opts.page,
    }

    return `next-edge-function-loader?${stringify(loaderParams)}!`
  }

  const loaderParams: EdgeSSRLoaderQuery = {
    absolute500Path: opts.pages['/500'] || '',
    absoluteAppPath: opts.pages['/_app'],
    absoluteDocumentPath: opts.pages['/_document'],
    absoluteErrorPath: opts.pages['/_error'],
    absolutePagePath: opts.absolutePagePath,
    buildId: opts.buildId,
    dev: opts.isDev,
    isServerComponent: isServerComponentPage(
      opts.config,
      opts.absolutePagePath
    ),
    page: opts.page,
    stringifiedConfig: JSON.stringify(opts.config),
  }

  return {
    import: `next-edge-ssr-loader?${stringify(loaderParams)}!`,
    layer: opts.isServerComponent ? 'sc_server' : undefined,
  }
}

export function getAppEntry(opts: {
  name: string
  pagePath: string
  appDir: string
  pageExtensions: string[]
}) {
  return {
    import: `next-app-loader?${stringify(opts)}!`,
    layer: 'sc_server',
  }
}

export function getServerlessEntry(opts: {
  absolutePagePath: string
  buildId: string
  config: NextConfigComplete
  envFiles: LoadedEnvFiles
  page: string
  previewMode: __ApiPreviewProps
  pages: { [page: string]: string }
}): ObjectValue<webpack5.EntryObject> {
  const loaderParams: ServerlessLoaderQuery = {
    absolute404Path: opts.pages['/404'] || '',
    absoluteAppPath: opts.pages['/_app'],
    absoluteDocumentPath: opts.pages['/_document'],
    absoluteErrorPath: opts.pages['/_error'],
    absolutePagePath: opts.absolutePagePath,
    assetPrefix: opts.config.assetPrefix,
    basePath: opts.config.basePath,
    buildId: opts.buildId,
    canonicalBase: opts.config.amp.canonicalBase || '',
    distDir: DOT_NEXT_ALIAS,
    generateEtags: opts.config.generateEtags ? 'true' : '',
    i18n: opts.config.i18n ? JSON.stringify(opts.config.i18n) : '',
    // base64 encode to make sure contents don't break webpack URL loading
    loadedEnvFiles: Buffer.from(JSON.stringify(opts.envFiles)).toString(
      'base64'
    ),
    page: opts.page,
    poweredByHeader: opts.config.poweredByHeader ? 'true' : '',
    previewProps: JSON.stringify(opts.previewMode),
    runtimeConfig:
      Object.keys(opts.config.publicRuntimeConfig).length > 0 ||
      Object.keys(opts.config.serverRuntimeConfig).length > 0
        ? JSON.stringify({
            publicRuntimeConfig: opts.config.publicRuntimeConfig,
            serverRuntimeConfig: opts.config.serverRuntimeConfig,
          })
        : '',
  }

  return `next-serverless-loader?${stringify(loaderParams)}!`
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

export async function createEntrypoints(params: CreateEntrypointsParams) {
  const {
    config,
    pages,
    pagesDir,
    isDev,
    rootDir,
    rootPaths,
    target,
    appDir,
    appPaths,
    pageExtensions,
  } = params
  const edgeServer: webpack5.EntryObject = {}
  const server: webpack5.EntryObject = {}
  const client: webpack5.EntryObject = {}
  const nestedMiddleware: string[] = []
  let middlewareRegex: string | undefined = undefined

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
        if (absolutePagePath.startsWith(PAGES_DIR_ALIAS)) {
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

      const isServerComponent = serverComponentRegex.test(absolutePagePath)
      const isInsideAppDir = appDir && absolutePagePath.startsWith(appDir)

      const staticInfo = await getPageStaticInfo({
        nextConfig: config,
        pageFilePath,
        isDev,
        page,
      })

      if (isMiddlewareFile(page)) {
        middlewareRegex = staticInfo.middleware?.pathMatcher?.source || '.*'

        if (target === 'serverless') {
          throw new MiddlewareInServerlessTargetError()
        }
      }

      runDependingOnPageType({
        page,
        pageRuntime: staticInfo.runtime,
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
            server[serverBundlePath] = getAppEntry({
              name: serverBundlePath,
              pagePath: mappings[page],
              appDir,
              pageExtensions,
            })
          } else if (isTargetLikeServerless(target)) {
            if (page !== '/_app' && page !== '/_document') {
              server[serverBundlePath] = getServerlessEntry({
                ...params,
                absolutePagePath: mappings[page],
                page,
              })
            }
          } else {
            server[serverBundlePath] = isServerComponent
              ? {
                  import: mappings[page],
                  layer: 'sc_server',
                }
              : [mappings[page]]
          }
        },
        onEdgeServer: () => {
          edgeServer[serverBundlePath] = getEdgeServerEntry({
            ...params,
            absolutePagePath: mappings[page],
            bundlePath: clientBundlePath,
            isDev: false,
            isServerComponent,
            page,
            middleware: staticInfo?.middleware,
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
    throw new NestedMiddlewareError(nestedMiddleware, rootDir, pagesDir)
  }

  return {
    client,
    server,
    edgeServer,
    middlewareRegex,
  }
}

export function runDependingOnPageType<T>(params: {
  onClient: () => T
  onEdgeServer: () => T
  onServer: () => T
  page: string
  pageRuntime: ServerRuntime
}) {
  if (isMiddlewareFile(params.page)) {
    return { edgeServer: params.onEdgeServer() }
  } else if (params.page.match(API_ROUTE)) {
    return params.pageRuntime === SERVER_RUNTIME.edge
      ? { edgeServer: params.onEdgeServer() }
      : { server: params.onServer() }
  } else if (params.page === '/_document') {
    return { server: params.onServer() }
  } else if (
    params.page === '/_app' ||
    params.page === '/_error' ||
    params.page === '/404' ||
    params.page === '/500'
  ) {
    return { client: params.onClient(), server: params.onServer() }
  } else {
    return params.pageRuntime === SERVER_RUNTIME.edge
      ? { client: params.onClient(), edgeServer: params.onEdgeServer() }
      : { client: params.onClient(), server: params.onServer() }
  }
}

export function finalizeEntrypoint({
  name,
  compilerType,
  value,
  isServerComponent,
  appDir,
}: {
  compilerType?: 'client' | 'server' | 'edge-server'
  name: string
  value: ObjectValue<webpack5.EntryObject>
  isServerComponent?: boolean
  appDir?: boolean
}): ObjectValue<webpack5.EntryObject> {
  const entry =
    typeof value !== 'object' || Array.isArray(value)
      ? { import: value }
      : value

  const isApi = name.startsWith('pages/api/')
  if (compilerType === 'server') {
    return {
      publicPath: isApi ? '' : undefined,
      runtime: isApi ? 'webpack-api-runtime' : 'webpack-runtime',
      layer: isApi ? 'api' : isServerComponent ? 'sc_server' : undefined,
      ...entry,
    }
  }

  if (compilerType === 'edge-server') {
    return {
      layer: isMiddlewareFilename(name) || isApi ? 'middleware' : undefined,
      library: { name: ['_ENTRIES', `middleware_[name]`], type: 'assign' },
      runtime: EDGE_RUNTIME_WEBPACK,
      asyncChunks: false,
      ...entry,
    }
  }

  if (
    // Client special cases
    name !== 'polyfills' &&
    name !== CLIENT_STATIC_FILES_RUNTIME_MAIN &&
    name !== CLIENT_STATIC_FILES_RUNTIME_MAIN_ROOT &&
    name !== CLIENT_STATIC_FILES_RUNTIME_AMP &&
    name !== CLIENT_STATIC_FILES_RUNTIME_REACT_REFRESH
  ) {
    // TODO-APP: this is a temporary fix. @shuding is going to change the handling of server components
    if (appDir && entry.import.includes('flight')) {
      return {
        dependOn: CLIENT_STATIC_FILES_RUNTIME_MAIN_ROOT,
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

  return entry
}
