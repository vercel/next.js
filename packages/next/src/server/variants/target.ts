/**
 * The route that will serve a request once the user's proxy has had its say, or
 * null when another origin will.
 *
 * A rewrite decides which route renders, and routes read and declare different
 * variants, so everything downstream of the proxy has to reason about the
 * rewritten destination rather than the incoming path. An external destination
 * is served by an origin that knows nothing about any of this, so it is not a
 * route of ours at all.
 *
 * Shared rather than derived at each site: the variants a request resolves and
 * the combination they are matched against must be computed for the same route,
 * and two derivations of "which route serves this" could disagree.
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
