/**
 * The route that will serve a request after the proxy of the user has run. The
 * result is null when another origin will serve it.
 *
 * A rewrite selects the route that renders, and different routes read and
 * declare different variants. Therefore all code after the proxy must use the
 * rewritten destination and not the incoming path. Another origin knows nothing
 * about any of this, so an external destination is not a route of ours at all.
 *
 * This function is shared, and the result is not derived at each site. The
 * variants a request resolves and the combination they are matched against must
 * be computed for the same route, and two derivations of which route serves a
 * request could disagree.
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
 * The route a target pathname belongs to, without the base path.
 *
 * A base path belongs to the request. A route does not carry one, and neither
 * do the keys of anything the build writes about it, but a target pathname
 * does. Therefore every site that matches a target against a route removes the
 * base path first, and does so here. Two sites that disagreed would match
 * different routes for the same request.
 */
export function getTargetRoutePathname(
  targetPathname: string,
  basePath: string | undefined
): string {
  if (!basePath || basePath === '/' || !targetPathname.startsWith(basePath)) {
    return targetPathname
  }

  return targetPathname.slice(basePath.length) || '/'
}
