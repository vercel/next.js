import { pathHasPrefix } from './path-has-prefix'

/**
 * Given a path and a prefix it will remove the prefix when it exists in the
 * given path. It ensures it matches exactly without containing extra chars
 * and if the prefix is not there it will be noop.
 *
 * @param path The path to remove the prefix from.
 * @param prefix The prefix to be removed.
 */
export function removePathPrefix(path: string, prefix: string): string {
  // If the path doesn't start with the prefix we can return it as is. This
  // protects us from situations where the prefix is a substring of the path
  // prefix such as:
  //
  // For prefix: /blog
  //
  //   /blog -> true
  //   /blog/ -> true
  //   /blog/1 -> true
  //   /blogging -> false
  //   /blogging/ -> false
  //   /blogging/1 -> false
  if (!pathHasPrefix(path, prefix)) {
    return path
  }

  // Remove the prefix from the path via slicing.
  const withoutPrefix = path.slice(prefix.length)

  // If the path without the prefix starts with a `/` we can return it as is.
  if (withoutPrefix.startsWith('/')) {
    return withoutPrefix
  }

  // If the path without the prefix doesn't start with a `/` we need to add it
  // back to the path to make sure it's a valid path.
  return `/${withoutPrefix}`
}
