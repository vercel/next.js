import { parsePath } from './parse-path'

/**
 * Checks if a given path starts with a given prefix. It ensures it matches
 * exactly without containing extra chars. e.g. prefix /docs should replace
 * for /docs, /docs/, /docs/a but not /docsss
 * @param path The path to check.
 * @param prefix The prefix to check against.
 */
export function pathHasPrefix(path: string, prefix: string) {
  if (typeof path !== 'string') {
    return false
  }

  const { pathname } = parsePath(path)
  return pathname === prefix || pathname.startsWith(prefix + '/')
}
