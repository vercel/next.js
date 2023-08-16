import { parsePath } from './parse-path'

/**
 * Adds the provided prefix to the given path. It first ensures that the path
 * is indeed starting with a slash.
 */
export function addPathPrefix(path: string, prefix?: string) {
  if (!path.startsWith('/') || !prefix) {
    return path
  }

  const { pathname, query, hash } = parsePath(path)
  return `${prefix}${pathname}${query}${hash}`
}
