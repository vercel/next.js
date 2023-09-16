import type {
  ManifestRoute,
  PrerenderManifest,
  RoutesManifest,
} from '../../../build'
import type { NextConfigComplete } from '../../config-shared'
import type { MiddlewareManifest } from '../../../build/webpack/plugins/middleware-plugin'
import type { PagesManifest } from '../../../build/webpack/plugins/pages-manifest-plugin'

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
import { isDynamicRoute } from '../../../shared/lib/router/utils'
import { escapeStringRegexp } from '../../../shared/lib/escape-regexp'
import {
  PatchMatcher,
  getPathMatch,
} from '../../../shared/lib/router/utils/path-match'
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
  APP_PATHS_MANIFEST,
  APP_PATH_ROUTES_MANIFEST,
  BUILD_ID_FILE,
  MIDDLEWARE_MANIFEST,
  PAGES_MANIFEST,
  PRERENDER_MANIFEST,
  ROUTES_MANIFEST,
} from '../../../shared/lib/constants'
import { normalizePathSep } from '../../../shared/lib/page-path/normalize-path-sep'
import { normalizeMetadataRoute } from '../../../lib/metadata/get-metadata-route'
import { RouteDefinitionManager } from '../../future/route-definitions/managers/route-definition-manager'
import { NextRouteDefinitionManagerBuilder } from '../../future/route-definitions/managers/builders/next-route-definition-manager-builder'
import { I18NProvider } from '../../future/helpers/i18n-provider'
import { NextDevRouteDefinitionManagerBuilder } from '../../future/route-definitions/managers/builders/next-dev-route-definition-manager-builder'
import { MapManifestLoader } from '../../future/manifests/loaders/map-manifest-loader'

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

  const i18nProvider =
    opts.config.i18n && opts.config.i18n.locales.length > 0
      ? new I18NProvider(opts.config.i18n)
      : null

  let definitions: RouteDefinitionManager

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
    const appPathsManifestPath = path.join(distDir, APP_PATHS_MANIFEST)

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
    const appPathsManifest = JSON.parse(
      await fs.readFile(appPathsManifestPath, 'utf8').catch(() => '{}')
    )

    definitions = NextRouteDefinitionManagerBuilder.build(
      distDir,
      Object.keys(appPathsManifest).length > 0,
      i18nProvider,
      new MapManifestLoader({
        [PAGES_MANIFEST]: pagesManifest as PagesManifest,
        [APP_PATHS_MANIFEST]: appPathsManifest as PagesManifest,
        [MIDDLEWARE_MANIFEST]: middlewareManifest,
      })
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
                    `/${escapedBuildId}/(?<nextLocale>[^/]+?)/`
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

    definitions = NextDevRouteDefinitionManagerBuilder.build(
      opts.dir,
      opts.config.pageExtensions,
      i18nProvider
    )
  }

  // Fire off the initial loading of the definitions.
  void Promise.resolve(definitions.load()).catch((err) => {
    Log.error(err)
  })

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

  debug('nextDataRoutes', nextDataRoutes)
  debug('dynamicRoutes', dynamicRoutes)
  debug('pageFiles', pageFiles)
  debug('appFiles', appFiles)

  let ensureFn: ((item: FsOutput) => Promise<void>) | undefined

  return {
    headers,
    rewrites,
    redirects,

    definitions,

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
      } catch {}

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

      for (let [items, type] of itemsToCheck) {
        let locale: string | undefined
        let curItemPath = itemPath
        let curDecodedItemPath = decodedItemPath

        const isDynamicOutput = type === 'pageFile' || type === 'appFile'

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
            } catch {}
          }
        }

        if (type === 'legacyStaticFolder') {
          if (!pathHasPrefix(curItemPath, '/static')) {
            continue
          }
          curItemPath = curItemPath.substring('/static'.length)

          try {
            curDecodedItemPath = decodeURIComponent(curItemPath)
          } catch {}
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
          } catch {}
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
                } catch {}

                if (!found) {
                  continue
                }
              }
            } else if (type === 'pageFile' || type === 'appFile') {
              if (ensureFn) {
                try {
                  await ensureFn({
                    type,
                    itemPath:
                      type === 'appFile'
                        ? normalizeMetadataRoute(curItemPath)
                        : curItemPath,
                  })
                } catch {
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

          const itemResult = {
            type,
            fsPath,
            locale,
            itemsRoot,
            itemPath: curItemPath,
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
