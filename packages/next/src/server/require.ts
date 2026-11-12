import path from 'path'
import {
  PAGES_MANIFEST,
  SERVER_DIRECTORY,
  APP_PATHS_MANIFEST,
} from '../shared/lib/constants'
import { normalizeLocalePath } from '../shared/lib/i18n/normalize-locale-path'
import { normalizePagePath } from '../shared/lib/page-path/normalize-page-path'
import { denormalizePagePath } from '../shared/lib/page-path/denormalize-page-path'
import type { PagesManifest } from '../build/webpack/plugins/pages-manifest-plugin'
import { PageNotFoundError, MissingStaticPage } from '../shared/lib/utils'
import { LRUCache } from '../server/lib/lru-cache'
import { loadManifest } from './load-manifest.external'
import { promises } from 'fs'

const isDev = process.env.NODE_ENV === 'development'

/**
 * What `pagePathCache` stores for a page that is in neither manifest, next to
 * the resolved file path it stores for a page that is in one.
 */
const enum PagePathCacheEntry {
  NotInManifest = 0,
}

const pagePathCache = !isDev
  ? new LRUCache<string | PagePathCacheEntry>(1000)
  : null

function getPagePathCacheKey(
  page: string,
  distDir: string,
  locales: readonly string[] | undefined,
  isAppPath: boolean
): string {
  return `${page}:${distDir}:${locales}:${isAppPath}`
}

export function getMaybePagePath(
  page: string,
  distDir: string,
  locales: readonly string[] | undefined,
  isAppPath: boolean
): string | null {
  const cacheKey = getPagePathCacheKey(page, distDir, locales, isAppPath)

  const cached = pagePathCache?.get(cacheKey)

  // If we have a cached path, we can return it directly.
  if (typeof cached === 'string') return cached

  // Outside of a dev server the manifests are loaded once and frozen, so a
  // page that was in neither manifest is still in neither, and the stored
  // miss is returned. A dev server compiles pages on demand and reloads its
  // manifests, so a page that was missing can exist a moment later: there
  // the lookup is always redone. The cache also exists in a dev server that
  // runs with a `NODE_ENV` other than `development`, hence the second check,
  // which is read on every call because the variable is set when the dev
  // server starts.
  if (
    cached === PagePathCacheEntry.NotInManifest &&
    !process.env.__NEXT_DEV_SERVER
  ) {
    return null
  }

  const serverBuildPath = path.join(
    /* turbopackIgnore: true */ distDir,
    SERVER_DIRECTORY
  )
  let appPathsManifest: undefined | PagesManifest

  if (isAppPath) {
    appPathsManifest = loadManifest(
      path.join(
        /* turbopackIgnore: true */ serverBuildPath,
        APP_PATHS_MANIFEST
      ),
      !isDev
    ) as PagesManifest
  }
  const pagesManifest = loadManifest(
    path.join(/* turbopackIgnore: true */ serverBuildPath, PAGES_MANIFEST),
    !isDev
  ) as PagesManifest

  try {
    page = denormalizePagePath(normalizePagePath(page))
  } catch (err) {
    console.error(err)
    throw new PageNotFoundError(page)
  }

  const checkManifest = (manifest: PagesManifest) => {
    let curPath = manifest[page]

    if (!manifest[curPath] && locales) {
      const manifestNoLocales: typeof pagesManifest = {}

      for (const key of Object.keys(manifest)) {
        manifestNoLocales[normalizeLocalePath(key, locales).pathname] =
          pagesManifest[key]
      }
      curPath = manifestNoLocales[page]
    }
    return curPath
  }

  let pagePath: string | undefined

  if (appPathsManifest) {
    pagePath = checkManifest(appPathsManifest)
  }

  if (!pagePath) {
    pagePath = checkManifest(pagesManifest)
  }

  if (!pagePath) {
    pagePathCache?.set(cacheKey, PagePathCacheEntry.NotInManifest)
    return null
  }

  // Handle absolute paths (e.g., built-in components)
  if (path.isAbsolute(pagePath)) {
    // Use the absolute path as-is
    pagePathCache?.set(cacheKey, pagePath)
    return pagePath
  }

  pagePath = path.join(/* turbopackIgnore: true */ serverBuildPath, pagePath)

  pagePathCache?.set(cacheKey, pagePath)
  return pagePath
}

/**
 * Whether `getMaybePagePath` has stored that a page is in no manifest and
 * answers `null` for it without looking again. Never the case in a dev
 * server, where a page that was missing can exist a moment later.
 */
export function isPagePathStoredMiss(
  page: string,
  distDir: string,
  locales: readonly string[] | undefined,
  isAppPath: boolean
): boolean {
  if (!pagePathCache || process.env.__NEXT_DEV_SERVER) return false

  return (
    pagePathCache.get(
      getPagePathCacheKey(page, distDir, locales, isAppPath)
    ) === PagePathCacheEntry.NotInManifest
  )
}

export function getPagePath(
  page: string,
  distDir: string,
  locales: string[] | undefined,
  isAppPath: boolean
): string {
  const pagePath = getMaybePagePath(page, distDir, locales, isAppPath)

  if (!pagePath) {
    throw new PageNotFoundError(page)
  }

  return pagePath
}

export async function requirePage(
  page: string,
  distDir: string,
  isAppPath: boolean
): Promise<any> {
  const pagePath = getPagePath(page, distDir, undefined, isAppPath)
  if (pagePath.endsWith('.html')) {
    return promises
      .readFile(/* turbopackIgnore: true */ pagePath, 'utf8')
      .catch((err) => {
        throw new MissingStaticPage(page, err.message)
      })
  }

  const mod = process.env.NEXT_MINIMAL
    ? // @ts-ignore
      __non_webpack_require__(pagePath)
    : require(/* turbopackIgnore: true */ pagePath)
  return mod
}
