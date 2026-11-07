/**
 * Thrown when an app router page or route handler can't render a fallback
 * for the requested route — typically because the request's params were not
 * returned by `generateStaticParams()` and a parent segment has
 * `dynamicParams: false`.
 *
 * The framework usually catches this and turns it into a 404, so the
 * message is rarely seen by end users. When it does leak to a server log
 * the previous "Internal: NoFallbackError" wording offered no guidance
 * about what caused it; the new message names the most common cause and
 * links to the relevant docs (#87738).
 */
export class NoFallbackError extends Error {
  constructor() {
    super(
      'No fallback was rendered for this route, so the request returned a 404. ' +
        'A common cause is `dynamicParams: false` on a parent segment combined ' +
        'with a request whose params were not returned by `generateStaticParams()`. ' +
        'See https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config#dynamicparams'
    )
  }
}
