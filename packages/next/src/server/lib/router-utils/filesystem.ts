import type { PrerenderManifest, RoutesManifest } from '../../../build'
import type { NextConfigComplete } from '../../config-shared'
import type { MiddlewareManifest } from '../../../build/webpack/plugins/middleware-plugin'

import path from 'path'
import fs from 'fs/promises'
import * as Log from '../../../build/output/log'
import LRUCache from 'next/dist/compiled/lru-cache'
import loadCustomRoutes from '../../../lib/load-custom-routes'
import { modifyRouteRegex } from '../../../lib/redirect-status'
import { UnwrapPromise } from '../../../lib/coalesced-function'
import { FileType, fileExists } from '../../../lib/file-exists'
import { recursiveReadDir } from '../../../lib/recursive-readdir'
import { isDynamicRoute } from '../../../shared/lib/router/utils'
import { escapeStringRegexp } from '../../../shared/lib/escape-regexp'
import { getPathMatch } from '../../../shared/lib/router/utils/path-match'
import { getRouteRegex } from '../../../shared/lib/router/utils/route-regex'
import { getRouteMatcher } from '../../../shared/lib/router/utils/route-matcher'
import { pathHasPrefix } from '../../../shared/lib/router/utils/path-has-prefix'
import { normalizeLocalePath } from '../../../shared/lib/i18n/normalize-locale-path'
import { removePathPrefix } from '../../../shared/lib/router/utils/remove-path-prefix'

import {
  MiddlewareRouteMatch,
  getMiddlewareRouteMatcher,
} from '../../../shared/lib/router/utils/middleware-route-matcher'

import {
  APP_PATH_ROUTES_MANIFEST,
  BUILD_ID_FILE,
  MIDDLEWARE_MANIFEST,
  PAGES_MANIFEST,
  PRERENDER_MANIFEST,
  ROUTES_MANIFEST,
} from '../../../shared/lib/constants'
import { normalizePathSep } from '../../../shared/lib/page-path/normalize-path-sep'
import { findPagesDir } from '../../../lib/find-pages-dir'
import { collectRoutesFromFiles } from './setup-dev'
import { FallbackMode } from '../../base-server'
import { isEdgeRuntime } from '../../../lib/is-edge-runtime'
import { removeTrailingSlash } from '../../../shared/lib/router/utils/remove-trailing-slash'
import {
  getPageFromPath,
  getStaticInfoIncludingLayouts,
} from '../../../build/entries'

export type FsOutput = {
  type:
    | 'appFile'
    | 'pageFile'
    | 'nextImage'
    | 'middleware'
    | 'publicFolder'
    | 'nextStaticFolder'
    | 'legacyStaticFolder'
    | 'devVirtualFsItem'

  fsPath?: string
  locale?: string
  itemPath: string
  itemsRoot?: string
  appPaths?: string[]
  fromStaticPaths?: boolean
  runtime?: 'edge' | 'nodejs'
  fallbackMode?: 'blocking' | 'static'
}

export const buildCustomRoute = <T>(
  type: 'redirect' | 'header' | 'rewrite' | 'before_files_rewrite',
  item: T & { source: string },
  basePath?: string,
  caseSensitive?: boolean
): T & { match: ReturnType<typeof getPathMatch>; check?: boolean } => {
  const restrictedRedirectPaths = ['/_next'].map((p) =>
    basePath ? `${basePath}${p}` : p
  )
  const match = getPathMatch(item.source, {
    strict: true,
    removeUnnamedParams: true,
    regexModifier: !(item as any).internal
      ? (regex: string) =>
          modifyRouteRegex(
            regex,
            type === 'redirect' ? restrictedRedirectPaths : undefined
          )
      : undefined,
    sensitive: caseSensitive,
  })
  return {
    ...item,
    ...(type === 'rewrite' ? { check: true } : {}),
    match,
  }
}

export async function setupFsCheck(opts: {
  dir: string
  dev: boolean
  minimalMode?: boolean
  config: NextConfigComplete
  addDevWatcherCallback?: (
    arg: (files: Map<string, { timestamp: number }>) => void
  ) => void
}) {
  const getItemsLru = opts.dev
    ? undefined
    : new LRUCache<string, FsOutput | null>({
        max: 1024 * 1024,
        length(value, key) {
          if (!value) return key?.length || 0
          return (
            (key || '').length +
            (value.fsPath || '').length +
            value.itemPath.length +
            value.type.length
          )
        },
      })

  // routes that have _next/data endpoints (SSG/SSP)
  const nextDataRoutes = new Set<string>()
  const publicFolderItems = new Set<string>()
  const nextStaticFolderItems = new Set<string>()
  const legacyStaticFolderItems = new Set<string>()

  const appFiles = new Set<string>()
  const pageFiles = new Set<string>()
  const staticPathsMap = new Map<
    string,
    {
      paths: string[]
      fallback: FallbackMode
    }
  >()
  let dynamicRoutes: (RoutesManifest['dynamicRoutes'][0] & {
    match: ReturnType<typeof getPathMatch>
  })[] = []

  let middlewareMatcher:
    | ReturnType<typeof getMiddlewareRouteMatcher>
    | undefined = () => false

  const distDir = path.join(opts.dir, opts.config.distDir)
  const publicFolderPath = path.join(opts.dir, 'public')
  const nextStaticFolderPath = path.join(distDir, 'static')
  const legacyStaticFolderPath = path.join(opts.dir, 'static')
  let customRoutes: UnwrapPromise<ReturnType<typeof loadCustomRoutes>> = {
    redirects: [],
    rewrites: {
      beforeFiles: [],
      afterFiles: [],
      fallback: [],
    },
    headers: [],
  }
  let buildId = 'development'
  let prerenderManifest: PrerenderManifest
  let middlewareManifest: MiddlewareManifest | undefined

  if (!opts.dev) {
    const buildIdPath = path.join(opts.dir, opts.config.distDir, BUILD_ID_FILE)
    buildId = await fs.readFile(buildIdPath, 'utf8')

    try {
      for (let file of await recursiveReadDir(publicFolderPath, () => true)) {
        file = normalizePathSep(file)
        // ensure filename is encoded
        publicFolderItems.add(encodeURI(file))
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err
      }
    }

    try {
      for (let file of await recursiveReadDir(
        legacyStaticFolderPath,
        () => true
      )) {
        file = normalizePathSep(file)
        // ensure filename is encoded
        legacyStaticFolderItems.add(encodeURI(file))
      }
      Log.warn(
        `The static directory has been deprecated in favor of the public directory. https://nextjs.org/docs/messages/static-dir-deprecated`
      )
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err
      }
    }

    try {
      for (let file of await recursiveReadDir(
        nextStaticFolderPath,
        () => true
      )) {
        file = normalizePathSep(file)
        // ensure filename is encoded
        nextStaticFolderItems.add(
          path.posix.join('/_next/static', encodeURI(file))
        )
      }
    } catch (err) {
      if (opts.config.output !== 'standalone') throw err
    }

    const routesManifestPath = path.join(distDir, ROUTES_MANIFEST)
    const prerenderManifestPath = path.join(distDir, PRERENDER_MANIFEST)
    const middlewareManifestPath = path.join(
      distDir,
      'server',
      MIDDLEWARE_MANIFEST
    )
    const pagesManifestPath = path.join(distDir, 'server', PAGES_MANIFEST)
    const appRoutesManifestPath = path.join(distDir, APP_PATH_ROUTES_MANIFEST)

    const routesManifest = JSON.parse(
      await fs.readFile(routesManifestPath, 'utf8')
    ) as RoutesManifest

    prerenderManifest = JSON.parse(
      await fs.readFile(prerenderManifestPath, 'utf8')
    ) as PrerenderManifest

    middlewareManifest = JSON.parse(
      await fs.readFile(middlewareManifestPath, 'utf8').catch(() => '{}')
    ) as MiddlewareManifest

    const pagesManifest = JSON.parse(
      await fs.readFile(pagesManifestPath, 'utf8')
    )
    const appRoutesManifest = JSON.parse(
      await fs.readFile(appRoutesManifestPath, 'utf8').catch(() => '{}')
    )

    const normalizedFallback = (fallback: string | boolean | null) =>
      typeof fallback === 'string'
        ? 'static'
        : fallback === false
        ? false
        : 'blocking'

    for (const route of Object.keys(prerenderManifest.routes)) {
      const entry = prerenderManifest.routes[route]

      if (!entry.srcRoute) continue
      const paths = staticPathsMap.get(entry.srcRoute)?.paths || []
      paths.push(route)

      const fallback = prerenderManifest.dynamicRoutes[entry.srcRoute]?.fallback

      staticPathsMap.set(entry.srcRoute, {
        fallback: normalizedFallback(fallback),
        paths,
      })
    }

    for (const route of Object.keys(prerenderManifest.dynamicRoutes)) {
      if (!staticPathsMap.has(route)) {
        staticPathsMap.set(route, {
          fallback: normalizedFallback(
            prerenderManifest.dynamicRoutes[route].fallback
          ),
          paths: [],
        })
      }
    }

    for (const key of Object.keys(pagesManifest)) {
      // ensure the non-locale version is in the set
      if (opts.config.i18n) {
        pageFiles.add(
          normalizeLocalePath(key, opts.config.i18n.locales).pathname
        )
      } else {
        pageFiles.add(key)
      }
    }
    for (const key of Object.keys(appRoutesManifest)) {
      appFiles.add(appRoutesManifest[key])
    }

    const escapedBuildId = escapeStringRegexp(buildId)

    for (const route of routesManifest.dataRoutes) {
      if (isDynamicRoute(route.page)) {
        const routeRegex = getRouteRegex(route.page)
        dynamicRoutes.push({
          ...route,
          regex: routeRegex.re.toString(),
          match: getRouteMatcher({
            // TODO: fix this in the manifest itself, must also be fixed in
            // upstream builder that relies on this
            re: opts.config.i18n
              ? new RegExp(
                  route.dataRouteRegex.replace(
                    `/${escapedBuildId}/`,
                    `/${escapedBuildId}/(?<nextLocale>.+?)/`
                  )
                )
              : new RegExp(route.dataRouteRegex),
            groups: routeRegex.groups,
          }),
        })
      }
      nextDataRoutes.add(route.page)
    }

    for (const route of routesManifest.dynamicRoutes) {
      dynamicRoutes.push({
        ...route,
        match: getRouteMatcher(getRouteRegex(route.page)),
      })
    }

    if (middlewareManifest.middleware?.['/']?.matchers) {
      middlewareMatcher = getMiddlewareRouteMatcher(
        middlewareManifest.middleware?.['/']?.matchers
      )
    }

    customRoutes = {
      // @ts-expect-error additional fields in manifest type
      redirects: routesManifest.redirects,
      // @ts-expect-error additional fields in manifest type
      rewrites: Array.isArray(routesManifest.rewrites)
        ? {
            beforeFiles: [],
            afterFiles: routesManifest.rewrites,
            fallback: [],
          }
        : routesManifest.rewrites,
      // @ts-expect-error additional fields in manifest type
      headers: routesManifest.headers,
    }
  } else {
    // dev handling
    customRoutes = await loadCustomRoutes(opts.config)

    prerenderManifest = {
      version: 4,
      routes: {},
      dynamicRoutes: {},
      notFoundRoutes: [],
      preview: {
        previewModeId: require('crypto').randomBytes(16).toString('hex'),
        previewModeSigningKey: require('crypto')
          .randomBytes(32)
          .toString('hex'),
        previewModeEncryptionKey: require('crypto')
          .randomBytes(32)
          .toString('hex'),
      },
    }
  }

  const headers = customRoutes.headers.map((item) =>
    buildCustomRoute(
      'header',
      item,
      opts.config.basePath,
      opts.config.experimental.caseSensitiveRoutes
    )
  )
  const redirects = customRoutes.redirects.map((item) =>
    buildCustomRoute(
      'redirect',
      item,
      opts.config.basePath,
      opts.config.experimental.caseSensitiveRoutes
    )
  )
  const rewrites = {
    // TODO: add interception routes generateInterceptionRoutesRewrites()
    beforeFiles: customRoutes.rewrites.beforeFiles.map((item) =>
      buildCustomRoute('before_files_rewrite', item)
    ),
    afterFiles: customRoutes.rewrites.afterFiles.map((item) =>
      buildCustomRoute(
        'rewrite',
        item,
        opts.config.basePath,
        opts.config.experimental.caseSensitiveRoutes
      )
    ),
    fallback: customRoutes.rewrites.fallback.map((item) =>
      buildCustomRoute(
        'rewrite',
        item,
        opts.config.basePath,
        opts.config.experimental.caseSensitiveRoutes
      )
    ),
  }

  const { i18n } = opts.config

  const handleLocale = (pathname: string, locales?: string[]) => {
    let locale: string | undefined

    if (i18n) {
      const i18nResult = normalizeLocalePath(pathname, locales || i18n.locales)

      pathname = i18nResult.pathname
      locale = i18nResult.detectedLocale
    }
    return { locale, pathname }
  }

  return {
    headers,
    rewrites,
    redirects,

    buildId,
    handleLocale,

    appFiles,
    pageFiles,
    dynamicRoutes,
    nextDataRoutes,

    interceptionRoutes: undefined as
      | undefined
      | ReturnType<typeof buildCustomRoute>[],

    devVirtualFsItems: new Set<string>(),

    prerenderManifest,
    middlewareMatcher: middlewareMatcher as MiddlewareRouteMatch | undefined,

    ensurePage(
      ..._args: Parameters<
        InstanceType<
          typeof import('../../dev/hot-reloader-webpack').default
        >['ensurePage']
      >
    ) {},

    async getItem(
      itemPath: string,
      urlPathname?: string
    ): Promise<FsOutput | null> {
      const originalItemPath = itemPath
      const itemKey = originalItemPath + urlPathname
      const lruResult = getItemsLru?.get(itemKey)

      if (lruResult) {
        return lruResult
      }

      // handle minimal mode case with .rsc output path (this is
      // mostly for testings)
      if (opts.minimalMode && itemPath.endsWith('.rsc')) {
        itemPath = itemPath.substring(0, itemPath.length - '.rsc'.length)
      }

      const { basePath } = opts.config

      if (basePath && !pathHasPrefix(itemPath, basePath)) {
        return null
      }
      itemPath = removePathPrefix(itemPath, basePath) || '/'

      if (itemPath !== '/' && itemPath.endsWith('/')) {
        itemPath = itemPath.substring(0, itemPath.length - 1)
      }

      let decodedItemPath = itemPath

      try {
        decodedItemPath = decodeURIComponent(itemPath)
      } catch (_) {}

      if (itemPath === '/_next/image') {
        return {
          itemPath,
          type: 'nextImage',
        }
      }

      const itemsToCheck: Array<[Set<string>, FsOutput['type']]> = [
        [this.devVirtualFsItems, 'devVirtualFsItem'],
        [nextStaticFolderItems, 'nextStaticFolder'],
        [legacyStaticFolderItems, 'legacyStaticFolder'],
        [publicFolderItems, 'publicFolder'],
        [appFiles, 'appFile'],
        [pageFiles, 'pageFile'],
      ]

      let collectedRoutePaths = false
      let appDir: string | undefined = undefined
      let pagesDir: string | undefined = undefined
      let appPaths: Record<string, string[]> = {}
      let filepathsMap = new Map<string, string>()

      for (let [items, type] of itemsToCheck) {
        let locale: string | undefined
        let curItemPath = itemPath
        let curDecodedItemPath = decodedItemPath

        const isDynamicOutput = type === 'pageFile' || type === 'appFile'

        if (opts.dev && !collectedRoutePaths && isDynamicOutput) {
          const dirsResult = findPagesDir(
            opts.dir,
            !!opts.config.experimental.appDir
          )
          appDir = dirsResult.appDir
          pagesDir = dirsResult.pagesDir
          const combinedFilepaths: string[] = []

          if (dirsResult.pagesDir) {
            const pageFilepaths = await recursiveReadDir(
              dirsResult.pagesDir,
              (filepath: string) => {
                return opts.config.pageExtensions.includes(
                  path.extname(filepath).substring(1)
                )
              }
            )
            combinedFilepaths.push(
              ...pageFilepaths.map((item) =>
                path.join(dirsResult.pagesDir || '', item)
              )
            )
          }

          if (dirsResult.appDir) {
            const appFilepaths = await recursiveReadDir(
              dirsResult.appDir,
              (filepath: string) => {
                const ext = path.extname(filepath)
                const base = path.basename(filepath)

                return (
                  opts.config.pageExtensions.includes(ext.substring(1)) &&
                  (base === `route${ext}` || base === `page${ext}`)
                )
              }
            )
            combinedFilepaths.push(
              ...appFilepaths.map((item) =>
                path.join(dirsResult.appDir || '', item)
              )
            )
          }
          appFiles.clear()
          pageFiles.clear()
          const routesResult = collectRoutesFromFiles({
            appDir: dirsResult.appDir,
            pagesDir: dirsResult.pagesDir,
            filepaths: combinedFilepaths,
            nextConfig: opts.config,
            fsChecker: this,
          })
          appPaths = routesResult.appPaths

          for (const [route, filepath] of routesResult.appFiles) {
            appFiles.add(route)
            filepathsMap.set(route, filepath)
          }
          for (const [route, filepath] of routesResult.pageFiles) {
            pageFiles.add(route)
            filepathsMap.set(route, filepath)
          }
        }

        if (i18n) {
          const localeResult = handleLocale(
            itemPath,
            // legacy behavior allows visiting static assets under
            // default locale but no other locale
            isDynamicOutput ? undefined : [i18n?.defaultLocale]
          )

          if (localeResult.pathname !== curItemPath) {
            curItemPath = localeResult.pathname
            locale = localeResult.locale

            try {
              curDecodedItemPath = decodeURIComponent(curItemPath)
            } catch (_) {}
          }
        }

        if (type === 'legacyStaticFolder') {
          if (!pathHasPrefix(curItemPath, '/static')) {
            continue
          }
          curItemPath = curItemPath.substring('/static'.length)

          try {
            curDecodedItemPath = decodeURIComponent(curItemPath)
          } catch (_) {}
        }

        if (
          type === 'nextStaticFolder' &&
          !pathHasPrefix(curItemPath, '/_next/static')
        ) {
          continue
        }

        const nextDataPrefix = `/_next/data/${buildId}/`

        if (
          type === 'pageFile' &&
          curItemPath.startsWith(nextDataPrefix) &&
          curItemPath.endsWith('.json')
        ) {
          items = nextDataRoutes
          // remove _next/data/<build-id> prefix
          curItemPath = curItemPath.substring(nextDataPrefix.length - 1)

          // remove .json postfix
          curItemPath = curItemPath.substring(
            0,
            curItemPath.length - '.json'.length
          )
          const curLocaleResult = handleLocale(curItemPath)
          curItemPath =
            curLocaleResult.pathname === '/index'
              ? '/'
              : curLocaleResult.pathname

          locale = curLocaleResult.locale

          try {
            curDecodedItemPath = decodeURIComponent(curItemPath)
          } catch (_) {}
        }

        // check decoded variant as well
        if (!items.has(curItemPath) && !opts.dev) {
          curItemPath = curDecodedItemPath
        }
        const matchedItem = items.has(curItemPath)

        if (matchedItem || opts.dev) {
          let fsPath: string | undefined
          let itemsRoot: string | undefined

          switch (type) {
            case 'nextStaticFolder': {
              itemsRoot = nextStaticFolderPath
              curItemPath = curItemPath.substring('/_next/static'.length)
              break
            }
            case 'legacyStaticFolder': {
              itemsRoot = legacyStaticFolderPath
              break
            }
            case 'publicFolder': {
              itemsRoot = publicFolderPath
              break
            }
            default: {
              break
            }
          }

          if (itemsRoot && curItemPath) {
            fsPath = path.posix.join(itemsRoot, curItemPath)
          }

          // dynamically check fs in development so we don't
          // have to wait on the watcher
          if (!matchedItem && opts.dev) {
            const isStaticAsset = (
              [
                'nextStaticFolder',
                'publicFolder',
                'legacyStaticFolder',
              ] as (typeof type)[]
            ).includes(type)

            if (isStaticAsset && itemsRoot) {
              let found = fsPath && (await fileExists(fsPath, FileType.File))

              if (!found) {
                try {
                  // In dev, we ensure encoded paths match
                  // decoded paths on the filesystem so check
                  // that variation as well
                  const tempItemPath = decodeURIComponent(curItemPath)
                  fsPath = path.posix.join(itemsRoot, tempItemPath)
                  found = await fileExists(fsPath, FileType.File)
                } catch (_) {}

                if (!found) {
                  continue
                }
              }
            } else {
              continue
            }
          }

          // i18n locales aren't matched for app dir
          if (type === 'appFile' && locale && locale !== i18n?.defaultLocale) {
            continue
          }
          let fromStaticPaths = false
          let matchedItemPath = curItemPath
          let runtime: 'edge' | 'nodejs' | undefined = undefined
          let fallbackMode: 'blocking' | 'static' | undefined = undefined
          let staticInfo:
            | UnwrapPromise<ReturnType<typeof getStaticInfoIncludingLayouts>>
            | undefined = undefined

          if (opts.dev) {
            const pageFilePath = filepathsMap.get(curItemPath)

            if (pageFilePath) {
              matchedItemPath = path.relative(
                (type === 'pageFile' ? pagesDir : appDir) || '',
                pageFilePath
              )
              matchedItemPath = getPageFromPath(
                matchedItemPath,
                opts.config.pageExtensions
              )

              staticInfo = await getStaticInfoIncludingLayouts({
                isInsideAppDir: type === 'appFile',
                pageExtensions: opts.config.pageExtensions,
                pageFilePath,
                appDir,
                config: opts.config,
                isDev: opts.dev,
                page: curItemPath,
              })
            }
          }

          if (isDynamicRoute(curItemPath)) {
            if (urlPathname) {
              let pathsResult: ReturnType<(typeof staticPathsMap)['get']>

              if (
                opts.dev &&
                ((type === 'pageFile' && staticInfo?.ssg) ||
                  (type === 'appFile' && staticInfo?.generateStaticParams))
              ) {
                const { getStaticPaths } =
                  require('./dev-static-paths') as typeof import('./dev-static-paths')

                await this.ensurePage({
                  page: matchedItemPath,
                  clientOnly: false,
                  appPaths: appPaths[curItemPath],
                })
                pathsResult = await getStaticPaths({
                  staticPathsCache: staticPathsMap,
                  nextConfig: opts.config,
                  pathname: curItemPath,
                  distDir: path.join(opts.dir, opts.config.distDir),
                })
              } else {
                pathsResult = staticPathsMap.get(curItemPath)
              }
              if (urlPathname.startsWith(nextDataPrefix)) {
                // remove _next/data/<build-id> prefix
                urlPathname = urlPathname.substring(nextDataPrefix.length - 1)

                // remove .json postfix
                urlPathname = urlPathname.substring(
                  0,
                  urlPathname.length - '.json'.length
                )
              }
              urlPathname = removeTrailingSlash(urlPathname)
              fromStaticPaths =
                !!pathsResult?.paths.includes(urlPathname) ||
                !!pathsResult?.paths.includes(decodeURI(urlPathname))

              if (pathsResult?.fallback === false && !fromStaticPaths) {
                continue
              }

              if (pathsResult?.fallback !== false) {
                fallbackMode = pathsResult?.fallback
              }
            } else {
              // we only match dynamic output while checking
              // dynamic routes
              continue
            }
          }

          if (isDynamicOutput) {
            if (opts.dev) {
              runtime = isEdgeRuntime(staticInfo?.runtime) ? 'edge' : 'nodejs'
            } else if (middlewareManifest) {
              const entries =
                type === 'pageFile'
                  ? [curItemPath]
                  : ['page', 'route'].map((item) =>
                      path.posix.join(curItemPath, item)
                    )

              for (const item of entries) {
                if (middlewareManifest.functions[item]) {
                  runtime = 'edge'
                  break
                }
              }
            }
          }

          const itemResult = {
            type,
            fsPath,
            locale,
            runtime,
            itemsRoot,
            fallbackMode,
            fromStaticPaths,
            itemPath: matchedItemPath,
            appPaths: appPaths[curItemPath],
          }

          getItemsLru?.set(itemKey, itemResult)
          return itemResult
        }
      }

      getItemsLru?.set(itemKey, null)
      return null
    },
    getDynamicRoutes() {
      // this should include data routes
      return this.dynamicRoutes
    },
    getMiddlewareMatchers() {
      return this.middlewareMatcher
    },
  }
}
