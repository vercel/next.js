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
const pagePathCache = !isDev ? new LRUCache<string | null>(1000) : null

const requireCache: NodeJS.Dict<NodeModule> = process.env.NEXT_MINIMAL
  ? // @ts-ignore
    __non_webpack_require__.cache
  : require.cache

type LoadedPage = { filename: string; module: NodeModule }

/**
 * The `require.cache` entries of the pages that were loaded, by page path.
 * This answers without going through the module loader, which resolves the
 * request, looks up its own cache and reports the load on every call.
 *
 * An entry is only used while it is still the entry in `require.cache`, so
 * this returns what `require()` would return: once the entry is deleted (a dev
 * server does that to pick up a rebuilt page), the page is loaded again. It
 * holds what `require.cache` holds anyway, one entry per page path.
 *
 * Dev servers do not use it at all. A dev server is not always
 * `NODE_ENV=development` (`NODE_ENV=test next dev` keeps its `NODE_ENV`), so
 * it is also off whenever `__NEXT_DEV_SERVER` is set. That is decided on the
 * first page load, not when this module loads, because a custom server only
 * sets it in `prepare()`.
 */
let pageModuleCache: Map<string, LoadedPage> | null | undefined

function getPageModuleCache(): Map<string, LoadedPage> | null {
  if (pageModuleCache === undefined) {
    pageModuleCache =
      isDev || process.env.__NEXT_DEV_SERVER
        ? null
        : new Map<string, LoadedPage>()
  }
  return pageModuleCache
}

export function getMaybePagePath(
  page: string,
  distDir: string,
  locales: readonly string[] | undefined,
  isAppPath: boolean
): string | null {
  const cacheKey = `${page}:${distDir}:${locales}:${isAppPath}`

  let pagePath = pagePathCache?.get(cacheKey)

  // If we have a cached path, we can return it directly.
  if (pagePath) return pagePath

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

  if (appPathsManifest) {
    pagePath = checkManifest(appPathsManifest)
  }

  if (!pagePath) {
    pagePath = checkManifest(pagesManifest)
  }

  if (!pagePath) {
    pagePathCache?.set(cacheKey, null)
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

  const moduleCache = getPageModuleCache()
  const loaded = moduleCache?.get(pagePath)
  if (loaded !== undefined && requireCache[loaded.filename] === loaded.module) {
    return loaded.module.exports
  }

  const mod = process.env.NEXT_MINIMAL
    ? // @ts-ignore
      __non_webpack_require__(pagePath)
    : require(/* turbopackIgnore: true */ pagePath)
  if (moduleCache) {
    const filename: string = process.env.NEXT_MINIMAL
      ? // @ts-ignore
        __non_webpack_require__.resolve(pagePath)
      : require.resolve(/* turbopackIgnore: true */ pagePath)
    const entry = requireCache[filename]
    if (entry !== undefined && entry.exports === mod) {
      moduleCache.set(pagePath, { filename, module: entry })
    }
  }
  return mod
}
