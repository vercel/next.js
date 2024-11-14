import {
  HTTP_ERROR_FALLBACK_ERROR_CODE,
  type HTTPAccessFallbackError,
} from './http-access-fallback/http-access-fallback'

// TODO: Add `forbidden` docs
/**
 * @experimental
 * This function allows you to render the [not-found.js file](https://nextjs.org/docs/app/api-reference/file-conventions/not-found)
 * within a route segment as well as inject a tag.
 *
 * `forbidden()` can be used in
 * [Server Components](https://nextjs.org/docs/app/building-your-application/rendering/server-components),
 * [Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers), and
 * [Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations).
 *
 * - In a Server Component, this will insert a `<meta name="robots" content="noindex" />` meta tag and set the status code to 404.
 * - In a Route Handler or Server Action, it will serve a 403 to the caller.
 *
 * Read more: [Next.js Docs: `forbidden`](https://nextjs.org/docs/app/api-reference/functions/not-found)
 */
export function forbidden(): never {
  if (!process.env.__NEXT_EXPERIMENTAL_NAVIGATION_API) {
    throw new Error(
      `\`forbidden()\` is experimental and only allowed to be enabled when \`experimental.navigationDeniedApi\` is enabled.`
    )
  }

  // eslint-disable-next-line no-throw-literal
  const error = new Error(
    HTTP_ERROR_FALLBACK_ERROR_CODE
  ) as HTTPAccessFallbackError
  ;(error as HTTPAccessFallbackError).digest =
    `${HTTP_ERROR_FALLBACK_ERROR_CODE};403`
  throw error
}
