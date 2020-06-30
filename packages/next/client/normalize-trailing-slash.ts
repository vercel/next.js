import { UrlObject } from 'url'

export function removePathTrailingSlash(path: string): string {
  return path.endsWith('/') && path !== '/' ? path.slice(0, -1) : path
}

const normalizePathTrailingSlash = process.env.__NEXT_TRAILING_SLASH
  ? (path: string): string => {
      if (/\.[^/]+\/?$/.test(path)) {
        return removePathTrailingSlash(path)
      } else if (path.endsWith('/')) {
        return path
      } else {
        return path + '/'
      }
    }
  : removePathTrailingSlash

export function normalizeTrailingSlash(url: UrlObject): UrlObject {
  const normalizedPath =
    url.pathname && normalizePathTrailingSlash(url.pathname)
  return url.pathname === normalizedPath
    ? url
    : Object.assign({}, url, { pathname: normalizedPath })
}
