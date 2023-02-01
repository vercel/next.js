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

const pathnameFilenameCache =
  process.env.NODE_ENV === 'development'
    ? null
    : new LRUCache<string, string | null>({ max: 1000 })

function loadManifest(dir: string, name: string): PagesManifest {
  return require(join(dir, SERVER_DIRECTORY, name))
}

function lookupModuleFilename(
  pathname: string,
  manifest: PagesManifest,
  locales?: string[]
) {
  const file = manifest[pathname]

  // If the file in the manifest exists or there is no locales, then
  // we got the right file.
  if (file || !locales) return file

  // Try to find the file in the manifest without locales.
  for (const key of Object.keys(manifest)) {
    const { pathname: stripped } = normalizeLocalePath(key, locales)
    if (stripped !== pathname) continue

    return manifest[key]
  }

  // Looks like there wasn't a better match. Just return the
  // original match then.
  return file
}

/**
 * Tries to lookup the page using the manifest files.
 *
 * @param pathname the requested pathname that we should look up the requisite module for
 * @param distDir the compiled `.next` directory
 * @param locales list of locales supported on this server
 * @param appDirEnabled when true, indicates that app directory paths should be tested as well
 * @returns the page path if it exists
 */
export function maybeGetModuleFilename(
  pathname: string,
  distDir: string,
  locales?: string[],
  appDirEnabled?: boolean
): string | null {
  const cacheKey = `${pathname}:${locales}`

  let filename = pathnameFilenameCache?.get(cacheKey)
  if (typeof filename !== 'undefined') return filename

  // Renormalize the page pathname.
  try {
    pathname = denormalizePagePath(normalizePagePath(pathname))
  } catch (err) {
    console.error(err)
    throw new PageNotFoundError(pathname)
  }

  // First try to lookup the filename using the app manifest
  // if it's enabled.
  if (appDirEnabled) {
    filename = lookupModuleFilename(
      pathname,
      loadManifest(distDir, APP_PATHS_MANIFEST),
      locales
    )
  }

  // If we couldn't find it, then look it up using the pages
  // manifest.
  if (!filename) {
    filename = lookupModuleFilename(
      pathname,
      loadManifest(distDir, PAGES_MANIFEST),
      locales
    )
  }

  if (!filename) {
    pathnameFilenameCache?.set(cacheKey, null)
    return null
  }

  // Make the filename reference absolute.
  filename = join(distDir, SERVER_DIRECTORY, filename)
  pathnameFilenameCache?.set(cacheKey, filename)

  return filename
}

export function getPagePath(
  page: string,
  distDir: string,
  locales?: string[],
  appDirEnabled?: boolean
): string {
  const pagePath = maybeGetModuleFilename(page, distDir, locales, appDirEnabled)
  if (!pagePath) {
    throw new PageNotFoundError(page)
  }

  return pagePath
}

export async function requirePage(
  page: string,
  distDir: string,
  appDirEnabled?: boolean
): Promise<any> {
  const pagePath = getPagePath(page, distDir, undefined, appDirEnabled)

  // If the page path that was resolved ends with `.html`, it can be
  // directly.
  if (pagePath.endsWith('.html')) {
    try {
      return await promises.readFile(pagePath, 'utf8')
    } catch (err: any) {
      throw new MissingStaticPage(page, err.message)
    }
  }

  return await require(pagePath)
}

export function requireFontManifest(distDir: string) {
  const serverBuildPath = join(distDir, SERVER_DIRECTORY)
  const fontManifest = require(join(serverBuildPath, FONT_MANIFEST))
  return fontManifest
}
