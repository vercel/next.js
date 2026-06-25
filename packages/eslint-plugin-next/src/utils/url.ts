import * as path from 'path'
import * as fs from 'fs'

// Cache for fs.readdirSync lookup.
// Prevent multiple blocking IO requests that have already been calculated.
const fsReadDirSyncCache = {}

/**
 * Build regex for matching page extensions.
 * Defaults to ['js', 'jsx', 'ts', 'tsx'] if not provided.
 */
function buildPageExtensionRegex(pageExtensions?: string[]): RegExp {
  const defaultExts = ['js', 'jsx', 'ts', 'tsx']
  const exts = pageExtensions && pageExtensions.length ? pageExtensions : defaultExts
  const escapedExts = exts.map((ext) => ext.replace(/\./g, '\\.')).join('|')
  return new RegExp(`\\.(${escapedExts})$`)
}

/**
 * Recursively parse directory for page URLs.
 */
function parseUrlForPages(urlprefix: string, directory: string, pageExtensions?: string[]) {
  fsReadDirSyncCache[directory] ??= fs.readdirSync(directory, {
    withFileTypes: true,
  })
  const res = []
  const pageExtensionRegex = buildPageExtensionRegex(pageExtensions)
  fsReadDirSyncCache[directory].forEach((dirent) => {
    if (pageExtensionRegex.test(dirent.name)) {
      const indexMatch = dirent.name.match(/^index(\..+?)$/)
      const replaceMatch = dirent.name.match(/(\..+?)$/)
      if (indexMatch) {
        res.push(`${urlprefix}${dirent.name.replace(indexMatch[0], '')}`)
      }
      if (replaceMatch) {
        res.push(`${urlprefix}${dirent.name.replace(replaceMatch[1], '')}`)
      }
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
function parseUrlForAppDir(urlprefix: string, directory: string, pageExtensions?: string[]) {
  fsReadDirSyncCache[directory] ??= fs.readdirSync(directory, {
    withFileTypes: true,
  })
  const res = []
  const pageExtensionRegex = buildPageExtensionRegex(pageExtensions)
  fsReadDirSyncCache[directory].forEach((dirent) => {
    if (pageExtensionRegex.test(dirent.name)) {
      const pageMatch = dirent.name.match(/^page(\..+?)$/)
      const layoutMatch = dirent.name.match(/^layout(\..+?)$/)
      const replaceMatch = dirent.name.match(/(\..+?)$/)
      
      if (pageMatch) {
        res.push(`${urlprefix}${dirent.name.replace(pageMatch[0], '')}`)
      } else if (!layoutMatch && replaceMatch) {
        res.push(`${urlprefix}${dirent.name.replace(replaceMatch[1], '')}`)
      }
    } else {
      const dirPath = path.join(directory, dirent.name)
      if (dirent.isDirectory() && !dirent.isSymbolicLink()) {
        res.push(...parseUrlForAppDir(urlprefix + dirent.name + '/', dirPath, pageExtensions))
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
  if (url.includes('?')) {
    url = url.split('?')[0]
  }

  const urlWithoutExtension = url.replace(/\.html$/, '')
  // Encode all characters except `/` and `.`
  const encoded = urlWithoutExtension
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
    .replace(/%2E/g, '.')

  const withoutTrailingSlash =
    encoded === '/' ? '/' : encoded.replace(/\/$/, '')
  return withoutTrailingSlash
}

export function normalizeAppPath(path: string) {
  const withoutTrailingSlash = path.replace(/\/$/, '')
  return withoutTrailingSlash === '' ? '/' : withoutTrailingSlash
}

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

function removeGroupSegments(segment: string): string {
  return segment.replace(/\([^)]*\)\//g, '').replace(/^!\(/, '(')
}

export function getUrlsForFile(
  file: string
): Array<{
  file: string
  urls: string[]
}> | null {
  // Handle both `pages` and `app` files
  const pagesMatch = file.match(/[\\/]pages[\\/](.*?)$/)
  if (pagesMatch) {
    const path = pagesMatch[1].replace(/\\/g, '/').replace(/\.[^.]+$/, '')
    return [{ file, urls: [ensureLeadingSlash(path)] }]
  }

  const appMatch = file.match(/[\\/]app[\\/](.*?)(?:[\\/])?(?:page|layout)\.[^.]+$/)
  if (appMatch) {
    let path = appMatch[1]
      .replace(/\\/g, '/')
      .split('/')
      .filter((segment) => !isGroupSegment(segment))
      .map(removeGroupSegments)
      .join('/')

    path = path.replace(/\/$/, '')
    return [{ file, urls: [ensureLeadingSlash(path)] }]
  }

  return null
}

export const fsExistsCacheGet = (cache: {}, key: string) => {
  return cache[key]
}

export const fsExistsCacheSet = (
  cache: {},
  key: string,
  value: boolean
) => {
  cache[key] = value
}
