import { pathHasPrefix } from './path-has-prefix'

/**
 * Given a path and a prefix it will remove the prefix when it exists in the
 * given path. It ensures it matches exactly without containing extra chars
 * and if the prefix is not there it will be noop.
 * @param path The path to remove the prefix from.
 * @param prefix The prefix to be removed.
 */
export function removePathPrefix(path: string, prefix: string): string {
  if (pathHasPrefix(path, prefix)) {
    const withoutPrefix = path.slice(prefix.length)
    return withoutPrefix.startsWith('/') ? withoutPrefix : `/${withoutPrefix}`
  }
  return path
}
