import * as path from 'path'
import * as fs from 'fs'
import { createRequire } from 'module'

type PageExtensionMatchers = {
  extRegex: RegExp
  indexSourceRegex: RegExp
  pageSourceRegex: RegExp
  layoutSourceRegex: RegExp
}

const fsReadDirSyncCache: Record<string, fs.Dirent[]> = {}

function getReadDirCacheKey(
  directory: string,
  pageExtensions: readonly string[]
): string {
  return `${directory}\u0000${pageExtensions.join('\u0000')}`
}

function buildPageExtensionMatchers(
  pageExtensions: readonly string[]
): PageExtensionMatchers {
  const ordered = [...pageExtensions].sort((a, b) => b.length - a.length)
  const escaped = ordered.map((ext) =>
    ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  )
  const alt = escaped.join('|')
  return {
    extRegex: new RegExp(`\\.(${alt})$`),
    indexSourceRegex: new RegExp(`^index\\.(${alt})$`),
    pageSourceRegex: new RegExp(`^page\\.(${alt})$`),
    layoutSourceRegex: new RegExp(`^layout\\.(${alt})$`),
  }
}

/**
 * Recursively parse directory for page URLs.
 */
function parseUrlForPages(
  urlprefix: string,
  directory: string,
  pageExtensions: readonly string[],
  matchers: PageExtensionMatchers
) {
  const cacheKey = getReadDirCacheKey(directory, pageExtensions)
  fsReadDirSyncCache[cacheKey] ??= fs.readdirSync(directory, {
    withFileTypes: true,
  })
  const res = []
  fsReadDirSyncCache[cacheKey].forEach((dirent) => {
    if (matchers.extRegex.test(dirent.name)) {
      if (matchers.indexSourceRegex.test(dirent.name)) {
        res.push(
          `${urlprefix}${dirent.name.replace(matchers.indexSourceRegex, '')}`
        )
      }
      res.push(`${urlprefix}${dirent.name.replace(matchers.extRegex, '')}`)
    } else {
      if (dirent.isDirectory() && !dirent.isSymbolicLink()) {
        const dirPath = path.join(directory, dirent.name)
        res.push(
          ...parseUrlForPages(
            urlprefix + dirent.name + '/',
            dirPath,
            pageExtensions,
            matchers
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
  pageExtensions: readonly string[],
  matchers: PageExtensionMatchers
) {
  const cacheKey = getReadDirCacheKey(`${directory}\u0001app`, pageExtensions)
  fsReadDirSyncCache[cacheKey] ??= fs.readdirSync(directory, {
    withFileTypes: true,
  })
  const res = []
  fsReadDirSyncCache[cacheKey].forEach((dirent) => {
    if (matchers.extRegex.test(dirent.name)) {
      if (matchers.pageSourceRegex.test(dirent.name)) {
        res.push(
          `${urlprefix}${dirent.name.replace(matchers.pageSourceRegex, '')}`
        )
      } else if (!matchers.layoutSourceRegex.test(dirent.name)) {
        res.push(`${urlprefix}${dirent.name.replace(matchers.extRegex, '')}`)
      }
    } else {
      const dirPath = path.join(directory, dirent.name)
      if (dirent.isDirectory() && !dirent.isSymbolicLink()) {
        res.push(
          ...parseUrlForPages(
            urlprefix + dirent.name + '/',
            dirPath,
            pageExtensions,
            matchers
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
  pageExtensions: readonly string[]
) {
  const matchers = buildPageExtensionMatchers(pageExtensions)
  return Array.from(
    // De-duplicate similar pages across multiple directories.
    new Set(
      directories
        .flatMap((directory) =>
          parseUrlForPages(urlPrefix, directory, pageExtensions, matchers)
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
  pageExtensions: readonly string[]
) {
  const matchers = buildPageExtensionMatchers(pageExtensions)
  return Array.from(
    // De-duplicate similar pages across multiple directories.
    new Set(
      directories
        .map((directory) =>
          parseUrlForAppDir(urlPrefix, directory, pageExtensions, matchers)
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

/**
 * Default matches `defaultConfig.pageExtensions` in Next.js config-shared.
 */
export const DEFAULT_PAGE_EXTENSIONS = ['tsx', 'ts', 'jsx', 'js'] as const

const CONFIG_FILES = [
  'next.config.js',
  'next.config.mjs',
  'next.config.ts',
  'next.config.mts',
] as const

const pageExtensionsByRoots = new Map<string, readonly string[]>()

function normalizePageExtensions(exts: string[]): string[] {
  return exts.map((e) => (e.startsWith('.') ? e.slice(1) : e))
}

function tryParsePageExtensionsFromSource(source: string): string[] | null {
  const match = source.match(/pageExtensions\s*:\s*\[([\s\S]*?)\]/)
  if (!match) {
    return null
  }
  const inner = match[1]
  const out: string[] = []
  const re = /['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(inner)) !== null) {
    const ext = m[1]
    out.push(ext.startsWith('.') ? ext.slice(1) : ext)
  }
  return out.length ? out : null
}

function tryLoadPageExtensionsFromCjsConfig(
  configPath: string
): string[] | null {
  if (!configPath.endsWith('.js') && !configPath.endsWith('.cjs')) {
    return null
  }
  try {
    const req = createRequire(__filename)
    const resolved = req.resolve(configPath)
    delete req.cache[resolved]
    const mod = req(configPath) as {
      default?: { pageExtensions?: string[] }
      pageExtensions?: string[]
    }
    const config = mod.default ?? mod
    if (Array.isArray(config?.pageExtensions)) {
      return normalizePageExtensions(config.pageExtensions)
    }
  } catch {
    // User config may be ESM-only or otherwise unloadable; ignore.
  }
  return null
}

function tryReadPageExtensionsFromDisk(rootDir: string): string[] | null {
  for (const file of CONFIG_FILES) {
    const configPath = path.join(rootDir, file)
    if (!fs.existsSync(configPath) || !fs.statSync(configPath).isFile()) {
      continue
    }
    const source = fs.readFileSync(configPath, 'utf8')
    const fromRegex = tryParsePageExtensionsFromSource(source)
    if (fromRegex) {
      return fromRegex
    }
    const fromRequire = tryLoadPageExtensionsFromCjsConfig(configPath)
    if (fromRequire) {
      return fromRequire
    }
  }
  return null
}

/**
 * Resolves `pageExtensions` for URL discovery: ESLint `settings.next.pageExtensions`,
 * then the first readable `next.config.*` under a project root, otherwise Next defaults.
 */
export function getPageExtensions(
  rootDirs: string[],
  settingExtensions?: string[]
): readonly string[] {
  if (Array.isArray(settingExtensions) && settingExtensions.length > 0) {
    return normalizePageExtensions(settingExtensions)
  }

  const cacheKey = rootDirs.join('\0')
  const cached = pageExtensionsByRoots.get(cacheKey)
  if (cached) {
    return cached
  }

  for (const root of rootDirs) {
    const fromDisk = tryReadPageExtensionsFromDisk(root)
    if (fromDisk) {
      const asTuple = Object.freeze(fromDisk.slice())
      pageExtensionsByRoots.set(cacheKey, asTuple)
      return asTuple
    }
  }

  const defaults = Object.freeze([...DEFAULT_PAGE_EXTENSIONS])
  pageExtensionsByRoots.set(cacheKey, defaults)
  return defaults
}
