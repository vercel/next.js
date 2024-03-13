const FORBIDDEN_ERROR_CODE = 'NEXT_FORBIDDEN'

type ForbiddenError = Error & { digest: typeof FORBIDDEN_ERROR_CODE }

// TODO(@panteliselef): Update docs
/**
 * This function allows you to render the [forbidden.js file]
 * within a route segment as well as inject a tag.
 *
 * `forbidden()` can be used in
 * [Server Components](https://nextjs.org/docs/app/building-your-application/rendering/server-components),
 * [Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers), and
 * [Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations).
 *
 * - In a Server Component, this will insert a `<meta name="robots" content="noindex" />` meta tag and set the status code to 403.
 * - In a Route Handler or Server Action, it will serve a 403 to the caller.
 *
 * // TODO(@panteliselef): Update docs
 * Read more: [Next.js Docs: `forbidden`](https://nextjs.org/docs/app/api-reference/functions/not-found)
 */
export function forbidden(): never {
  // eslint-disable-next-line no-throw-literal
  const error = new Error(FORBIDDEN_ERROR_CODE)
  ;(error as ForbiddenError).digest = FORBIDDEN_ERROR_CODE
  throw error
}

// TODO(@panteliselef): Update docs
/**
 * Checks an error to determine if it's an error generated by the `forbidden()`
 * helper.
 *
 * @param error the error that may reference a forbidden error
 * @returns true if the error is a forbidden error
 */
export function isForbiddenError(error: unknown): error is ForbiddenError {
  if (typeof error !== 'object' || error === null || !('digest' in error)) {
    return false
  }

  return error.digest === FORBIDDEN_ERROR_CODE
}
