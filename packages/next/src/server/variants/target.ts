/**
 * The route that serves a request after the proxy of the user has run.
 *
 * The result is the rewrite target when the proxy rewrote the request, and the
 * incoming URL otherwise. It is null when the target names another origin.
 */
export function getProxyTarget(
  requestURL: URL,
  response: Response
): URL | null {
  const target = new URL(
    response.headers.get('x-middleware-rewrite') ?? requestURL.toString()
  )

  return target.origin === requestURL.origin ? target : null
}

/**
 * The route that a target pathname belongs to, without the base path.
 *
 * A base path belongs to a request. A route does not hold one, and neither do
 * the keys of what the build writes about that route.
 */
export function getTargetRoutePathname(
  targetPathname: string,
  basePath: string | undefined
): string {
  if (
    !basePath ||
    basePath === '/' ||
    (targetPathname !== basePath && !targetPathname.startsWith(`${basePath}/`))
  ) {
    return targetPathname
  }

  return targetPathname.slice(basePath.length) || '/'
}
