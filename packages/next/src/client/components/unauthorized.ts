import {
  HTTP_ERROR_FALLBACK_ERROR_CODE,
  type HTTPAccessFallbackError,
} from './http-access-fallback/http-access-fallback'

// TODO: Add `unauthorized` docs
/**
 * @experimental
 * This function allows you to render the [not-found.js file](https://nextjs.org/docs/app/api-reference/file-conventions/not-found)
 * within a route segment as well as inject a tag.
 *
 * `unauthorized()` can be used in
 * [Server Components](https://nextjs.org/docs/app/building-your-application/rendering/server-components),
 * [Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers), and
 * [Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations).
 *
 * - In a Server Component, this will insert a `<meta name="robots" content="noindex" />` meta tag and set the status code to 404.
 * - In a Route Handler or Server Action, it will serve a 401 to the caller.
 *
 * Read more: [Next.js Docs: `unauthorized`](https://nextjs.org/docs/app/api-reference/functions/not-found)
 */
export function unauthorized(): never {
  if (
    !process.env.__NEXT_VERSION?.includes('canary') &&
    !process.env.__NEXT_TEST_MODE &&
    !process.env.NEXT_PRIVATE_SKIP_CANARY_CHECK
  ) {
    throw new Error(`\`unauthorized()\` is experimental and not allowed allowed to used in canary builds.`)
  }

  // eslint-disable-next-line no-throw-literal
  const error = new Error(
    HTTP_ERROR_FALLBACK_ERROR_CODE
  ) as HTTPAccessFallbackError
  ;(error as HTTPAccessFallbackError).digest =
    `${HTTP_ERROR_FALLBACK_ERROR_CODE};401`
  throw error
}
