import type { RoutesManifest } from '../../../build'
import type { NextConfigComplete } from '../../config-shared'
import type { MiddlewareManifest } from '../../../build/webpack/plugins/middleware-plugin'

import path from 'path'
import fs from 'fs/promises'
import { findPagesDir } from '../../../lib/find-pages-dir'
import loadCustomRoutes from '../../../lib/load-custom-routes'
import { modifyRouteRegex } from '../../../lib/redirect-status'
import { UnwrapPromise } from '../../../lib/coalesced-function'
import { recursiveReadDir } from '../../../lib/recursive-readdir'
import { getPathMatch } from '../../../shared/lib/router/utils/path-match'
import { getRouteRegex } from '../../../shared/lib/router/utils/route-regex'
import { getRouteMatcher } from '../../../shared/lib/router/utils/route-matcher'
import { normalizePathSep } from '../../../shared/lib/page-path/normalize-path-sep'
import { absolutePathToPage } from '../../../shared/lib/page-path/absolute-path-to-page'
import { getMiddlewareRouteMatcher } from '../../../shared/lib/router/utils/middleware-route-matcher'

import {
  APP_PATH_ROUTES_MANIFEST,
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

  fsPath?: string
}

export async function setupFsCheck(opts: {
  dir: string
  dev: boolean
  config: NextConfigComplete
  addDevWatcherCallback?: (
    arg: (files: Map<string, { timestamp: number }>) => void
  ) => void
}) {
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

  if (process.env.NODE_ENV === 'production') {
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

    for (const file of await recursiveReadDir(
      nextStaticFolderPath,
      () => true
    )) {
      nextStaticFolderItems.add(file)
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
    }
    for (const key of Object.keys(appRoutesManifest)) {
      appFiles.add(appRoutesManifest[key])
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
      console.log('dev watcher callback!', files)
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
    console.log('setup dev watcher callback')
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
    beforeFiles: customRoutes.rewrites.beforeFiles.map((item) =>
      buildCustomRoute('rewrite', item)
    ),
    afterFiles: customRoutes.rewrites.afterFiles.map((item) =>
      buildCustomRoute('rewrite', item)
    ),
    fallback: customRoutes.rewrites.fallback.map((item) =>
      buildCustomRoute('rewrite', item)
    ),
  }

  return {
    headers,
    rewrites,
    redirects,

    async getItem(itemPath: string): Promise<FsOutput | null> {
      if (itemPath !== '/' && itemPath.endsWith('/')) {
        itemPath = itemPath.substring(0, itemPath.length - 1)
      }

      if (itemPath === '/_next/image') {
        return {
          type: 'nextImage',
        }
      }
      const itemsToCheck: Array<[Set<string>, FsOutput['type']]> = [
        [publicFolderItems, 'publicFolder'],
        [legacyStaticFolderItems, 'legacyStaticFolder'],
        [appFiles, 'appFile'],
        [pageFiles, 'pageFile'],
      ]

      if (itemPath.startsWith('/_next/static')) {
        itemsToCheck.unshift([nextStaticFolderItems, 'nextStaticFolder'])
      }
      let decodedItemPath = itemPath

      try {
        decodedItemPath = decodeURIComponent(itemPath)
      } catch (_) {}

      for (const [items, type] of itemsToCheck) {
        let curItemPath = itemPath
        let curDecodedItemPath = decodedItemPath

        if (type === 'nextStaticFolder') {
          curItemPath = curItemPath.substring('/_next/static'.length)

          try {
            decodedItemPath = decodeURIComponent(curItemPath)
          } catch (_) {}
        }

        if (type === 'legacyStaticFolder') {
          curItemPath = curItemPath.substring('/static'.length)

          try {
            decodedItemPath = decodeURIComponent(curItemPath)
          } catch (_) {}
        }

        // check decoded variant as well
        if (!items.has(curItemPath)) {
          curItemPath = curDecodedItemPath
        }

        if (items.has(curItemPath)) {
          let fsPath

          switch (type) {
            case 'nextStaticFolder': {
              fsPath = path.join(nextStaticFolderPath, curItemPath)
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

          return {
            type,
            fsPath,
          }
        }
      }
      return null
    },
    getDynamicRoutes() {
      return dynamicRoutes
    },
    getMiddlewareMatchers() {
      return middlewareMatcher
    },
  }
}
