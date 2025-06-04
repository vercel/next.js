import {
  HTTP_ERROR_FALLBACK_ERROR_CODE,
  type HTTPAccessFallbackError,
} from './http-access-fallback/http-access-fallback'

// TODO: Add `unauthorized` docs
/**
 * @experimental
 * This function allows you to render the [unauthorized.js file](https://nextjs.org/docs/app/api-reference/file-conventions/unauthorized)
 * within a route segment as well as inject a tag.
 *
 * `unauthorized()` can be used in
 * [Server Components](https://nextjs.org/docs/app/building-your-application/rendering/server-components),
 * [Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers), and
 * [Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations).
 *
 *
 * Read more: [Next.js Docs: `unauthorized`](https://nextjs.org/docs/app/api-reference/functions/unauthorized)
 */

const DIGEST = `${HTTP_ERROR_FALLBACK_ERROR_CODE};401`

export function unauthorized(): never {
  if (!process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS) {
    throw new Error(
      `\`unauthorized()\` is experimental and only allowed to be used when \`experimental.authInterrupts\` is enabled.`
    )
  }

  // eslint-disable-next-line no-throw-literal
  const error = new Error(DIGEST) as HTTPAccessFallbackError
  ;(error as HTTPAccessFallbackError).digest = DIGEST
  throw error
}
