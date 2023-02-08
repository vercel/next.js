import { promises } from 'fs'
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

let manifestNoLocalesCache = {}

function buildManifestNoLocales(manifest, locales, localesKey) {
  manifestNoLocalesCache[localesKey] = {}
  for (const key of Object.keys(manifest)) {
    manifestNoLocalesCache[localesKey][
      (0, _normalizeLocalePath).normalizeLocalePath(key, locales).pathname
    ] = manifest[key]
  }
}

function getFromManifestNoLocales(manifest, page, locales) {
  const localesKey = (locales || []).join('-')
  if (!manifestNoLocalesCache[localesKey]) {
    buildManifestNoLocales(manifest, locales, localesKey)
  }

  return manifestNoLocalesCache[localesKey][page]
}

function checkManifest(manifest, page, locales) {
  let curPath = manifest[page]
  if (!manifest[curPath] && locales) {
    curPath = getFromManifestNoLocales(manifest, page, locales)
  }
  return curPath
}

const pagePathCache =
  process.env.NODE_ENV === 'development'
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

export function getMaybePagePath(
  page: string,
  distDir: string,
  locales?: string[],
  appDirEnabled?: boolean
): string | null {
  const cacheKey = `${page}:${locales}`

  if (pagePathCache.has(cacheKey)) {
    return pagePathCache.get(cacheKey) as string | null
  }

  const serverBuildPath = join(distDir, SERVER_DIRECTORY)
  let appPathsManifest: undefined | PagesManifest

  if (appDirEnabled) {
    appPathsManifest = require(join(serverBuildPath, APP_PATHS_MANIFEST))
  }
  const pagesManifest = require(join(
    serverBuildPath,
    PAGES_MANIFEST
  )) as PagesManifest

  try {
    page = denormalizePagePath(normalizePagePath(page))
  } catch (err) {
    console.error(err)
    throw new PageNotFoundError(page)
  }

  let pagePath: string | undefined

  if (appPathsManifest) {
    pagePath = checkManifest(appPathsManifest, page, locales)
  }

  if (!pagePath) {
    pagePath = checkManifest(pagesManifest, page, locales)
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
  locales?: string[],
  appDirEnabled?: boolean
): string {
  const pagePath = getMaybePagePath(page, distDir, locales, appDirEnabled)

  if (!pagePath) {
    throw new PageNotFoundError(page)
  }

  return pagePath
}

export function requirePage(
  page: string,
  distDir: string,
  appDirEnabled?: boolean
): any {
  const pagePath = getPagePath(page, distDir, undefined, appDirEnabled)
  if (pagePath.endsWith('.html')) {
    return promises.readFile(pagePath, 'utf8').catch((err) => {
      throw new MissingStaticPage(page, err.message)
    })
  }
  return require(pagePath)
}

export function requireFontManifest(distDir: string) {
  const serverBuildPath = join(distDir, SERVER_DIRECTORY)
  const fontManifest = require(join(serverBuildPath, FONT_MANIFEST))
  return fontManifest
}
