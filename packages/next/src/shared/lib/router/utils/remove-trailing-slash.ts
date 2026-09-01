/**
 * Removes the trailing slash for a given route or page path. Examples:
 *   - `/foo/bar/` -> `/foo/bar`
 *   - `/foo/bar` -> `/foo/bar`
 *
 * Uses charCodeAt (47 === '/') instead of regex to avoid the overhead of
 * compiling and executing a RegExp on every call (~3-5x faster).
 */
export function removeTrailingSlash(route: string) {
  return route.charCodeAt(route.length - 1) === 47 && route.length > 1
    ? route.slice(0, -1)
    : route
}
