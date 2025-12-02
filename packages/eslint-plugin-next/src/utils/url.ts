import * as path from 'path'
import * as fs from 'fs'

// Cache for fs.readdirSync lookup.
// Prevent multiple blocking IO requests that have already been calculated.
const fsReadDirSyncCache = {}

/**
 * Recursively parse directory for page URLs.
 */
function parseUrlForPages(urlprefix: string, directory: string) {
  fsReadDirSyncCache[directory] ??= fs.readdirSync(directory, {
    withFileTypes: true,
  })
  const res = []
  const { ext, index } = getRegexPatterns()

  fsReadDirSyncCache[directory].forEach((dirent) => {
    if (ext.test(dirent.name)) {
      if (index.test(dirent.name)) {
        res.push(`${urlprefix}${dirent.name.replace(index, '')}`)
      } else {
        res.push(`${urlprefix}${dirent.name.replace(ext, '')}`)
      }
    } else {
      const dirPath = path.join(directory, dirent.name)
      if (dirent.isDirectory() && !dirent.isSymbolicLink()) {
        res.push(...parseUrlForPages(`${urlprefix}${dirent.name}/`, dirPath))
      }
    }
  })
  return res
}

/**
 * Recursively parse app directory for URLs.
 */
function parseUrlForAppDir(urlprefix: string, directory: string) {
  fsReadDirSyncCache[directory] ??= fs.readdirSync(directory, {
    withFileTypes: true,
  })
  const res = []
  const { ext, page, layout } = getRegexPatterns()

  fsReadDirSyncCache[directory].forEach((dirent) => {
    if (ext.test(dirent.name)) {
      if (page.test(dirent.name)) {
        res.push(`${urlprefix}${dirent.name.replace(page, '')}`)
      } else if (!layout.test(dirent.name)) {
        res.push(`${urlprefix}${dirent.name.replace(ext, '')}`)
      }
    } else {
      const dirPath = path.join(directory, dirent.name)
      if (dirent.isDirectory() && !dirent.isSymbolicLink()) {
        res.push(...parseUrlForAppDir(`${urlprefix}${dirent.name}/`, dirPath))
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
  directories: string[]
) {
  return Array.from(
    // De-duplicate similar pages across multiple directories.
    new Set(
      directories
        .flatMap((directory) => parseUrlForPages(urlPrefix, directory))
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
  directories: string[]
) {
  return Array.from(
    // De-duplicate similar pages across multiple directories.
    new Set(
      directories
        .map((directory) => parseUrlForAppDir(urlPrefix, directory))
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

/**
 * Get page extensions from next.config.js/mjs/ts
 * Falls back to default extensions if config is not found or invalid
 */
const getPageExtensions = (() => {
  const cache = new Map<string, string[]>()

  const fn = (cwd: string = process.cwd()): string[] => {
    if (cache.has(cwd)) return cache.get(cwd)!

    const fallback = ['tsx', 'ts', 'jsx', 'js']
    const configFiles = ['next.config.js', 'next.config.mjs', 'next.config.ts']

    for (const configFile of configFiles) {
      try {
        const configPath = path.resolve(cwd, configFile)

        // Check if file exists before requiring
        if (!fs.existsSync(configPath)) {
          continue
        }

        // For .ts files, try to use tsx or ts-node if available
        if (configFile.endsWith('.ts')) {
          try {
            // Try tsx first (faster)
            (require('tsx/cjs') as typeof import('tsx/cjs'))
          } catch {
            try {
              // Fallback to ts-node
              (require('ts-node/register') as typeof import('ts-node/register'))
            } catch {
              // Skip .ts file if no TypeScript loader available
              continue
            }
          }
        }

        const userConfig = require(configPath)
        const config = userConfig.default || userConfig

        if (
          config &&
          Array.isArray(config.pageExtensions) &&
          config.pageExtensions.length > 0
        ) {
          const result = config.pageExtensions.map((ext: string) =>
            ext.replace(/^\./, '')
          )
          cache.set(cwd, result)
          return result
        }
      } catch (error) {
        // Silently continue to next config file
        continue
      }
    }

    // No valid config found, use defaults
    cache.set(cwd, fallback)
    return fallback
  }

  // Exposed reset function for testing purposes
  fn.reset = () => {
    cache.clear()
  }

  return fn
})()

/**
 * Get regex patterns for matching page files based on configured extensions
 */
const getRegexPatterns = (() => {
  const cache = new Map<string, {
    ext: RegExp
    index: RegExp
    page: RegExp
    layout: RegExp
  }>()

  const fn = (cwd: string = process.cwd()) => {
    if (cache.has(cwd)) return cache.get(cwd)!

    const extensions = getPageExtensions(cwd)
    const escaped = extensions.map((ext) =>
      ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    )
    const group = escaped.join('|')

    const result = {
      ext: new RegExp(`\\.(${group})$`),
      index: new RegExp(`^index\\.(${group})$`),
      page: new RegExp(`^page\\.(${group})$`),
      layout: new RegExp(`^layout\\.(${group})$`),
    }

    cache.set(cwd, result)
    return result
  }

  // Exposed reset function for testing purposes
  fn.reset = () => {
    cache.clear()
  }

  return fn
})()

/**
 * Reset all caches - useful for testing
 */
function resetCaches() {
  getPageExtensions.reset()
  getRegexPatterns.reset()
  // Clear fsReadDirSyncCache
  Object.keys(fsReadDirSyncCache).forEach((key) => {
    delete fsReadDirSyncCache[key]
  })
}

export { getPageExtensions, getRegexPatterns, resetCaches }
