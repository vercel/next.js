import { join } from 'path'
import { createValidFileMatcher } from '../server/lib/find-page-file'
import { recursiveReadDir } from '../lib/recursive-readdir'
import {
  APP_DIR_ALIAS,
  PAGES_DIR_ALIAS,
  ROOT_DIR_ALIAS,
} from '../lib/constants'
import { normalizePathSep } from '../shared/lib/page-path/normalize-path-sep'
import { normalizeAppPath } from '../shared/lib/router/utils/app-paths'
import { ensureLeadingSlash } from '../shared/lib/page-path/ensure-leading-slash'
import { PAGE_TYPES } from '../lib/page-types'
import {
  extractSlotsFromRoutes,
  combineSlots,
  type SlotInfo,
  type RouteInfo,
} from './file-classifier'
import {
  normalizeMetadataRoute,
  normalizeMetadataPageToRoute,
} from '../lib/metadata/get-metadata-route'
import { isMetadataRouteFile } from '../lib/metadata/is-metadata-route'
import { getPageStaticInfo } from './analysis/get-page-static-info'
import {
  UNDERSCORE_NOT_FOUND_ROUTE,
  UNDERSCORE_NOT_FOUND_ROUTE_ENTRY,
  UNDERSCORE_GLOBAL_ERROR_ROUTE,
  UNDERSCORE_GLOBAL_ERROR_ROUTE_ENTRY,
} from '../shared/lib/entry-constants'
import { isReservedPage } from './utils'
import type { PageExtensions } from './page-extensions-type'
import type { MappedPages } from './build-context'

const PRIVATE_PAGES_PREFIX_REGEX = /^private-next-pages\//
const PRIVATE_APP_PREFIX_REGEX = /^private-next-app-dir\//
const SKIP_ROUTES = new Set([
  UNDERSCORE_NOT_FOUND_ROUTE_ENTRY,
  UNDERSCORE_GLOBAL_ERROR_ROUTE_ENTRY,
])

function removeSuffix(value: string, suffix: string): string {
  return value.endsWith(suffix) ? value.slice(0, -suffix.length) : value
}

/** Normalize a route for the app router */
function normalizeAppRoute(pageName: string): string {
  return normalizeAppPath(normalizePathSep(pageName))
}

/** Normalize a layout route (strip /layout suffix) */
function normalizeLayoutRoute(pageName: string): string {
  return ensureLeadingSlash(
    removeSuffix(normalizeAppPath(normalizePathSep(pageName)), '/layout')
  )
}

/**
 * For a given page path removes the provided extensions.
 */
export function getPageFromPath(
  pagePath: string,
  pageExtensions: PageExtensions
) {
  let page = normalizePathSep(pagePath)
  // Try longer extensions first so compound extensions like 'page.js'
  // match before shorter ones like 'js'
  const sorted = [...pageExtensions].sort((a, b) => b.length - a.length)
  for (const extension of sorted) {
    const next = removeSuffix(page, `.${extension}`)
    if (next !== page) {
      page = next
      break
    }
  }

  page = removeSuffix(page, '/index')

  return page === '' ? '/' : page
}

/**
 * Collect app pages, layouts, and default files from the app directory
 */
export async function collectAppFiles(
  appDir: string,
  validFileMatcher: ReturnType<typeof createValidFileMatcher>
): Promise<{
  appPaths: string[]
  layoutPaths: string[]
  defaultPaths: string[]
}> {
  const allAppFiles = await recursiveReadDir(appDir, {
    pathnameFilter: (absolutePath) =>
      validFileMatcher.isAppRouterPage(absolutePath) ||
      validFileMatcher.isRootNotFound(absolutePath) ||
      validFileMatcher.isAppLayoutPage(absolutePath) ||
      validFileMatcher.isAppDefaultPage(absolutePath),
    ignorePartFilter: (part) => part.startsWith('_'),
  })

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
 */
export async function collectPagesFiles(
  pagesDir: string,
  validFileMatcher: ReturnType<typeof createValidFileMatcher>
): Promise<string[]> {
  return await recursiveReadDir(pagesDir, {
    pathnameFilter: validFileMatcher.isPageFile,
  })
}

/**
 * Create a relative file path from a mapped page path
 */
export function createRelativeFilePath(
  baseDir: string,
  filePath: string,
  prefix: 'pages' | 'app',
  isSrcDir: boolean
): string {
  const privatePrefixRegex =
    prefix === 'pages' ? PRIVATE_PAGES_PREFIX_REGEX : PRIVATE_APP_PREFIX_REGEX
  const srcPrefix = isSrcDir ? 'src/' : ''
  return join(
    baseDir,
    filePath.replace(privatePrefixRegex, `${srcPrefix}${prefix}/`)
  )
}

/**
 * Process pages routes from mapped pages
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
 * Process app routes from mapped app pages
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
    const route = normalizeAppRoute(page)

    if (validFileMatcher.isAppRouterRoute(filePath)) {
      appRouteHandlers.push({ route, filePath: relativeFilePath })
    } else {
      appRoutes.push({ route, filePath: relativeFilePath })
    }
  }

  return { appRoutes, appRouteHandlers }
}

/**
 * Process layout routes from mapped app layouts
 */
export function processLayoutRoutes(
  mappedAppLayouts: { [page: string]: string },
  baseDir: string,
  isSrcDir: boolean
): RouteInfo[] {
  return Object.entries(mappedAppLayouts).map(([route, filePath]) => ({
    route: normalizeLayoutRoute(route),
    filePath: createRelativeFilePath(baseDir, filePath, 'app', isSrcDir),
  }))
}

/**
 * Creates a mapping of route to page file path for a given list of page paths.
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

  const promises = pagePaths.map<Promise<[string, string] | undefined>>(
    async (pagePath) => {
      if (pagePath.endsWith('.d.ts') && pageExtensions.includes('ts')) {
        return
      }

      let pageKey = getPageFromPath(pagePath, pageExtensions)
      if (isAppRoute) {
        // Turbopack encodes '_' as '%5F' in app paths; normalize to underscores.
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
          pagesType === PAGE_TYPES.PAGES
            ? PAGES_DIR_ALIAS
            : pagesType === PAGE_TYPES.APP
              ? APP_DIR_ALIAS
              : ROOT_DIR_ALIAS,
          pagePath
        )
      )

      let route =
        pagesType === PAGE_TYPES.APP ? normalizeMetadataRoute(pageKey) : pageKey

      if (
        pagesType === PAGE_TYPES.APP &&
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

      return [route, normalizedPath]
    }
  )

  const pages: MappedPages = Object.fromEntries(
    (await Promise.all(promises)).filter((entry) => entry != null)
  )

  switch (pagesType) {
    case PAGE_TYPES.ROOT: {
      return pages
    }
    case PAGE_TYPES.APP: {
      const hasAppPages = Object.keys(pages).length > 0
      const hasAppGlobalError = !isDev && appDirOnly
      return {
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

      const root = isDev && pagesDir ? PAGES_DIR_ALIAS : 'next/dist/pages'

      if (Object.keys(pages).length === 0 && !appDirOnly) {
        appDirOnly = true
      }

      return {
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

export interface RouteDiscoveryOptions {
  appDir?: string
  pagesDir?: string
  pageExtensions: string[]
  isDev: boolean
  baseDir: string
  /** Whether the app/pages directories are under a /src directory. */
  isSrcDir?: boolean
  /** Override app-dir-only mode (e.g. from --experimental-app-only CLI flag) */
  appDirOnly?: boolean
  validFileMatcher?: ReturnType<typeof createValidFileMatcher>
  debugBuildPaths?: { app: string[]; pages: string[] }
}

export interface RouteDiscoveryResult {
  appRoutes: RouteInfo[]
  appRouteHandlers: RouteInfo[]
  layoutRoutes: RouteInfo[]
  slots: SlotInfo[]
  pageRoutes: RouteInfo[]
  pageApiRoutes: RouteInfo[]
  mappedAppPages?: MappedPages
  mappedAppLayouts?: MappedPages
  mappedPages?: MappedPages
  /** Raw page file paths (post-filtering), useful for telemetry */
  pagesPaths: string[]
  /** Resolved app-dir-only state (may have been updated during discovery) */
  appDirOnly: boolean
}

/**
 * High-level API: Collect, map, and process all routes in one call
 */
export async function discoverRoutes(
  options: RouteDiscoveryOptions
): Promise<RouteDiscoveryResult> {
  const {
    appDir,
    pagesDir,
    pageExtensions,
    isDev,
    baseDir,
    isSrcDir,
    debugBuildPaths,
  } = options

  const validFileMatcher =
    options.validFileMatcher || createValidFileMatcher(pageExtensions, appDir)

  let appDirOnly = options.appDirOnly ?? (!!appDir && !pagesDir)

  // Helper to reduce createPagesMapping boilerplate
  const mapPaths = (pagePaths: string[], pagesType: PAGE_TYPES) =>
    createPagesMapping({
      pagePaths,
      isDev,
      pagesType,
      pageExtensions,
      pagesDir,
      appDir,
      appDirOnly,
    })

  // Helper to apply debugBuildPaths filtering
  const applyDebugFilter = (
    paths: string[],
    debugPaths: string[]
  ): string[] => {
    if (debugPaths.length > 0) {
      const debugPathsSet = new Set(debugPaths)
      return paths.filter((p) => debugPathsSet.has(p))
    }
    // Empty array means build none
    return []
  }

  let pageRoutes: RouteInfo[] = []
  let pageApiRoutes: RouteInfo[] = []
  let mappedPages: MappedPages | undefined
  let pagesPaths: string[] = []

  if (pagesDir && !appDirOnly) {
    if (process.env.NEXT_PRIVATE_PAGE_PATHS) {
      pagesPaths = JSON.parse(process.env.NEXT_PRIVATE_PAGE_PATHS)
    } else {
      pagesPaths = await collectPagesFiles(pagesDir, validFileMatcher)

      if (debugBuildPaths) {
        pagesPaths = applyDebugFilter(pagesPaths, debugBuildPaths.pages)
      }
    }

    mappedPages = await mapPaths(pagesPaths, PAGE_TYPES.PAGES)

    // Update appDirOnly if no user page routes were found, so the
    // subsequent app mapping can emit the global error entry.
    if (Object.keys(mappedPages).length === 0) {
      appDirOnly = true
    }

    ;({ pageRoutes, pageApiRoutes } = processPageRoutes(
      mappedPages,
      baseDir,
      !!isSrcDir
    ))
  }

  let appRoutes: RouteInfo[] = []
  let appRouteHandlers: RouteInfo[] = []
  let layoutRoutes: RouteInfo[] = []
  let slots: SlotInfo[] = []
  let mappedAppPages: MappedPages | undefined
  let mappedAppLayouts: MappedPages | undefined

  if (appDir) {
    let appPaths: string[]
    let layoutPaths: string[]
    let defaultPaths: string[]

    if (process.env.NEXT_PRIVATE_APP_PATHS) {
      // Used for testing — override collected app paths
      appPaths = JSON.parse(process.env.NEXT_PRIVATE_APP_PATHS)
      layoutPaths = []
      defaultPaths = []
    } else {
      const result = await collectAppFiles(appDir, validFileMatcher)
      appPaths = result.appPaths
      layoutPaths = result.layoutPaths
      defaultPaths = result.defaultPaths

      if (debugBuildPaths) {
        appPaths = applyDebugFilter(appPaths, debugBuildPaths.app)
      }
    }

    // Map all app file types in parallel
    let mappedDefaultFiles: MappedPages
    ;[mappedAppPages, mappedAppLayouts, mappedDefaultFiles] = await Promise.all(
      [
        mapPaths(appPaths, PAGE_TYPES.APP),
        mapPaths(layoutPaths, PAGE_TYPES.APP),
        mapPaths(defaultPaths, PAGE_TYPES.APP),
      ]
    )

    // Extract slots from pages and default files
    slots = combineSlots(
      extractSlotsFromRoutes(mappedAppPages, SKIP_ROUTES),
      extractSlotsFromRoutes(mappedDefaultFiles)
    )

    // Process routes
    ;({ appRoutes, appRouteHandlers } = processAppRoutes(
      mappedAppPages,
      validFileMatcher,
      baseDir,
      !!isSrcDir
    ))
    layoutRoutes = processLayoutRoutes(mappedAppLayouts, baseDir, !!isSrcDir)
  }

  return {
    appRoutes,
    appRouteHandlers,
    layoutRoutes,
    slots,
    pageRoutes,
    pageApiRoutes,
    mappedAppPages,
    mappedAppLayouts,
    mappedPages,
    pagesPaths,
    appDirOnly,
  }
}
