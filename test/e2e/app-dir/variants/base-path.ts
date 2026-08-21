/**
 * Set by the `-base-path` wrappers, each of which assigns it and then requires
 * a suite. Empty for a plain run.
 */
export const basePath = process.env.BASE_PATH ?? ''

/**
 * A path as a client asks for it.
 *
 * A base path belongs to the request, not to the route. The build writes an
 * artifact under the route's own path, and the manifests key it that way.
 * Therefore only paths that go out over the wire get the prefix, and they go
 * through here. Assertions about build output do not.
 */
export function url(pathname: string): string {
  if (!basePath) {
    return pathname
  }

  // The root of an app under a base path is the base path itself, with no
  // trailing slash, which is also what a browser reports for it.
  return pathname === '/' ? basePath : `${basePath}${pathname}`
}
