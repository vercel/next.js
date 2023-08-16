import { parsePath } from './parse-path'

/**
 * Similarly to `addPathPrefix`, this function adds a suffix at the end on the
 * provided path. It also works only for paths ensuring the argument starts
 * with a slash.
 */
export function addPathSuffix(path: string, suffix?: string) {
  if (!path.startsWith('/') || !suffix) {
    return path
  }

  const { pathname, query, hash } = parsePath(path)
  return `${pathname}${suffix}${query}${hash}`
}
