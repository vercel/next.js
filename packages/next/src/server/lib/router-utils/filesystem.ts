import type { RoutesManifest } from '../../../build'
import type { NextConfigComplete } from '../../config-shared'
import type { MiddlewareManifest } from '../../../build/webpack/plugins/middleware-plugin'

import path from 'path'
import fs from 'fs/promises'
import setupDebug from 'next/dist/compiled/debug'
import LRUCache from 'next/dist/compiled/lru-cache'
import { findPagesDir } from '../../../lib/find-pages-dir'
import loadCustomRoutes from '../../../lib/load-custom-routes'
import { modifyRouteRegex } from '../../../lib/redirect-status'
import { UnwrapPromise } from '../../../lib/coalesced-function'
import { recursiveReadDir } from '../../../lib/recursive-readdir'
import { isDynamicRoute } from '../../../shared/lib/router/utils'
import { escapeStringRegexp } from '../../../shared/lib/escape-regexp'
import { getPathMatch } from '../../../shared/lib/router/utils/path-match'
import { getRouteRegex } from '../../../shared/lib/router/utils/route-regex'
import { getRouteMatcher } from '../../../shared/lib/router/utils/route-matcher'
import { normalizePathSep } from '../../../shared/lib/page-path/normalize-path-sep'
import { normalizeLocalePath } from '../../../shared/lib/i18n/normalize-locale-path'
import { absolutePathToPage } from '../../../shared/lib/page-path/absolute-path-to-page'
import { denormalizePagePath } from '../../../shared/lib/page-path/denormalize-page-path'
import { getMiddlewareRouteMatcher } from '../../../shared/lib/router/utils/middleware-route-matcher'

import {
  APP_PATH_ROUTES_MANIFEST,
  BUILD_ID_FILE,
  MIDDLEWARE_MANIFEST,
  PAGES_MANIFEST,
  ROUTES_MANIFEST,
} from '../../../shared/lib/constants'

export type FsOutput = {
  type:
    | 'appFile'
    | 'pageFile'
    | 'nextImage'
    | 'publicFolder'
    | 'nextStaticFolder'
    | 'legacyStaticFolder'

  itemPath: string
  fsPath?: string
  locale?: string
}

const debug = setupDebug('next:router-server:filesystem')

export async function setupFsCheck(opts: {
  dir: string
  dev: boolean
  config: NextConfigComplete
  addDevWatcherCallback?: (
    arg: (files: Map<string, { timestamp: number }>) => void
  ) => void
}) {
  const getItemsLru = new LRUCache<string, FsOutput | null>({
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
  let dynamicRoutes: (RoutesManifest['dynamicRoutes'][0] & {
    match: ReturnType<typeof getPathMatch>
  })[] = []

  let middlewareMatcher: ReturnType<typeof getMiddlewareRouteMatcher> = () =>
    false

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

  if (process.env.NODE_ENV === 'production') {
    const buildIdPath = path.join(opts.dir, opts.config.distDir, BUILD_ID_FILE)
    buildId = await fs.readFile(buildIdPath, 'utf8')

    try {
      for (const file of await recursiveReadDir(publicFolderPath, () => true)) {
        publicFolderItems.add(file)
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err
      }
    }

    try {
      for (const file of await recursiveReadDir(
        legacyStaticFolderPath,
        () => true
      )) {
        legacyStaticFolderItems.add(file)
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err
      }
    }

    try {
      for (const file of await recursiveReadDir(
        nextStaticFolderPath,
        () => true
      )) {
        nextStaticFolderItems.add(path.posix.join('/_next/static', file))
      }
    } catch (err) {
      if (opts.config.output !== 'standalone') throw err
    }

    const routesManifestPath = path.join(distDir, ROUTES_MANIFEST)
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
      pageFiles.add(key)

      // ensure the non-locale version is in the set
      if (opts.config.i18n) {
        pageFiles.add(
          normalizeLocalePath(key, opts.config.i18n.locales).pathname
        )
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
  }

  if (process.env.NODE_ENV !== 'production') {
    customRoutes = await loadCustomRoutes(opts.config)

    async function devWatcherCallback(
      files: Parameters<
        Parameters<NonNullable<(typeof opts)['addDevWatcherCallback']>>[0]
      >[0]
    ) {
      debug('dev watcher callback', files)
      getItemsLru.reset()
      pageFiles.clear()
      appFiles.clear()
      dynamicRoutes = []

      let { pagesDir, appDir } = findPagesDir(
        opts.dir,
        !!opts.config.experimental.appDir
      )
      appDir = appDir && normalizePathSep(appDir)
      pagesDir = pagesDir && normalizePathSep(pagesDir)

      for (let [fileName] of files) {
        fileName = normalizePathSep(fileName)

        const isAppFile = Boolean(appDir && fileName.startsWith(appDir))
        const isPageFile = Boolean(pagesDir && fileName.startsWith(pagesDir))

        if (!(isAppFile || isPageFile)) {
          continue
        }

        let pageName = absolutePathToPage(fileName, {
          dir: isAppFile && appDir ? appDir : pagesDir || '',
          extensions: opts.config.pageExtensions,
          keepIndex: isAppFile,
          pagesType: isAppFile ? 'app' : 'pages',
        })

        if (isAppFile) {
          appFiles.add(pageName)
        } else {
          pageFiles.add(pageName)
        }
      }
    }
    opts.addDevWatcherCallback?.(devWatcherCallback)
    debug('setup dev watcher callback')
  }

  const restrictedRedirectPaths = ['/_next'].map((p) =>
    opts.config.basePath ? `${opts.config.basePath}${p}` : p
  )

  const buildCustomRoute = <T>(
    type: 'redirect' | 'header' | 'rewrite' | 'before_files_rewrite',
    item: T & { source: string }
  ): T & { match: ReturnType<typeof getPathMatch>; check?: boolean } => {
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
      sensitive: opts.config.experimental.caseSensitiveRoutes,
    })
    return {
      ...item,
      ...(type === 'rewrite' ? { check: true } : {}),
      match,
    }
  }
  const headers = customRoutes.headers.map((item) =>
    buildCustomRoute('header', item)
  )
  const redirects = customRoutes.redirects.map((item) =>
    buildCustomRoute('redirect', item)
  )
  const rewrites = {
    // TODO: add interception routes generateInterceptionRoutesRewrites()
    beforeFiles: customRoutes.rewrites.beforeFiles.map((item) =>
      buildCustomRoute('before_files_rewrite', item)
    ),
    afterFiles: customRoutes.rewrites.afterFiles.map((item) =>
      buildCustomRoute('rewrite', item)
    ),
    fallback: customRoutes.rewrites.fallback.map((item) =>
      buildCustomRoute('rewrite', item)
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

    async getItem(itemPath: string): Promise<FsOutput | null> {
      const originalItemPath = itemPath
      const lruResult = getItemsLru.get(originalItemPath)

      if (lruResult) {
        return lruResult
      }
      const { basePath } = opts.config

      if (basePath && !itemPath.startsWith(basePath)) {
        return null
      }
      itemPath = itemPath.substring(basePath.length) || '/'

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
            } catch (_) {}
          }
        }

        if (type === 'legacyStaticFolder') {
          curItemPath = curItemPath.substring('/static'.length)

          try {
            curDecodedItemPath = decodeURIComponent(curItemPath)
          } catch (_) {}
        }
        const nextDataPrefix = `/_next/data/${buildId}/`

        if (
          (type === 'appFile' || type === 'pageFile') &&
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
          curItemPath = curLocaleResult.pathname
          locale = curLocaleResult.locale

          try {
            curDecodedItemPath = decodeURIComponent(curItemPath)
          } catch (_) {}
        }

        // ensure /index is normalized properly
        if (type === 'pageFile') {
          curItemPath = denormalizePagePath(curItemPath)
        }

        // check decoded variant as well
        if (!items.has(curItemPath)) {
          curItemPath = curDecodedItemPath
        }

        if (items.has(curItemPath)) {
          let fsPath

          switch (type) {
            case 'nextStaticFolder': {
              fsPath = path.join(
                nextStaticFolderPath,
                curItemPath.substring('/_next/static'.length)
              )
              break
            }
            case 'legacyStaticFolder': {
              fsPath = path.join(legacyStaticFolderPath, curItemPath)
              break
            }
            case 'publicFolder': {
              fsPath = path.join(publicFolderPath, curItemPath)
              break
            }
            default: {
              break
            }
          }

          const itemResult = {
            type,
            fsPath,
            locale,
            itemPath: curItemPath,
          }
          getItemsLru.set(originalItemPath, itemResult)
          return itemResult
        }
      }
      getItemsLru.set(originalItemPath, null)
      return null
    },
    getDynamicRoutes() {
      // this should include data routes
      return dynamicRoutes
    },
    getMiddlewareMatchers() {
      return middlewareMatcher
    },
  }
}
