import * as path from 'path'
import * as fs from 'fs'

// Cache for fs.readdirSync lookup.
// Prevent multiple blocking IO requests that have already been calculated.
const fsReadDirSyncCache: Record<string, fs.Dirent[]> = {}

const DEFAULT_EXTENSIONS = ['js', 'jsx', 'ts', 'tsx']

type PageExtensionUtils = {
  matchesFile: (name: string) => boolean
  stripExtension: (name: string) => string
}

const sanitizeExtensions = (extensions: string[]): string[] => {
  if (!extensions.length) {
    return DEFAULT_EXTENSIONS
  }

  const normalized = extensions
    .map((extension) => extension.replace(/^\./, '').toLowerCase())
    .filter(Boolean)

  if (!normalized.length) {
    return DEFAULT_EXTENSIONS
  }

  return Array.from(new Set(normalized))
}

const createPageExtensionUtils = (pageExtensions: string[]): PageExtensionUtils => {
  const normalized = sanitizeExtensions(pageExtensions)
  const sortedExtensions = [...normalized].sort((a, b) => b.length - a.length)

  return {
    matchesFile(name: string) {
      const lowerName = name.toLowerCase()
      return sortedExtensions.some((extension) =>
        lowerName.endsWith(`.${extension}`)
      )
    },
    stripExtension(name: string) {
      const lowerName = name.toLowerCase()
      for (const extension of sortedExtensions) {
        const suffix = `.${extension}`
        if (lowerName.endsWith(suffix)) {
          return name.slice(0, -suffix.length)
        }
      }
      return name
    },
  }
}

/**
 * Recursively parse directory for page URLs.
 */
function parseUrlForPages(
  urlprefix: string,
  directory: string,
  utils: PageExtensionUtils
) {
  fsReadDirSyncCache[directory] ??= fs.readdirSync(directory, {
    withFileTypes: true,
  })
  const res: string[] = []
  fsReadDirSyncCache[directory].forEach((dirent) => {
    const dirPath = path.join(directory, dirent.name)

    if (dirent.isDirectory() && !dirent.isSymbolicLink()) {
      res.push(
        ...parseUrlForPages(urlprefix + dirent.name + '/', dirPath, utils)
      )
      return
    }

    if (!dirent.isFile() || !utils.matchesFile(dirent.name)) {
      return
    }

    const strippedName = utils.stripExtension(dirent.name)

    if (/^index$/i.test(strippedName)) {
      res.push(`${urlprefix}`)
    }

    res.push(`${urlprefix}${strippedName}`)
  })
  return res
}

/**
 * Recursively parse app directory for URLs.
 */
function parseUrlForAppDir(
  urlprefix: string,
  directory: string,
  utils: PageExtensionUtils
) {
  fsReadDirSyncCache[directory] ??= fs.readdirSync(directory, {
    withFileTypes: true,
  })
  const res: string[] = []
  fsReadDirSyncCache[directory].forEach((dirent) => {
    const dirPath = path.join(directory, dirent.name)

    if (dirent.isDirectory() && !dirent.isSymbolicLink()) {
      res.push(
        ...parseUrlForAppDir(urlprefix + dirent.name + '/', dirPath, utils)
      )
      return
    }

    if (!dirent.isFile() || !utils.matchesFile(dirent.name)) {
      return
    }

    const strippedName = utils.stripExtension(dirent.name)

    if (strippedName === 'layout') {
      return
    }

    if (strippedName === 'page') {
      res.push(`${urlprefix}`)
      return
    }

    res.push(`${urlprefix}${strippedName}`)
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
  pageExtensions: string[]
) {
  const utils = createPageExtensionUtils(pageExtensions)

  return Array.from(
    // De-duplicate similar pages across multiple directories.
    new Set(
      directories
        .flatMap((directory) => parseUrlForPages(urlPrefix, directory, utils))
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
  pageExtensions: string[]
) {
  const utils = createPageExtensionUtils(pageExtensions)

  return Array.from(
    // De-duplicate similar pages across multiple directories.
    new Set(
      directories
        .map((directory) => parseUrlForAppDir(urlPrefix, directory, utils))
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
