import * as path from 'path'
import * as fs from 'fs'

// Cache for fs.readdirSync lookup.
// Prevent multiple blocking IO requests that have already been calculated.
const fsReadDirSyncCache = {}
export const DEFAULT_PAGE_EXTENSIONS = ['tsx', 'ts', 'jsx', 'js']

function escapeStringRegexp(value: string) {
  return value.replace(/[|\\{}()[\]^$+*?.-]/g, '\\$&')
}

function getPageExtensionsRegexString(pageExtensions: string[]) {
  const extensions = Array.from(
    new Set(
      (pageExtensions.length > 0 ? pageExtensions : DEFAULT_PAGE_EXTENSIONS)
        .map((ext) => ext.trim().replace(/^\./, ''))
        .filter(Boolean)
    )
  )

  return extensions
    .sort((a, b) => b.length - a.length)
    .map(escapeStringRegexp)
    .join('|')
}

function createPageExtensionRegex(pageExtensions: string[]) {
  return new RegExp(`\\.(?:${getPageExtensionsRegexString(pageExtensions)})$`)
}

function createNamedFileRegex(name: string, pageExtensions: string[]) {
  return new RegExp(
    `^${escapeStringRegexp(name)}\\.(?:${getPageExtensionsRegexString(
      pageExtensions
    )})$`
  )
}

/**
 * Recursively parse directory for page URLs.
 */
function parseUrlForPages(
  urlprefix: string,
  directory: string,
  pageExtensionRegex: RegExp,
  indexFileRegex: RegExp
) {
  fsReadDirSyncCache[directory] ??= fs.readdirSync(directory, {
    withFileTypes: true,
  })
  const res = []
  fsReadDirSyncCache[directory].forEach((dirent) => {
    if (pageExtensionRegex.test(dirent.name)) {
      if (indexFileRegex.test(dirent.name)) {
        res.push(`${urlprefix}${dirent.name.replace(indexFileRegex, '')}`)
      }
      res.push(`${urlprefix}${dirent.name.replace(pageExtensionRegex, '')}`)
    } else {
      const dirPath = path.join(directory, dirent.name)
      if (dirent.isDirectory() && !dirent.isSymbolicLink()) {
        res.push(
          ...parseUrlForPages(
            urlprefix + dirent.name + '/',
            dirPath,
            pageExtensionRegex,
            indexFileRegex
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
  pageExtensionRegex: RegExp,
  pageFileRegex: RegExp,
  layoutFileRegex: RegExp,
  indexFileRegex: RegExp
) {
  fsReadDirSyncCache[directory] ??= fs.readdirSync(directory, {
    withFileTypes: true,
  })
  const res = []
  fsReadDirSyncCache[directory].forEach((dirent) => {
    if (pageExtensionRegex.test(dirent.name)) {
      if (pageFileRegex.test(dirent.name)) {
        res.push(`${urlprefix}${dirent.name.replace(pageFileRegex, '')}`)
      } else if (!layoutFileRegex.test(dirent.name)) {
        res.push(`${urlprefix}${dirent.name.replace(pageExtensionRegex, '')}`)
      }
    } else {
      const dirPath = path.join(directory, dirent.name)
      if (dirent.isDirectory(dirPath) && !dirent.isSymbolicLink()) {
        res.push(
          ...parseUrlForPages(
            urlprefix + dirent.name + '/',
            dirPath,
            pageExtensionRegex,
            indexFileRegex
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
  pageExtensions: string[] = DEFAULT_PAGE_EXTENSIONS
) {
  const pageExtensionRegex = createPageExtensionRegex(pageExtensions)
  const indexFileRegex = createNamedFileRegex('index', pageExtensions)

  return Array.from(
    // De-duplicate similar pages across multiple directories.
    new Set(
      directories
        .flatMap((directory) =>
          parseUrlForPages(
            urlPrefix,
            directory,
            pageExtensionRegex,
            indexFileRegex
          )
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
  pageExtensions: string[] = DEFAULT_PAGE_EXTENSIONS
) {
  const pageExtensionRegex = createPageExtensionRegex(pageExtensions)
  const pageFileRegex = createNamedFileRegex('page', pageExtensions)
  const layoutFileRegex = createNamedFileRegex('layout', pageExtensions)
  const indexFileRegex = createNamedFileRegex('index', pageExtensions)

  return Array.from(
    // De-duplicate similar pages across multiple directories.
    new Set(
      directories
        .map((directory) =>
          parseUrlForAppDir(
            urlPrefix,
            directory,
            pageExtensionRegex,
            pageFileRegex,
            layoutFileRegex,
            indexFileRegex
          )
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
