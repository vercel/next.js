import * as path from 'path'
import * as fs from 'fs'

// Cache for fs.readdirSync lookup.
// Prevent multiple blocking IO requests that have already been calculated.
const fsReadDirSyncCache: Record<string, fs.Dirent[]> = {}

/**
 * Recursively parse directory for page URLs.
 */
function parseUrlForPages(urlprefix: string, directory: string): string[] {
  fsReadDirSyncCache[directory] ??= fs.readdirSync(directory, {
    withFileTypes: true,
  })
  const res: string[] = []
  fsReadDirSyncCache[directory].forEach((dirent) => {
    if (/(\.(j|t)sx?)$/.test(dirent.name)) {
      if (/^index(\.(j|t)sx?)$/.test(dirent.name)) {
        res.push(
          `${urlprefix}${dirent.name.replace(/^index(\.(j|t)sx?)$/, '')}`
        )
      }
      res.push(`${urlprefix}${dirent.name.replace(/(\.(j|t)sx?)$/, '')}`)
    } else {
      const dirPath = path.join(directory, dirent.name)
      if (dirent.isDirectory() && !dirent.isSymbolicLink()) {
        res.push(...parseUrlForPages(urlprefix + dirent.name + '/', dirPath))
      }
    }
  })
  return res
}

/**
 * Recursively parse app directory for URLs.
 */
function parseUrlForAppDir(urlprefix: string, directory: string): string[] {
  fsReadDirSyncCache[directory] ??= fs.readdirSync(directory, {
    withFileTypes: true,
  })
  const res: string[] = []
  fsReadDirSyncCache[directory].forEach((dirent) => {
    if (/(\.(j|t)sx?)$/.test(dirent.name)) {
      if (/^page(\.(j|t)sx?)$/.test(dirent.name)) {
        res.push(`${urlprefix}${dirent.name.replace(/^page(\.(j|t)sx?)$/, '')}`)
      } else if (!/^layout(\.(j|t)sx?)$/.test(dirent.name)) {
        res.push(`${urlprefix}${dirent.name.replace(/(\.(j|t)sx?)$/, '')}`)
      }
    } else {
      const dirPath = path.join(directory, dirent.name)
      if (dirent.isDirectory() && !dirent.isSymbolicLink()) {
        res.push(...parseUrlForAppDir(urlprefix + dirent.name + '/', dirPath))
      }
    }
  })
  return res
}

/**
 * Takes a URL and does the following things.
 *  - Replaces `index.html` with `/`
 *  - Makes sure all URLs have a trailing `/`
 *  - Removes query string
 */
export function normalizeURL(url: string) {
  if (!url) {
    return ''
  }
  url = url.split('?', 1)[0]
  url = url.split('#', 1)[0]
  url = url.replace(/(\/index\.html)$/, '/')
  if (url === '') {
    return url
  }
  url = url.endsWith('/') ? url : url + '/'
  return url
}

/**
 * Normalizes an app route so it represents the actual request path.
 */
export function normalizeAppPath(route: string) {
  return ensureLeadingSlash(
    route.split('/').reduce((pathname, segment, index, segments) => {
      if (!segment) {
        return pathname
      }

      if (isGroupSegment(segment)) {
        return pathname
      }

      if (segment[0] === '@') {
        return pathname
      }

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
  directories: string[]
) {
  return Array.from(
    new Set(
      directories
        .flatMap((directory) => parseUrlForPages(urlPrefix, directory))
        .map((url) => `^${normalizeURL(url)}$`)
    )
  ).map((urlReg) => {
    urlReg = urlReg.replace(/\[.*\]/g, '((?!.+?\\..+?).*?)')
    return new RegExp(urlReg)
  })
}

export function getUrlFromAppDirectory(
  urlPrefix: string,
  directories: string[]
) {
  return Array.from(
    new Set(
      directories
        .flatMap((directory) => parseUrlForAppDir(urlPrefix, directory))
        .map((url) => `^${normalizeAppPath(url)}$`)
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
