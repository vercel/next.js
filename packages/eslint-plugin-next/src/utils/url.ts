import * as path from 'path'
import * as fs from 'fs'

// Cache for fs.readdirSync lookup.
// Prevent multiple blocking IO requests that have already been calculated.
const fsReadDirSyncCache = {}

// Default `pageExtensions` used by Next.js when none are configured.
// See https://nextjs.org/docs/app/api-reference/config/next-config-js/pageExtensions
const DEFAULT_PAGE_EXTENSIONS = ['tsx', 'ts', 'jsx', 'js']

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Normalizes a user-configured `pageExtensions` value (from `next.config.js`)
 * into a list of extensions without leading dots. Falls back to the default
 * extensions when the value is missing or invalid.
 */
export function normalizePageExtensions(pageExtensions: unknown): string[] {
  if (Array.isArray(pageExtensions)) {
    const cleaned = [
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
    if (cleaned.length > 0) {
      return cleaned
    }
  }
  return [...DEFAULT_PAGE_EXTENSIONS]
}

/**
 * Builds a RegExp alternation matching any of the given page extensions.
 * Longer (compound) extensions such as `page.tsx` are ordered first so they
 * match before their shorter suffixes (e.g. `tsx`).
 */
function createPageExtensionPattern(pageExtensions: string[]): string {
  return [...pageExtensions]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|')
}

/**
 * Recursively parse directory for page URLs.
 */
function parseUrlForPages(
  urlprefix: string,
  directory: string,
  pageExtensions: string[] = DEFAULT_PAGE_EXTENSIONS
) {
  fsReadDirSyncCache[directory] ??= fs.readdirSync(directory, {
    withFileTypes: true,
  })
  const extensionPattern = createPageExtensionPattern(pageExtensions)
  const pageFilePattern = new RegExp(`\\.(${extensionPattern})$`)
  const indexPagePattern = new RegExp(`^index\\.(${extensionPattern})$`)
  const res = []
  fsReadDirSyncCache[directory].forEach((dirent) => {
    if (pageFilePattern.test(dirent.name)) {
      if (indexPagePattern.test(dirent.name)) {
        res.push(
          `${urlprefix}${dirent.name.replace(indexPagePattern, '')}`
        )
      }
      res.push(`${urlprefix}${dirent.name.replace(pageFilePattern, '')}`)
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
  pageExtensions: string[] = DEFAULT_PAGE_EXTENSIONS
) {
  fsReadDirSyncCache[directory] ??= fs.readdirSync(directory, {
    withFileTypes: true,
  })
  const extensionPattern = createPageExtensionPattern(pageExtensions)
  const pageFilePattern = new RegExp(`\\.(${extensionPattern})$`)
  const appPagePattern = new RegExp(`^page\\.(${extensionPattern})$`)
  const appLayoutPattern = new RegExp(`^layout\\.(${extensionPattern})$`)
  const res = []
  fsReadDirSyncCache[directory].forEach((dirent) => {
    if (pageFilePattern.test(dirent.name)) {
      if (appPagePattern.test(dirent.name)) {
        res.push(`${urlprefix}${dirent.name.replace(appPagePattern, '')}`)
      } else if (!appLayoutPattern.test(dirent.name)) {
        res.push(`${urlprefix}${dirent.name.replace(pageFilePattern, '')}`)
      }
    } else {
      const dirPath = path.join(directory, dirent.name)
      if (dirent.isDirectory(dirPath) && !dirent.isSymbolicLink()) {
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
        .flatMap((directory) =>
          parseUrlForPages(
            urlPrefix,
            directory,
            normalizePageExtensions(pageExtensions)
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
  pageExtensions?: string[]
) {
  return Array.from(
    // De-duplicate similar pages across multiple directories.
    new Set(
      directories
        .map((directory) =>
          parseUrlForAppDir(
            urlPrefix,
            directory,
            normalizePageExtensions(pageExtensions)
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
