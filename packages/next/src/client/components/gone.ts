import {
  HTTP_ERROR_FALLBACK_ERROR_CODE,
  type HTTPAccessFallbackError,
} from './http-access-fallback/http-access-fallback'

/**
 * This function allows you to render the [gone.js file](https://nextjs.org/docs/app/api-reference/file-conventions/gone)
 * within a route segment as well as inject a tag.
 *
 * `gone()` can be used in
 * [Server Components](https://nextjs.org/docs/app/building-your-application/rendering/server-components),
 * [Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers), and
 * [Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations).
 *
 * - In a Server Component, this will insert a `<meta name="robots" content="noindex" />` meta tag and set the status code to 410.
 * - In a Route Handler or Server Action, it will serve a 410 to the caller.
 *
 * Read more: [Next.js Docs: `gone`](https://nextjs.org/docs/app/api-reference/functions/gone)
 */

const DIGEST = `${HTTP_ERROR_FALLBACK_ERROR_CODE};410`

export function gone(): never {
  // eslint-disable-next-line no-throw-literal
  const error = new Error(DIGEST) as HTTPAccessFallbackError
  ;(error as HTTPAccessFallbackError).digest = DIGEST

  throw error
}
