import * as path from 'path'
import * as fs from 'fs'

// Cache for fs.readdirSync lookup.
// Prevent multiple blocking IO requests that have already been calculated.
const fsReadDirSyncCache = {}

/**
 * Recursively parse directory for page URLs.
 */
function parseUrlForPages(urlprefix: string, directory: string, pageExtensions: string[] = ['tsx', 'ts', 'jsx', 'js']) {
  fsReadDirSyncCache[directory] ??= fs.readdirSync(directory, {
    withFileTypes: true,
  })
  const res = []

  // Create regex pattern for matching page files with custom extensions
  const pageExtensionsPattern = pageExtensions.length > 0
    ? new RegExp(`\\.(${pageExtensions.join('|')})$`)
    : /(\.(j|t)sx?)$/

  // Create pattern for index files
  const indexPattern = pageExtensions.length > 0
    ? new RegExp(`^index\\.(${pageExtensions.join('|')})$`)
    : /^index(\.(j|t)sx?)$/

  fsReadDirSyncCache[directory].forEach((dirent) => {
    if (pageExtensionsPattern.test(dirent.name)) {
      if (indexPattern.test(dirent.name)) {
        const extension = pageExtensions.length > 0
          ? dirent.name.match(pageExtensionsPattern)?.[1]
          : dirent.name.match(/\.(j|t)sx?$/)?.[0]
        res.push(
          `${urlprefix}${dirent.name.replace(indexPattern, '')}`
        )
      }
      res.push(`${urlprefix}${dirent.name.replace(pageExtensionsPattern, '')}`)
    } else {
      const dirPath = path.join(directory, dirent.name)
      if (dirent.isDirectory() && !dirent.isSymbolicLink()) {
        res.push(...parseUrlForPages(urlprefix + dirent.name + '/', dirPath, pageExtensions))
      }
    }
  })
  return res
}

/**
 * Recursively parse app directory for URLs.
 */
function parseUrlForAppDir(urlprefix: string, directory: string, pageExtensions: string[] = ['tsx', 'ts', 'jsx', 'js']) {
  fsReadDirSyncCache[directory] ??= fs.readdirSync(directory, {
    withFileTypes: true,
  })
  const res = []

  // Create regex pattern for matching page files with custom extensions
  const pageExtensionsPattern = pageExtensions.length > 0
    ? new RegExp(`\\.(${pageExtensions.join('|')})$`)
    : /(\.(j|t)sx?)$/

  // Create pattern for page and layout files
  const pagePattern = pageExtensions.length > 0
    ? new RegExp(`^page\\.(${pageExtensions.join('|')})$`)
    : /^page(\.(j|t)sx?)$/

  const layoutPattern = pageExtensions.length > 0
    ? new RegExp(`^layout\\.(${pageExtensions.join('|')})$`)
    : /^layout(\.(j|t)sx?)$/

  fsReadDirSyncCache[directory].forEach((dirent) => {
    if (pageExtensionsPattern.test(dirent.name)) {
      if (pagePattern.test(dirent.name)) {
        res.push(`${urlprefix}${dirent.name.replace(pagePattern, '')}`)
      } else if (!layoutPattern.test(dirent.name)) {
        res.push(`${urlprefix}${dirent.name.replace(pageExtensionsPattern, '')}`)
      }
    } else {
      const dirPath = path.join(directory, dirent.name)
      if (dirent.isDirectory(dirPath) && !dirent.isSymbolicLink()) {
        res.push(...parseUrlForPages(urlprefix + dirent.name + '/', dirPath, pageExtensions))
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
  return Array.from(
    // De-duplicate similar pages across multiple directories.
    new Set(
      directories
        .flatMap((directory) => parseUrlForPages(urlPrefix, directory, pageExtensions))
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
  return Array.from(
    // De-duplicate similar pages across multiple directories.
    new Set(
      directories
        .map((directory) => parseUrlForAppDir(urlPrefix, directory, pageExtensions))
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
