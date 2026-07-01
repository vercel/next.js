import * as path from 'path'
import * as fs from 'fs'

// Cache for fs.readdirSync lookup.
// Prevent multiple blocking IO requests that have already been calculated.
const fsReadDirSyncCache = {}

const DEFAULT_PAGE_EXTENSIONS = ['js', 'jsx', 'ts', 'tsx']

function getExtensionRegex(extensions: string[]) {
  const escaped = extensions.map((ext) =>
    ext.startsWith('.') ? ext.replace(/\./g, '\\.') : `\\.${ext}`
  )
  return escaped.join('|')
}

function parseUrlForPages(
  urlprefix: string,
  directory: string,
  pageExtensions: string[] = DEFAULT_PAGE_EXTENSIONS
) {
  fsReadDirSyncCache[directory] ??= fs.readdirSync(directory, {
    withFileTypes: true,
  })
  const extRegexStr = getExtensionRegex(pageExtensions)
  const extRegex = new RegExp(`(${extRegexStr})$`)
  const indexRegex = new RegExp(`^index(${extRegexStr})$`)
  const res = []
  fsReadDirSyncCache[directory].forEach((dirent) => {
    if (extRegex.test(dirent.name)) {
      if (indexRegex.test(dirent.name)) {
        res.push(`${urlprefix}${dirent.name.replace(indexRegex, '')}`)
      }
      res.push(`${urlprefix}${dirent.name.replace(extRegex, '')}`)
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

function parseUrlForAppDir(
  urlprefix: string,
  directory: string,
  pageExtensions: string[] = DEFAULT_PAGE_EXTENSIONS
) {
  fsReadDirSyncCache[directory] ??= fs.readdirSync(directory, {
    withFileTypes: true,
  })
  const extRegexStr = getExtensionRegex(pageExtensions)
  const extRegex = new RegExp(`(${extRegexStr})$`)
  const pageRegex = new RegExp(`^page(${extRegexStr})$`)
  const layoutRegex = new RegExp(`^layout(${extRegexStr})$`)
  const res = []
  fsReadDirSyncCache[directory].forEach((dirent) => {
    if (extRegex.test(dirent.name)) {
      if (pageRegex.test(dirent.name)) {
        res.push(`${urlprefix}${dirent.name.replace(pageRegex, '')}`)
      } else if (!layoutRegex.test(dirent.name)) {
        res.push(`${urlprefix}${dirent.name.replace(extRegex, '')}`)
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

export function normalizeURL(url: string) {
  if (!url) {
    return
  }
  url = url.split('?', 1)[0]
  url = url.split('#', 1)[0]
  url = url = url.replace(/(\/index\.html)$/, '/')
  if (url === '') {
    return url
  }
  url = url.endsWith('/') ? url : url + '/'
  return url
}

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

export function getUrlFromPagesDirectories(
  urlPrefix: string,
  directories: string[],
  pageExtensions?: string[]
) {
  return Array.from(
    new Set(
      directories
        .flatMap((directory) =>
          parseUrlForPages(urlPrefix, directory, pageExtensions)
        )
        .map(
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
    new Set(
      directories
        .map((directory) =>
          parseUrlForAppDir(urlPrefix, directory, pageExtensions)
        )
        .flat()
        .map(
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
