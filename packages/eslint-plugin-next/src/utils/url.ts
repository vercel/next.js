import * as path from 'path'
import * as fs from 'fs'

// Cache for fs.readdirSync lookup.
// Prevent multiple blocking IO requests that have already been calculated.
const fsReadDirSyncCache = {}

// Next.js default `pageExtensions` when none are configured.
// https://nextjs.org/docs/app/api-reference/config/next-config-js/pageExtensions
const DEFAULT_PAGE_EXTENSIONS = ['tsx', 'ts', 'jsx', 'js']

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Normalize configured `pageExtensions` (rule option or `settings.next`)
 * into extensions without a leading dot. Invalid/empty input falls back to
 * Next.js defaults.
 */
export function normalizePageExtensions(pageExtensions: unknown): string[] {
  if (!Array.isArray(pageExtensions)) {
    return [...DEFAULT_PAGE_EXTENSIONS]
  }

  const normalized = [
    ...new Set(
      pageExtensions
        .filter(
          (extension): extension is string =>
            typeof extension === 'string' && extension.length > 0
        )
        .map((extension) => extension.replace(/^\.+/, ''))
        .filter((extension) => extension.length > 0)
    ),
  ]

  return normalized.length > 0 ? normalized : [...DEFAULT_PAGE_EXTENSIONS]
}

/**
 * Build a RegExp alternation for page extensions. Longer compound extensions
 * (e.g. `page.tsx`) are listed first so they win over shorter suffixes (`tsx`).
 */
function getPageExtensionAlternation(pageExtensions: string[]): string {
  return [...pageExtensions]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|')
}

function getPageExtensionMatchers(pageExtensions: string[]) {
  const alternation = getPageExtensionAlternation(pageExtensions)
  return {
    pageFile: new RegExp(`\\.(${alternation})$`),
    indexPage: new RegExp(`^index\\.(${alternation})$`),
    appPage: new RegExp(`^page\\.(${alternation})$`),
    appLayout: new RegExp(`^layout\\.(${alternation})$`),
  }
}

/**
 * Recursively parse directory for page URLs.
 */
function parseUrlForPages(
  urlprefix: string,
  directory: string,
  pageExtensions: string[]
) {
  fsReadDirSyncCache[directory] ??= fs.readdirSync(directory, {
    withFileTypes: true,
  })
  const { pageFile, indexPage } = getPageExtensionMatchers(pageExtensions)
  const res = []
  fsReadDirSyncCache[directory].forEach((dirent) => {
    if (pageFile.test(dirent.name)) {
      if (indexPage.test(dirent.name)) {
        res.push(`${urlprefix}${dirent.name.replace(indexPage, '')}`)
      }
      res.push(`${urlprefix}${dirent.name.replace(pageFile, '')}`)
    } else {
      const dirPath = path.join(directory, dirent.name)
      if (dirent.isDirectory() && !dirent.isSymbolicLink()) {
        res.push(
          ...parseUrlForPages(
            urlprefix + dirent.name + '/',
            dirPath,
            pageExtensions
          )
        )
      }
    }
  })
  return res
}

/**
 * Recursively parse app directory for URLs.
 */
function parseUrlForAppDir(
  urlprefix: string,
  directory: string,
  pageExtensions: string[]
) {
  fsReadDirSyncCache[directory] ??= fs.readdirSync(directory, {
    withFileTypes: true,
  })
  const { pageFile, appPage, appLayout } =
    getPageExtensionMatchers(pageExtensions)
  const res = []
  fsReadDirSyncCache[directory].forEach((dirent) => {
    if (pageFile.test(dirent.name)) {
      if (appPage.test(dirent.name)) {
        res.push(`${urlprefix}${dirent.name.replace(appPage, '')}`)
      } else if (!appLayout.test(dirent.name)) {
        res.push(`${urlprefix}${dirent.name.replace(pageFile, '')}`)
      }
    } else {
      const dirPath = path.join(directory, dirent.name)
      if (dirent.isDirectory() && !dirent.isSymbolicLink()) {
        res.push(
          ...parseUrlForAppDir(
            urlprefix + dirent.name + '/',
            dirPath,
            pageExtensions
          )
        )
      }
    }
  })
  return res
}

/**
 * Takes a URL and does the following things.
 *  - Replaces `index.html` with `/`
 *  - Makes sure all URLs are have a trailing `/`
 *  - Removes query string
 */
export function normalizeURL(url: string) {
  if (!url) {
    return
  }
  url = url.split('?', 1)[0]
  url = url.split('#', 1)[0]
  url = url = url.replace(/(\/index\.html)$/, '/')
  // Empty URLs should not be trailed with `/`, e.g. `#heading`
  if (url === '') {
    return url
  }
  url = url.endsWith('/') ? url : url + '/'
  return url
}

/**
 * Normalizes an app route so it represents the actual request path. Essentially
 * performing the following transformations:
 *
 * - `/(dashboard)/user/[id]/page` to `/user/[id]`
 * - `/(dashboard)/account/page` to `/account`
 * - `/user/[id]/page` to `/user/[id]`
 * - `/account/page` to `/account`
 * - `/page` to `/`
 * - `/(dashboard)/user/[id]/route` to `/user/[id]`
 * - `/(dashboard)/account/route` to `/account`
 * - `/user/[id]/route` to `/user/[id]`
 * - `/account/route` to `/account`
 * - `/route` to `/`
 * - `/` to `/`
 *
 * @param route the app route to normalize
 * @returns the normalized pathname
 */
export function normalizeAppPath(route: string) {
  return ensureLeadingSlash(
    route.split('/').reduce((pathname, segment, index, segments) => {
      // Empty segments are ignored.
      if (!segment) {
        return pathname
      }

      // Groups are ignored.
      if (isGroupSegment(segment)) {
        return pathname
      }

      // Parallel segments are ignored.
      if (segment[0] === '@') {
        return pathname
      }

      // The last segment (if it's a leaf) should be ignored.
      if (
        (segment === 'page' || segment === 'route') &&
        index === segments.length - 1
      ) {
        return pathname
      }

      return `${pathname}/${segment}`
    }, '')
  )
}

/**
 * Gets the possible URLs from a directory.
 */
export function getUrlFromPagesDirectories(
  urlPrefix: string,
  directories: string[],
  pageExtensions?: string[]
) {
  const extensions = normalizePageExtensions(pageExtensions)
  return Array.from(
    // De-duplicate similar pages across multiple directories.
    new Set(
      directories
        .flatMap((directory) =>
          parseUrlForPages(urlPrefix, directory, extensions)
        )
        .map(
          // Since the URLs are normalized we add `^` and `$` to the RegExp to make sure they match exactly.
          (url) => `^${normalizeURL(url)}$`
        )
    )
  ).map((urlReg) => {
    urlReg = urlReg.replace(/\[.*\]/g, '((?!.+?\\..+?).*?)')
    return new RegExp(urlReg)
  })
}

export function getUrlFromAppDirectory(
  urlPrefix: string,
  directories: string[],
  pageExtensions?: string[]
) {
  const extensions = normalizePageExtensions(pageExtensions)
  return Array.from(
    // De-duplicate similar pages across multiple directories.
    new Set(
      directories
        .map((directory) =>
          parseUrlForAppDir(urlPrefix, directory, extensions)
        )
        .flat()
        .map(
          // Since the URLs are normalized we add `^` and `$` to the RegExp to make sure they match exactly.
          (url) => `^${normalizeAppPath(url)}$`
        )
    )
  ).map((urlReg) => {
    urlReg = urlReg.replace(/\[.*\]/g, '((?!.+?\\..+?).*?)')
    return new RegExp(urlReg)
  })
}

export function execOnce<TArgs extends any[], TResult>(
  fn: (...args: TArgs) => TResult
): (...args: TArgs) => TResult {
  let used = false
  let result: TResult

  return (...args: TArgs) => {
    if (!used) {
      used = true
      result = fn(...args)
    }
    return result
  }
}

function ensureLeadingSlash(route: string) {
  return route.startsWith('/') ? route : `/${route}`
}

function isGroupSegment(segment: string) {
  return segment[0] === '(' && segment.endsWith(')')
}
