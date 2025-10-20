import type { ClientPagesLoaderOptions } from './webpack/loaders/next-client-pages-loader'
import type { MiddlewareLoaderOptions } from './webpack/loaders/next-middleware-loader'
import type { EdgeSSRLoaderQuery } from './webpack/loaders/next-edge-ssr-loader'
import type { EdgeAppRouteLoaderQuery } from './webpack/loaders/next-edge-app-route-loader'
import type { NextConfigComplete } from '../server/config-shared'
import type { webpack } from 'next/dist/compiled/webpack/webpack'
import type {
  ProxyConfig,
  ProxyMatcher,
  PageStaticInfo,
} from './analysis/get-page-static-info'
import type { LoadedEnvFiles } from '@next/env'
import type { AppLoaderOptions } from './webpack/loaders/next-app-loader'

import { posix, join, normalize } from 'path'
import { stringify } from 'querystring'
import {
  PAGES_DIR_ALIAS,
  ROOT_DIR_ALIAS,
  APP_DIR_ALIAS,
  WEBPACK_LAYERS,
  INSTRUMENTATION_HOOK_FILENAME,
  PROXY_FILENAME,
  MIDDLEWARE_FILENAME,
} from '../lib/constants'
import { isAPIRoute } from '../lib/is-api-route'
import { isEdgeRuntime } from '../lib/is-edge-runtime'
import {
  APP_CLIENT_INTERNALS,
  RSC_MODULE_TYPES,
  UNDERSCORE_NOT_FOUND_ROUTE,
} from '../shared/lib/constants'
import {
  CLIENT_STATIC_FILES_RUNTIME_MAIN,
  CLIENT_STATIC_FILES_RUNTIME_MAIN_APP,
  CLIENT_STATIC_FILES_RUNTIME_POLYFILLS,
  CLIENT_STATIC_FILES_RUNTIME_REACT_REFRESH,
  COMPILER_NAMES,
  EDGE_RUNTIME_WEBPACK,
} from '../shared/lib/constants'
import type { CompilerNameValues } from '../shared/lib/constants'
import type { __ApiPreviewProps } from '../server/api-utils'
import {
  isMiddlewareFile,
  isMiddlewareFilename,
  isInstrumentationHookFile,
  isInstrumentationHookFilename,
} from './utils'
import { getPageStaticInfo } from './analysis/get-page-static-info'
import { normalizePathSep } from '../shared/lib/page-path/normalize-path-sep'
import { normalizePagePath } from '../shared/lib/page-path/normalize-page-path'
import type { ServerRuntime } from '../types'
import { normalizeAppPath } from '../shared/lib/router/utils/app-paths'
import { encodeMatchers } from './webpack/loaders/next-middleware-loader'
import type { EdgeFunctionLoaderOptions } from './webpack/loaders/next-edge-function-loader'
import { isAppRouteRoute } from '../lib/is-app-route-route'
import {
  normalizeMetadataPageToRoute,
  normalizeMetadataRoute,
} from '../lib/metadata/get-metadata-route'
import { getRouteLoaderEntry } from './webpack/loaders/next-route-loader'
import {
  isInternalComponent,
  isNonRoutePagesPage,
} from '../lib/is-internal-component'
import { isMetadataRouteFile } from '../lib/metadata/is-metadata-route'
import { RouteKind } from '../server/route-kind'
import { encodeToBase64 } from './webpack/loaders/utils'
import { normalizeCatchAllRoutes } from './normalize-catchall-routes'
import type { PageExtensions } from './page-extensions-type'
import type { MappedPages } from './build-context'
import { PAGE_TYPES } from '../lib/page-types'
import { recursiveReadDir } from '../lib/recursive-readdir'
import type { createValidFileMatcher } from '../server/lib/find-page-file'
import { isReservedPage } from './utils'
import { isParallelRouteSegment } from '../shared/lib/segment'
import { ensureLeadingSlash } from '../shared/lib/page-path/ensure-leading-slash'
import {
  UNDERSCORE_NOT_FOUND_ROUTE_ENTRY,
  UNDERSCORE_GLOBAL_ERROR_ROUTE,
  UNDERSCORE_GLOBAL_ERROR_ROUTE_ENTRY,
} from '../shared/lib/entry-constants'
import { getStaticInfoIncludingLayouts } from './get-static-info-including-layouts'

/**
 * Collect app pages, layouts, and default files from the app directory
 * @param appDir - The app directory path
 * @param validFileMatcher - File matcher object
 * @returns Object containing appPaths, layoutPaths, and defaultPaths arrays
 */
export async function collectAppFiles(
  appDir: string,
  validFileMatcher: ReturnType<typeof createValidFileMatcher>
): Promise<{
  appPaths: string[]
  layoutPaths: string[]
  defaultPaths: string[]
}> {
  // Collect app pages, layouts, and default files in a single directory traversal
  const allAppFiles = await recursiveReadDir(appDir, {
    pathnameFilter: (absolutePath) =>
      validFileMatcher.isAppRouterPage(absolutePath) ||
      validFileMatcher.isRootNotFound(absolutePath) ||
      validFileMatcher.isAppLayoutPage(absolutePath) ||
      validFileMatcher.isAppDefaultPage(absolutePath),
    ignorePartFilter: (part) => part.startsWith('_'),
  })

  // Separate app pages, layouts, and defaults
  const appPaths = allAppFiles.filter(
    (absolutePath) =>
      validFileMatcher.isAppRouterPage(absolutePath) ||
      validFileMatcher.isRootNotFound(absolutePath)
  )
  const layoutPaths = allAppFiles.filter((absolutePath) =>
    validFileMatcher.isAppLayoutPage(absolutePath)
  )
  const defaultPaths = allAppFiles.filter((absolutePath) =>
    validFileMatcher.isAppDefaultPage(absolutePath)
  )

  return { appPaths, layoutPaths, defaultPaths }
}

/**
 * Collect pages from the pages directory
 * @param pagesDir - The pages directory path
 * @param validFileMatcher - File matcher object
 * @returns Array of page file paths
 */
export async function collectPagesFiles(
  pagesDir: string,
  validFileMatcher: ReturnType<typeof createValidFileMatcher>
): Promise<string[]> {
  return recursiveReadDir(pagesDir, {
    pathnameFilter: validFileMatcher.isPageFile,
  })
}

// Types for route processing
export type RouteInfo = {
  route: string
  filePath: string
}

export type SlotInfo = {
  name: string
  parent: string
}

/**
 * Create a relative file path from a mapped page path
 * @param baseDir - The base directory path
 * @param filePath - The mapped file path (with private prefix)
 * @param prefix - The directory prefix ('pages' or 'app')
 * @param isSrcDir - Whether the project uses src directory structure
 * @returns The relative file path
 */
export function createRelativeFilePath(
  baseDir: string,
  filePath: string,
  prefix: 'pages' | 'app',
  isSrcDir: boolean
): string {
  const privatePrefix =
    prefix === 'pages' ? 'private-next-pages' : 'private-next-app-dir'
  const srcPrefix = isSrcDir ? 'src/' : ''
  return join(
    baseDir,
    filePath.replace(new RegExp(`^${privatePrefix}/`), `${srcPrefix}${prefix}/`)
  )
}

/**
 * Process pages routes from mapped pages
 * @param mappedPages - The mapped pages object
 * @param baseDir - The base directory path
 * @param isSrcDir - Whether the project uses src directory structure
 * @returns Object containing pageRoutes and pageApiRoutes
 */
export function processPageRoutes(
  mappedPages: { [page: string]: string },
  baseDir: string,
  isSrcDir: boolean
): {
  pageRoutes: RouteInfo[]
  pageApiRoutes: RouteInfo[]
} {
  const pageRoutes: RouteInfo[] = []
  const pageApiRoutes: RouteInfo[] = []

  for (const [route, filePath] of Object.entries(mappedPages)) {
    const relativeFilePath = createRelativeFilePath(
      baseDir,
      filePath,
      'pages',
      isSrcDir
    )

    if (route.startsWith('/api/')) {
      pageApiRoutes.push({
        route: normalizePathSep(route),
        filePath: relativeFilePath,
      })
    } else {
      // Filter out _app, _error, _document
      if (isReservedPage(route)) continue

      pageRoutes.push({
        route: normalizePathSep(route),
        filePath: relativeFilePath,
      })
    }
  }

  return { pageRoutes, pageApiRoutes }
}

/**
 * Extract slots from app routes
 * @param mappedAppPages - The mapped app pages object
 * @returns Array of slot information
 */
export function extractSlotsFromAppRoutes(mappedAppPages: {
  [page: string]: string
}): SlotInfo[] {
  const slots: SlotInfo[] = []

  for (const [page] of Object.entries(mappedAppPages)) {
    if (
      page === UNDERSCORE_NOT_FOUND_ROUTE_ENTRY ||
      page === UNDERSCORE_GLOBAL_ERROR_ROUTE_ENTRY
    ) {
      continue
    }

    const segments = page.split('/')
    for (let i = segments.length - 1; i >= 0; i--) {
      const segment = segments[i]
      if (isParallelRouteSegment(segment)) {
        const parentPath = normalizeAppPath(segments.slice(0, i).join('/'))
        const slotName = segment.slice(1)

        // Check if the slot already exists
        if (slots.some((s) => s.name === slotName && s.parent === parentPath))
          continue

        slots.push({
          name: slotName,
          parent: parentPath,
        })
        break
      }
    }
  }

  return slots
}

/**
 * Extract slots from default files
 * @param mappedDefaultFiles - The mapped default files object
 * @returns Array of slot information
 */
export function extractSlotsFromDefaultFiles(mappedDefaultFiles: {
  [page: string]: string
}): SlotInfo[] {
  const slots: SlotInfo[] = []

  for (const [route] of Object.entries(mappedDefaultFiles)) {
    const segments = route.split('/')
    for (let i = segments.length - 1; i >= 0; i--) {
      const segment = segments[i]
      if (isParallelRouteSegment(segment)) {
        const parentPath = normalizeAppPath(segments.slice(0, i).join('/'))
        const slotName = segment.slice(1)

        // Check if the slot already exists
        if (slots.some((s) => s.name === slotName && s.parent === parentPath))
          continue

        slots.push({
          name: slotName,
          parent: parentPath,
        })
        break
      }
    }
  }

  return slots
}

/**
 * Combine and deduplicate slot arrays using a Set
 * @param slotArrays - Arrays of slot information to combine
 * @returns Deduplicated array of slots
 */
export function combineSlots(...slotArrays: SlotInfo[][]): SlotInfo[] {
  const slotSet = new Set<string>()
  const result: SlotInfo[] = []

  for (const slots of slotArrays) {
    for (const slot of slots) {
      const key = `${slot.name}:${slot.parent}`
      if (!slotSet.has(key)) {
        slotSet.add(key)
        result.push(slot)
      }
    }
  }

  return result
}

/**
 * Process app routes from mapped app pages
 * @param mappedAppPages - The mapped app pages object
 * @param validFileMatcher - File matcher object
 * @param baseDir - The base directory path
 * @param isSrcDir - Whether the project uses src directory structure
 * @returns Array of route information
 */
export function processAppRoutes(
  mappedAppPages: { [page: string]: string },
  validFileMatcher: ReturnType<typeof createValidFileMatcher>,
  baseDir: string,
  isSrcDir: boolean
): {
  appRoutes: RouteInfo[]
  appRouteHandlers: RouteInfo[]
} {
  const appRoutes: RouteInfo[] = []
  const appRouteHandlers: RouteInfo[] = []

  for (const [page, filePath] of Object.entries(mappedAppPages)) {
    if (
      page === UNDERSCORE_NOT_FOUND_ROUTE_ENTRY ||
      page === UNDERSCORE_GLOBAL_ERROR_ROUTE_ENTRY
    ) {
      continue
    }

    const relativeFilePath = createRelativeFilePath(
      baseDir,
      filePath,
      'app',
      isSrcDir
    )

    if (validFileMatcher.isAppRouterRoute(filePath)) {
      appRouteHandlers.push({
        route: normalizeAppPath(normalizePathSep(page)),
        filePath: relativeFilePath,
      })
    } else {
      appRoutes.push({
        route: normalizeAppPath(normalizePathSep(page)),
        filePath: relativeFilePath,
      })
    }
  }

  return { appRoutes, appRouteHandlers }
}

/**
 * Process layout routes from mapped app layouts
 * @param mappedAppLayouts - The mapped app layouts object
 * @param baseDir - The base directory path
 * @param isSrcDir - Whether the project uses src directory structure
 * @returns Array of layout route information
 */
export function processLayoutRoutes(
  mappedAppLayouts: { [page: string]: string },
  baseDir: string,
  isSrcDir: boolean
): RouteInfo[] {
  const layoutRoutes: RouteInfo[] = []

  for (const [route, filePath] of Object.entries(mappedAppLayouts)) {
    const relativeFilePath = createRelativeFilePath(
      baseDir,
      filePath,
      'app',
      isSrcDir
    )
    layoutRoutes.push({
      route: ensureLeadingSlash(
        normalizeAppPath(normalizePathSep(route)).replace(/\/layout$/, '')
      ),
      filePath: relativeFilePath,
    })
  }

  return layoutRoutes
}

type ObjectValue<T> = T extends { [key: string]: infer V } ? V : never

/**
 * For a given page path removes the provided extensions.
 */
export function getPageFromPath(
  pagePath: string,
  pageExtensions: PageExtensions
) {
  let page = normalizePathSep(
    pagePath.replace(new RegExp(`\\.+(${pageExtensions.join('|')})$`), '')
  )

  page = page.replace(/\/index$/, '')

  return page === '' ? '/' : page
}

export function getPageFilePath({
  absolutePagePath,
  pagesDir,
  appDir,
  rootDir,
}: {
  absolutePagePath: string
  pagesDir: string | undefined
  appDir: string | undefined
  rootDir: string
}) {
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
}

/**
 * Creates a mapping of route to page file path for a given list of page paths.
 * For example ['/middleware.ts'] is turned into  { '/middleware': `${ROOT_DIR_ALIAS}/middleware.ts` }
 */
export async function createPagesMapping({
  isDev,
  pageExtensions,
  pagePaths,
  pagesType,
  pagesDir,
  appDir,
  appDirOnly,
}: {
  isDev: boolean
  pageExtensions: PageExtensions
  pagePaths: string[]
  pagesType: PAGE_TYPES
  pagesDir: string | undefined
  appDir: string | undefined
  appDirOnly: boolean
}): Promise<MappedPages> {
  const isAppRoute = pagesType === 'app'
  const pages: MappedPages = {}
  const promises = pagePaths.map<Promise<void>>(async (pagePath) => {
    // Do not process .d.ts files as routes
    if (pagePath.endsWith('.d.ts') && pageExtensions.includes('ts')) {
      return
    }

    let pageKey = getPageFromPath(pagePath, pageExtensions)
    if (isAppRoute) {
      pageKey = pageKey.replace(/%5F/g, '_')
      if (pageKey === UNDERSCORE_NOT_FOUND_ROUTE) {
        pageKey = UNDERSCORE_NOT_FOUND_ROUTE_ENTRY
      }
      if (pageKey === UNDERSCORE_GLOBAL_ERROR_ROUTE) {
        pageKey = UNDERSCORE_GLOBAL_ERROR_ROUTE_ENTRY
      }
    }

    const normalizedPath = normalizePathSep(
      join(
        pagesType === 'pages'
          ? PAGES_DIR_ALIAS
          : pagesType === 'app'
            ? APP_DIR_ALIAS
            : ROOT_DIR_ALIAS,
        pagePath
      )
    )

    let route = pagesType === 'app' ? normalizeMetadataRoute(pageKey) : pageKey

    if (
      pagesType === 'app' &&
      isMetadataRouteFile(pagePath, pageExtensions, true)
    ) {
      const filePath = join(appDir!, pagePath)
      const staticInfo = await getPageStaticInfo({
        nextConfig: {},
        pageFilePath: filePath,
        isDev,
        page: pageKey,
        pageType: pagesType,
      })

      route = normalizeMetadataPageToRoute(
        route,
        !!(staticInfo.generateImageMetadata || staticInfo.generateSitemaps)
      )
    }

    pages[route] = normalizedPath
  })

  await Promise.all(promises)

  switch (pagesType) {
    case PAGE_TYPES.ROOT: {
      return pages
    }
    case PAGE_TYPES.APP: {
      const hasAppPages = Object.keys(pages).length > 0
      // Whether to emit App router 500.html entry, which only presents in production and only app router presents
      const hasAppGlobalError = !isDev && appDirOnly
      return {
        // If there's any app pages existed, add a default /_not-found route as 404.
        // If there's any custom /_not-found page, it will override the default one.
        ...(hasAppPages && {
          [UNDERSCORE_NOT_FOUND_ROUTE_ENTRY]: require.resolve(
            'next/dist/client/components/builtin/global-not-found'
          ),
        }),
        ...(hasAppGlobalError && {
          [UNDERSCORE_GLOBAL_ERROR_ROUTE_ENTRY]: require.resolve(
            'next/dist/client/components/builtin/app-error'
          ),
        }),
        ...pages,
      }
    }
    case PAGE_TYPES.PAGES: {
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
        // Don't add default pages entries if this is an app-router-only build
        ...((isDev || !appDirOnly) && {
          '/_app': `${root}/_app`,
          '/_error': `${root}/_error`,
          '/_document': `${root}/_document`,
          ...pages,
        }),
      }
    }
    default: {
      return {}
    }
  }
}

export interface CreateEntrypointsParams {
  buildId: string
  config: NextConfigComplete
  envFiles: LoadedEnvFiles
  isDev?: boolean
  pages: MappedPages
  pagesDir?: string
  previewMode: __ApiPreviewProps
  rootDir: string
  rootPaths?: MappedPages
  appDir?: string
  appPaths?: MappedPages
  pageExtensions: PageExtensions
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
  pages: MappedPages
  middleware?: Partial<ProxyConfig>
  pagesType: PAGE_TYPES
  appDirLoader?: string
  hasInstrumentationHook?: boolean
  preferredRegion: string | string[] | undefined
  middlewareConfig?: ProxyConfig
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
      nextConfig: Buffer.from(JSON.stringify(opts.config)).toString('base64'),
      preferredRegion: opts.preferredRegion,
      middlewareConfig: Buffer.from(
        JSON.stringify(opts.middlewareConfig || {})
      ).toString('base64'),
      cacheHandlers: JSON.stringify(
        opts.config.experimental.cacheHandlers || {}
      ),
    }

    return {
      import: `next-edge-app-route-loader?${stringify(loaderParams)}!`,
      layer: WEBPACK_LAYERS.reactServerComponents,
    }
  }

  if (isMiddlewareFile(opts.page)) {
    const loaderParams: MiddlewareLoaderOptions = {
      absolutePagePath: opts.absolutePagePath,
      page: opts.page,
      rootDir: opts.rootDir,
      matchers: opts.middleware?.matchers
        ? encodeMatchers(opts.middleware.matchers)
        : '',
      preferredRegion: opts.preferredRegion,
      middlewareConfig: Buffer.from(
        JSON.stringify(opts.middlewareConfig || {})
      ).toString('base64'),
    }

    return {
      import: `next-middleware-loader?${stringify(loaderParams)}!`,
      layer: WEBPACK_LAYERS.middleware,
    }
  }

  if (isAPIRoute(opts.page)) {
    const loaderParams: EdgeFunctionLoaderOptions = {
      absolutePagePath: opts.absolutePagePath,
      page: opts.page,
      rootDir: opts.rootDir,
      preferredRegion: opts.preferredRegion,
      middlewareConfig: Buffer.from(
        JSON.stringify(opts.middlewareConfig || {})
      ).toString('base64'),
    }

    return {
      import: `next-edge-function-loader?${stringify(loaderParams)}!`,
      layer: WEBPACK_LAYERS.apiEdge,
    }
  }

  const loaderParams: EdgeSSRLoaderQuery = {
    absolute500Path: opts.pages['/500'] || '',
    absoluteAppPath: opts.pages['/_app'],
    absoluteDocumentPath: opts.pages['/_document'],
    absoluteErrorPath: opts.pages['/_error'],
    absolutePagePath: opts.absolutePagePath,
    dev: opts.isDev,
    isServerComponent: opts.isServerComponent,
    page: opts.page,
    stringifiedConfig: Buffer.from(JSON.stringify(opts.config)).toString(
      'base64'
    ),
    pagesType: opts.pagesType,
    appDirLoader: Buffer.from(opts.appDirLoader || '').toString('base64'),
    sriEnabled: !opts.isDev && !!opts.config.experimental.sri?.algorithm,
    cacheHandler: opts.config.cacheHandler,
    preferredRegion: opts.preferredRegion,
    middlewareConfig: Buffer.from(
      JSON.stringify(opts.middlewareConfig || {})
    ).toString('base64'),
    serverActions: opts.config.experimental.serverActions,
    cacheHandlers: JSON.stringify(opts.config.experimental.cacheHandlers || {}),
  }

  return {
    import: `next-edge-ssr-loader?${JSON.stringify(loaderParams)}!`,
    // The Edge bundle includes the server in its entrypoint, so it has to
    // be in the SSR layer — we later convert the page request to the RSC layer
    // via a webpack rule.
    layer: opts.appDirLoader ? WEBPACK_LAYERS.serverSideRendering : undefined,
  }
}

export function getInstrumentationEntry(opts: {
  absolutePagePath: string
  isEdgeServer: boolean
  isDev: boolean
}) {
  // the '../' is needed to make sure the file is not chunked
  const filename = `${
    opts.isEdgeServer ? 'edge-' : opts.isDev ? '' : '../'
  }${INSTRUMENTATION_HOOK_FILENAME}.js`

  return {
    import: opts.absolutePagePath,
    filename,
    layer: WEBPACK_LAYERS.instrument,
  }
}

export function getAppLoader() {
  return process.env.BUILTIN_APP_LOADER
    ? `builtin:next-app-loader`
    : 'next-app-loader'
}

export function getAppEntry(opts: Readonly<AppLoaderOptions>) {
  if (process.env.NEXT_RSPACK && process.env.BUILTIN_APP_LOADER) {
    ;(opts as any).projectRoot = normalize(join(__dirname, '../../..'))
  }
  return {
    import: `${getAppLoader()}?${stringify(opts)}!`,
    layer: WEBPACK_LAYERS.reactServerComponents,
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

export function runDependingOnPageType<T>(params: {
  onClient: () => T
  onEdgeServer: () => T
  onServer: () => T
  page: string
  pageRuntime: ServerRuntime
  pageType?: PAGE_TYPES
}): void {
  if (
    params.pageType === PAGE_TYPES.ROOT &&
    isInstrumentationHookFile(params.page)
  ) {
    params.onServer()
    params.onEdgeServer()
    return
  }

  if (isMiddlewareFile(params.page)) {
    if (params.pageRuntime === 'nodejs') {
      params.onServer()
      return
    } else {
      params.onEdgeServer()
      return
    }
  }

  if (isAPIRoute(params.page)) {
    if (isEdgeRuntime(params.pageRuntime)) {
      params.onEdgeServer()
      return
    }

    params.onServer()
    return
  }
  if (params.page === '/_document') {
    params.onServer()
    return
  }
  if (
    params.page === '/_app' ||
    params.page === '/_error' ||
    params.page === '/404' ||
    params.page === '/500'
  ) {
    params.onClient()
    params.onServer()
    return
  }
  if (isEdgeRuntime(params.pageRuntime)) {
    params.onClient()
    params.onEdgeServer()
    return
  }

  params.onClient()
  params.onServer()
  return
}

export async function createEntrypoints(
  params: CreateEntrypointsParams
): Promise<{
  client: webpack.EntryObject
  server: webpack.EntryObject
  edgeServer: webpack.EntryObject
  middlewareMatchers: undefined
}> {
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
  let middlewareMatchers: ProxyMatcher[] | undefined = undefined

  let appPathsPerRoute: Record<string, string[]> = {}
  if (appDir && appPaths) {
    for (const pathname in appPaths) {
      const normalizedPath = normalizeAppPath(pathname)
      const actualPath = appPaths[pathname]
      if (!appPathsPerRoute[normalizedPath]) {
        appPathsPerRoute[normalizedPath] = []
      }
      appPathsPerRoute[normalizedPath].push(
        // TODO-APP: refactor to pass the page path from createPagesMapping instead.
        getPageFromPath(actualPath, pageExtensions).replace(APP_DIR_ALIAS, '')
      )
    }

    // TODO: find a better place to do this
    normalizeCatchAllRoutes(appPathsPerRoute)

    // Make sure to sort parallel routes to make the result deterministic.
    appPathsPerRoute = Object.fromEntries(
      Object.entries(appPathsPerRoute).map(([k, v]) => [k, v.sort()])
    )
  }

  const getEntryHandler =
    (mappings: MappedPages, pagesType: PAGE_TYPES): ((page: string) => void) =>
    async (page) => {
      const bundleFile = normalizePagePath(page)
      const clientBundlePath = posix.join(pagesType, bundleFile)
      const serverBundlePath =
        pagesType === PAGE_TYPES.PAGES
          ? posix.join('pages', bundleFile)
          : pagesType === PAGE_TYPES.APP
            ? posix.join('app', bundleFile)
            : bundleFile.slice(1)

      const absolutePagePath = mappings[page]

      // Handle paths that have aliases
      const pageFilePath = getPageFilePath({
        absolutePagePath,
        pagesDir,
        appDir,
        rootDir,
      })

      const isInsideAppDir =
        !!appDir &&
        (absolutePagePath.startsWith(APP_DIR_ALIAS) ||
          absolutePagePath.startsWith(appDir))

      const staticInfo: PageStaticInfo = await getStaticInfoIncludingLayouts({
        isInsideAppDir,
        pageExtensions,
        pageFilePath,
        appDir,
        config,
        isDev,
        page,
      })

      // TODO(timneutkens): remove this
      const isServerComponent =
        isInsideAppDir && staticInfo.rsc !== RSC_MODULE_TYPES.client

      if (isMiddlewareFile(page)) {
        middlewareMatchers = staticInfo.middleware?.matchers ?? [
          { regexp: '.*', originalSource: '/:path*' },
        ]
      }

      const isInstrumentation =
        isInstrumentationHookFile(page) && pagesType === PAGE_TYPES.ROOT

      runDependingOnPageType({
        page,
        pageRuntime: staticInfo.runtime,
        pageType: pagesType,
        onClient: () => {
          if (isServerComponent || isInsideAppDir) {
            // We skip the initial entries for server component pages and let the
            // server compiler inject them instead.
          } else {
            client[clientBundlePath] = getClientEntry({
              absolutePagePath,
              page,
            })
          }
        },
        onServer: () => {
          if (pagesType === 'app' && appDir) {
            const matchedAppPaths = appPathsPerRoute[normalizeAppPath(page)]
            server[serverBundlePath] = getAppEntry({
              page,
              name: serverBundlePath,
              pagePath: absolutePagePath,
              appDir,
              appPaths: matchedAppPaths,
              pageExtensions,
              basePath: config.basePath,
              assetPrefix: config.assetPrefix,
              nextConfigOutput: config.output,
              preferredRegion: staticInfo.preferredRegion,
              middlewareConfig: encodeToBase64(staticInfo.middleware || {}),
              isGlobalNotFoundEnabled: config.experimental.globalNotFound
                ? true
                : undefined,
            })
          } else if (isInstrumentation) {
            server[serverBundlePath.replace('src/', '')] =
              getInstrumentationEntry({
                absolutePagePath,
                isEdgeServer: false,
                isDev: false,
              })
          } else if (isMiddlewareFile(page)) {
            server[
              serverBundlePath
                // proxy.js still uses middleware.js for bundle path for now.
                // TODO: Revisit when we remove middleware.js.
                .replace(PROXY_FILENAME, MIDDLEWARE_FILENAME)
                .replace('src/', '')
            ] = getEdgeServerEntry({
              ...params,
              rootDir,
              absolutePagePath: absolutePagePath,
              bundlePath: clientBundlePath,
              isDev: false,
              isServerComponent,
              page,
              middleware: staticInfo?.middleware,
              pagesType,
              preferredRegion: staticInfo.preferredRegion,
              middlewareConfig: staticInfo.middleware,
            })
          } else if (isAPIRoute(page)) {
            server[serverBundlePath] = [
              getRouteLoaderEntry({
                kind: RouteKind.PAGES_API,
                page,
                absolutePagePath,
                preferredRegion: staticInfo.preferredRegion,
                middlewareConfig: staticInfo.middleware || {},
              }),
            ]
          } else if (
            !isMiddlewareFile(page) &&
            !isInternalComponent(absolutePagePath) &&
            !isNonRoutePagesPage(page)
          ) {
            server[serverBundlePath] = [
              getRouteLoaderEntry({
                kind: RouteKind.PAGES,
                page,
                pages,
                absolutePagePath,
                preferredRegion: staticInfo.preferredRegion,
                middlewareConfig: staticInfo.middleware ?? {},
              }),
            ]
          } else {
            server[serverBundlePath] = [absolutePagePath]
          }
        },
        onEdgeServer: () => {
          let appDirLoader: string = ''
          if (isInstrumentation) {
            edgeServer[serverBundlePath.replace('src/', '')] =
              getInstrumentationEntry({
                absolutePagePath,
                isEdgeServer: true,
                isDev: false,
              })
          } else {
            if (pagesType === 'app') {
              const matchedAppPaths = appPathsPerRoute[normalizeAppPath(page)]
              appDirLoader = getAppEntry({
                name: serverBundlePath,
                page,
                pagePath: absolutePagePath,
                appDir: appDir!,
                appPaths: matchedAppPaths,
                pageExtensions,
                basePath: config.basePath,
                assetPrefix: config.assetPrefix,
                nextConfigOutput: config.output,
                // This isn't used with edge as it needs to be set on the entry module, which will be the `edgeServerEntry` instead.
                // Still passing it here for consistency.
                preferredRegion: staticInfo.preferredRegion,
                middlewareConfig: Buffer.from(
                  JSON.stringify(staticInfo.middleware || {})
                ).toString('base64'),
                isGlobalNotFoundEnabled: config.experimental.globalNotFound
                  ? true
                  : undefined,
              }).import
            }
            const edgeServerBundlePath = isMiddlewareFile(page)
              ? serverBundlePath
                  .replace(PROXY_FILENAME, MIDDLEWARE_FILENAME)
                  .replace('src/', '')
              : serverBundlePath
            edgeServer[edgeServerBundlePath] = getEdgeServerEntry({
              ...params,
              rootDir,
              absolutePagePath: absolutePagePath,
              bundlePath: clientBundlePath,
              isDev: false,
              isServerComponent,
              page,
              middleware: staticInfo?.middleware,
              pagesType,
              appDirLoader,
              preferredRegion: staticInfo.preferredRegion,
              middlewareConfig: staticInfo.middleware,
            })
          }
        },
      })
    }

  const promises: Promise<void[]>[] = []

  if (appPaths) {
    const entryHandler = getEntryHandler(appPaths, PAGE_TYPES.APP)
    promises.push(Promise.all(Object.keys(appPaths).map(entryHandler)))
  }
  if (rootPaths) {
    promises.push(
      Promise.all(
        Object.keys(rootPaths).map(getEntryHandler(rootPaths, PAGE_TYPES.ROOT))
      )
    )
  }
  promises.push(
    Promise.all(
      Object.keys(pages).map(getEntryHandler(pages, PAGE_TYPES.PAGES))
    )
  )

  await Promise.all(promises)

  // Optimization: If there's only one instrumentation hook in edge compiler, which means there's no edge server entry.
  // We remove the edge instrumentation entry from edge compiler as it can be pure server side.
  if (edgeServer.instrumentation && Object.keys(edgeServer).length === 1) {
    delete edgeServer.instrumentation
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
  compilerType: CompilerNameValues
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
  const isInstrumentation = isInstrumentationHookFilename(name)

  switch (compilerType) {
    case COMPILER_NAMES.server: {
      const layer = isApi
        ? WEBPACK_LAYERS.apiNode
        : isInstrumentation
          ? WEBPACK_LAYERS.instrument
          : isServerComponent
            ? WEBPACK_LAYERS.reactServerComponents
            : name.startsWith('pages/')
              ? WEBPACK_LAYERS.pagesDirNode
              : undefined

      return {
        publicPath: isApi ? '' : undefined,
        runtime: isApi ? 'webpack-api-runtime' : 'webpack-runtime',
        layer,
        ...entry,
      }
    }
    case COMPILER_NAMES.edgeServer: {
      return {
        layer: isApi
          ? WEBPACK_LAYERS.apiEdge
          : isMiddlewareFilename(name) || isInstrumentation
            ? WEBPACK_LAYERS.middleware
            : name.startsWith('pages/')
              ? WEBPACK_LAYERS.pagesDirEdge
              : undefined,
        library: { name: ['_ENTRIES', `middleware_[name]`], type: 'assign' },
        runtime: EDGE_RUNTIME_WEBPACK,
        asyncChunks: false,
        ...entry,
      }
    }
    case COMPILER_NAMES.client: {
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
        name !== CLIENT_STATIC_FILES_RUNTIME_REACT_REFRESH
      ) {
        if (isAppLayer) {
          return {
            dependOn: CLIENT_STATIC_FILES_RUNTIME_MAIN_APP,
            layer: WEBPACK_LAYERS.appPagesBrowser,
            ...entry,
          }
        }

        return {
          dependOn:
            name.startsWith('pages/') && name !== 'pages/_app'
              ? 'pages/_app'
              : CLIENT_STATIC_FILES_RUNTIME_MAIN,
          layer: WEBPACK_LAYERS.pagesDirBrowser,
          ...entry,
        }
      }

      if (isAppLayer) {
        return {
          layer: WEBPACK_LAYERS.appPagesBrowser,
          ...entry,
        }
      }

      return {
        layer: WEBPACK_LAYERS.pagesDirBrowser,
        ...entry,
      }
    }
    default:
      return compilerType satisfies never
  }
}
