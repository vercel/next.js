import type {
  ManifestRoute,
  PrerenderManifest,
  RoutesManifest,
} from '../../../build'
import type { NextConfigComplete } from '../../config-shared'
import type { MiddlewareManifest } from '../../../build/webpack/plugins/middleware-plugin'

import path from 'path'
import fs from 'fs/promises'
import * as Log from '../../../build/output/log'
import setupDebug from 'next/dist/compiled/debug'
import LRUCache from 'next/dist/compiled/lru-cache'
import loadCustomRoutes from '../../../lib/load-custom-routes'
import { modifyRouteRegex } from '../../../lib/redirect-status'
import { UnwrapPromise } from '../../../lib/coalesced-function'
import { FileType, fileExists } from '../../../lib/file-exists'
import { recursiveReadDir } from '../../../lib/recursive-readdir'
import { escapeStringRegexp } from '../../../shared/lib/escape-regexp'
import {
  PatchMatcher,
  getPathMatch,
} from '../../../shared/lib/router/utils/path-match'
import { getRouteRegex } from '../../../shared/lib/router/utils/route-regex'
import { getRouteMatcher } from '../../../shared/lib/router/utils/route-matcher'
import { pathHasPrefix } from '../../../shared/lib/router/utils/path-has-prefix'
import { normalizeLocalePath } from '../../../shared/lib/i18n/normalize-locale-path'
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
import { I18NProvider } from '../../future/helpers/i18n-provider'
import { isAPIRoute } from '../../../lib/is-api-route'
import { isDynamicRoute } from '../../../shared/lib/router/utils'
import { removeTrailingSlash } from '../../../shared/lib/router/utils/remove-trailing-slash'
import { BasePathNormalizer } from '../../future/normalizers/base-path-normalizer'

export type FsOutput = {
  type:
    | 'appFile'
    | 'pageFile'
    | 'nextImage'
    | 'publicFolder'
    | 'nextStaticFolder'
    | 'legacyStaticFolder'
    | 'devVirtualFsItem'

  itemPath: string
  fsPath?: string
  itemsRoot?: string
  locale?: string
}

const debug = setupDebug('next:router-server:filesystem')

export type FilesystemDynamicRoute = ManifestRoute & {
  /**
   * The path matcher that can be used to match paths against this route.
   */
  match: PatchMatcher

  /**
   * If the route supports locales then requests should have their locale
   * information stripped before routing occurs.
   */
  supportsLocales: boolean
}

export const buildCustomRoute = <T>(
  type: 'redirect' | 'header' | 'rewrite' | 'before_files_rewrite',
  item: T & { source: string },
  basePath?: string,
  caseSensitive?: boolean
): T & { match: PatchMatcher; check?: boolean } => {
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
  const getItemsLru = !opts.dev
    ? new LRUCache<string, FsOutput | null>({
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
    : undefined

  // routes that have _next/data endpoints (SSG/SSP)
  const nextDataRoutes = new Set<string>()
  const publicFolderItems = new Set<string>()
  const nextStaticFolderItems = new Set<string>()
  const legacyStaticFolderItems = new Set<string>()

  // TODO: (wyattjoh) maybe this isn't updated fast enough, we may need the directory scan from the dev matchers
  const appPaths = new Map<string, string[]>()

  /**
   * Map of app pathnames to their page representation. For example:
   *
   * - `/` -> `/page` (App Page)
   * - `/about` -> `/about/page` (App Page)
   * - `/api/hello` -> `/api/hello/route` (App Route)
   */
  const appPages = new Map<string, string>()

  const appFiles = new Set<string>()
  const pageFiles = new Set<string>()

  let dynamicRoutes: FilesystemDynamicRoute[] = []

  let middlewareMatcher:
    | ReturnType<typeof getMiddlewareRouteMatcher>
    | undefined = () => false

  const distDir = path.join(opts.dir, opts.config.distDir)
  const publicFolderPath = path.join(opts.dir, 'public')
  const nextStaticFolderPath = path.join(distDir, 'static')
  const legacyStaticFolderPath = path.join(opts.dir, 'static')

  const roots = {
    publicFolder: path.join(opts.dir, 'public'),
    nextStaticFolder: path.join(distDir, 'static'),
    legacyStaticFolder: path.join(opts.dir, 'static'),
  }

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

  const i18n = opts.config.i18n ? new I18NProvider(opts.config.i18n) : undefined
  const basePath =
    opts.config.basePath &&
    opts.config.basePath.length > 1 &&
    opts.config.basePath.startsWith('/')
      ? new BasePathNormalizer(opts.config.basePath)
      : undefined

  const supportsLocales = (page: string) => {
    // If i18n is not enabled, then we can skip this check.
    if (!i18n) return false

    // If the page is not in the `pages/` directory, then we can skip this
    // check.
    if (!pageFiles.has(page)) return false

    // If the page is an API route, then we can skip this check.
    if (isAPIRoute(page)) return false

    // Otherwise, this route supports locales.
    return true
  }

  if (!opts.dev) {
    const buildIdPath = path.join(opts.dir, opts.config.distDir, BUILD_ID_FILE)
    buildId = await fs.readFile(buildIdPath, 'utf8')

    try {
      for (const file of await recursiveReadDir(publicFolderPath)) {
        // Ensure filename is encoded and normalized.
        publicFolderItems.add(encodeURI(normalizePathSep(file)))
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err
      }
    }

    try {
      for (const file of await recursiveReadDir(legacyStaticFolderPath)) {
        // Ensure filename is encoded and normalized.
        legacyStaticFolderItems.add(encodeURI(normalizePathSep(file)))
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
      for (const file of await recursiveReadDir(nextStaticFolderPath)) {
        // Ensure filename is encoded and normalized.
        nextStaticFolderItems.add(
          path.posix.join('/_next/static', encodeURI(normalizePathSep(file)))
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

    const middlewareManifest = JSON.parse(
      await fs.readFile(middlewareManifestPath, 'utf8').catch(() => '{}')
    ) as MiddlewareManifest

    const pagesManifest = JSON.parse(
      await fs.readFile(pagesManifestPath, 'utf8')
    )
    const appRoutesManifest = JSON.parse(
      await fs.readFile(appRoutesManifestPath, 'utf8').catch(() => '{}')
    )

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
      nextDataRoutes.add(route.page)

      // If the page is not dynamic and there is no i18n config (that would
      // have added a locale to the route), then we can skip this.
      if (!isDynamicRoute(route.page) && !i18n) continue

      const routeRegex = getRouteRegex(route.page)
      dynamicRoutes.push({
        ...route,
        regex: routeRegex.re.toString(),
        match: getRouteMatcher({
          // TODO: fix this in the manifest itself, must also be fixed in
          // upstream builder that relies on this
          re: i18n
            ? new RegExp(
                route.dataRouteRegex.replace(
                  `/${escapedBuildId}/`,
                  `/${escapedBuildId}/(?<nextLocale>.+?)/`
                )
              )
            : new RegExp(route.dataRouteRegex),
          groups: routeRegex.groups,
        }),
        // If the page is in the `pages/` directory, it can support locales
        // and therefore should have its locale prefix stripped during
        // routing.
        supportsLocales: true,
      })
    }

    for (const route of routesManifest.dynamicRoutes) {
      dynamicRoutes.push({
        ...route,
        match: getRouteMatcher(getRouteRegex(route.page)),
        // If the page is in the `pages/` directory, it can support locales
        // and therefore should have its locale prefix stripped during
        // routing.
        supportsLocales: supportsLocales(route.page),
      })
    }

    if (middlewareManifest.middleware?.['/']?.matchers) {
      middlewareMatcher = getMiddlewareRouteMatcher(
        middlewareManifest.middleware?.['/']?.matchers
      )
    }

    customRoutes = {
      redirects: routesManifest.redirects,
      rewrites: routesManifest.rewrites
        ? Array.isArray(routesManifest.rewrites)
          ? {
              beforeFiles: [],
              afterFiles: routesManifest.rewrites,
              fallback: [],
            }
          : routesManifest.rewrites
        : {
            beforeFiles: [],
            afterFiles: [],
            fallback: [],
          },
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

  debug('nextDataRoutes', nextDataRoutes)
  debug('dynamicRoutes', dynamicRoutes)
  debug('pageFiles', pageFiles)
  debug('appFiles', appFiles)

  let ensureFn: (item: FsOutput) => Promise<void> | undefined

  return {
    headers,
    rewrites,
    redirects,

    buildId,
    supportsLocales,

    appPaths,
    appPages,
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

    ensureCallback(fn: typeof ensureFn) {
      ensureFn = fn
    },

    async getItem(itemPath: string): Promise<FsOutput | null> {
      const originalItemPath = itemPath
      const itemKey = originalItemPath
      const lruResult = getItemsLru?.get(itemKey)

      if (lruResult) {
        return lruResult
      }

      // handle minimal mode case with .rsc output path (this is
      // mostly for testings)
      if (opts.minimalMode && itemPath.endsWith('.rsc')) {
        itemPath = itemPath.substring(0, itemPath.length - '.rsc'.length)
      }

      // Strip any trailing slash.
      itemPath = removeTrailingSlash(itemPath)

      // Strip any baseBase prefix.
      if (basePath) {
        itemPath = basePath.normalize(itemPath)
      }

      let decodedItemPath = itemPath

      try {
        decodedItemPath = decodeURIComponent(itemPath)
      } catch {}

      if (itemPath === '/_next/image') {
        return {
          itemPath,
          type: 'nextImage',
        }
      }

      const itemsToCheck: Array<
        [
          Set<string>,
          // We filtered out all the `nextImage` types above, so we can safely
          // exclude that type from the union.
          Exclude<FsOutput['type'], 'nextImage'>
        ]
      > = [
        [nextStaticFolderItems, 'nextStaticFolder'],
        [legacyStaticFolderItems, 'legacyStaticFolder'],
        [publicFolderItems, 'publicFolder'],
        [appFiles, 'appFile'],
        [pageFiles, 'pageFile'],
      ]

      // If we're in development, then we need to check the virtual filesystem
      // first.
      if (opts.dev) {
        itemsToCheck.unshift([this.devVirtualFsItems, 'devVirtualFsItem'])
      }

      for (const check of itemsToCheck) {
        let items = check[0]
        const type = check[1]
        let locale: string | undefined
        let curItemPath = itemPath
        let curDecodedItemPath = decodedItemPath

        const isDynamicOutput = type === 'pageFile' || type === 'appFile'
        const isStaticAsset =
          type === 'nextStaticFolder' ||
          type === 'publicFolder' ||
          type === 'legacyStaticFolder'

        // i18n locales are not supported on app files, so if it's enabled and
        // we're looking at an app file, we can skip the locale handling. If the
        // route is for an API route, we can also skip the locale handling.
        if (type !== 'appFile' && i18n) {
          // If a locale was detected on the pathname, then we need to strip it
          // unless it's static assets under a non-default locale.
          const info = i18n.analyze(curItemPath)
          if (
            info.pathname !== curItemPath &&
            (isDynamicOutput ||
              info.detectedLocale === i18n.config.defaultLocale)
          ) {
            curItemPath = info.pathname
            locale = info.detectedLocale

            try {
              curDecodedItemPath = decodeURIComponent(curItemPath)
            } catch {}
          }
        }

        // If the pathname is an api route, then we should bail out as we
        // don't support locales on api routes.
        if (type === 'pageFile' && locale && isAPIRoute(curItemPath)) {
          continue
        }

        if (type === 'legacyStaticFolder') {
          if (!pathHasPrefix(curItemPath, '/static')) continue

          // Trim the prefix from the pathname.
          curItemPath = curItemPath.substring('/static'.length)

          try {
            curDecodedItemPath = decodeURIComponent(curItemPath)
          } catch {}
        }

        // If the item path does not have the static prefix then it can't match
        // the static folder type.
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

          // If locales were enabled, then we need to strip the locale prefix
          // from the pathname.
          if (i18n) {
            const curLocaleResult = i18n.analyze(curItemPath)
            locale = curLocaleResult.detectedLocale
            if (curLocaleResult.pathname === '/index') {
              curItemPath = '/'
            } else {
              curItemPath = curLocaleResult.pathname
            }
          }

          try {
            curDecodedItemPath = decodeURIComponent(curItemPath)
          } catch {}
        }

        let matchedItem = items.has(curItemPath)
        if (!matchedItem && !opts.dev) {
          curItemPath = curDecodedItemPath
          matchedItem = items.has(curItemPath)
        }

        // If we haven't matched anything and we're not in development, then
        // we can skip this item.
        if (!matchedItem && !opts.dev) continue

        // If we're matching the virtual filesystem, we haven't matched,
        // and we're in development, then we don't have a match!
        if (type === 'devVirtualFsItem' && !matchedItem && opts.dev) continue

        // If this is for dynamic output, then we need to ensure the route to
        // ensure that it's built.
        if (isDynamicOutput && opts.dev && ensureFn) {
          try {
            // Ensure the route to build it.
            await ensureFn({ type, itemPath: curItemPath })
          } catch {
            continue
          }
        }

        // If there is no item path, then we can't find the file!
        if (!curItemPath) continue

        // If we're dealing with a static asset, we'll have a file system path.
        // Otherwise it'll be undefined.
        let fsPath: string | undefined

        if (isStaticAsset) {
          // Trim the prefix from the pathname.
          if (type === 'nextStaticFolder') {
            curItemPath = curItemPath.substring('/_next/static'.length)
          }

          // Prefix the route with the root if it's a static asset.
          fsPath = path.posix.join(roots[type], curItemPath)

          // If we're matching a static asset, we haven't matched anything, and
          // we're in development, then we may be ahead of the watcher. Let's try
          // to find the file on the filesystem.
          if (!matchedItem && opts.dev) {
            // Try the file path as is...
            let found = await fileExists(fsPath, FileType.File)

            // If we couldn't find it, try the decoded path as well as in dev
            // we ensure encoded paths match decoded paths on the filesystem.
            if (!found) {
              try {
                fsPath = path.posix.join(
                  roots[type],
                  decodeURIComponent(curItemPath)
                )
                found = await fileExists(fsPath, FileType.File)
              } catch {
                continue
              }

              // If we still couldn't find it, then we can't find the file!
              if (!found) continue
            }
          }
        }

        const itemResult: FsOutput = {
          type,
          fsPath,
          locale,
          itemsRoot: isStaticAsset ? roots[type] : undefined,
          itemPath: curItemPath,
        }

        getItemsLru?.set(itemKey, itemResult)
        return itemResult
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
