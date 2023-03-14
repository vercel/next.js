import fs, { promises } from 'fs'
import { join } from 'path'
import {
  FONT_MANIFEST,
  PAGES_MANIFEST,
  SERVER_DIRECTORY,
  APP_PATHS_MANIFEST,
} from '../shared/lib/constants'
import { normalizeLocalePath } from '../shared/lib/i18n/normalize-locale-path'
import { normalizePagePath } from '../shared/lib/page-path/normalize-page-path'
import { denormalizePagePath } from '../shared/lib/page-path/denormalize-page-path'
import type { PagesManifest } from '../build/webpack/plugins/pages-manifest-plugin'
import { PageNotFoundError, MissingStaticPage } from '../shared/lib/utils'
import LRUCache from 'next/dist/compiled/lru-cache'

const isDev = process.env.NODE_ENV === 'development'
const pagePathCache = isDev
  ? {
      get: (_key: string) => {
        return null
      },
      set: () => {},
      has: () => false,
    }
  : new LRUCache<string, string | null>({
      max: 1000,
    })

const loadManifest = (manifestPath: string) => {
  if (isDev) {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  }
  return require(manifestPath)
}

export function getMaybePagePath(
  page: string,
  distDir: string,
  locales: string[] | undefined,
  isAppPath: boolean
): string | null {
  const cacheKey = `${page}:${distDir}:${locales}:${isAppPath}`

  if (pagePathCache.has(cacheKey)) {
    return pagePathCache.get(cacheKey) as string | null
  }

  const serverBuildPath = join(distDir, SERVER_DIRECTORY)
  let appPathsManifest: undefined | PagesManifest

  if (isAppPath) {
    appPathsManifest = loadManifest(join(serverBuildPath, APP_PATHS_MANIFEST))
  }
  const pagesManifest = loadManifest(
    join(serverBuildPath, PAGES_MANIFEST)
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
    pagePathCache.set(cacheKey, null)
    return null
  }

  const path = join(serverBuildPath, pagePath)
  pagePathCache.set(cacheKey, path)

  return path
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

export function requirePage(
  page: string,
  distDir: string,
  isAppPath: boolean
): any {
  const pagePath = getPagePath(page, distDir, undefined, isAppPath)
  if (pagePath.endsWith('.html')) {
    return promises.readFile(pagePath, 'utf8').catch((err) => {
      throw new MissingStaticPage(page, err.message)
    })
  }
  const exp = require(pagePath)
  return exp
}

export function requireFontManifest(distDir: string) {
  const serverBuildPath = join(distDir, SERVER_DIRECTORY)
  const fontManifest = require(join(serverBuildPath, FONT_MANIFEST))
  return fontManifest
}
