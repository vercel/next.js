import {
  HTTP_ERROR_FALLBACK_ERROR_CODE,
  type HTTPAccessFallbackError,
  createGlobalNotFoundError,
} from './http-access-fallback/http-access-fallback'
import { getGlobalNotFoundPath, isAppHydrated } from './global-not-found-state'

/**
 * This function allows you to render the [not-found.js file](https://nextjs.org/docs/app/api-reference/file-conventions/not-found)
 * within a route segment as well as inject a tag.
 *
 * `notFound()` can be used in
 * [Server Components](https://nextjs.org/docs/app/building-your-application/rendering/server-components),
 * [Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers), and
 * [Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations).
 *
 * - In a Server Component, this will insert a `<meta name="robots" content="noindex" />` meta tag and set the status code to 404.
 * - In a Route Handler or Server Action, it will serve a 404 to the caller.
 *
 * Read more: [Next.js Docs: `notFound`](https://nextjs.org/docs/app/api-reference/functions/not-found)
 */

const DIGEST = `${HTTP_ERROR_FALLBACK_ERROR_CODE};404`

export function notFound(): never {
  // On the client, if global-not-found is enabled AND the app has finished hydration,
  // throw a special error type that HTTPAccessFallbackBoundary won't catch
  // (because isHTTPAccessFallbackError returns false for it), but
  // GlobalNotFoundBoundary will handle.
  //
  // The isAppHydrated() check ensures that notFound() calls during initial render
  // (SSR/hydration) behave normally (render default not-found within layout),
  // while user-triggered notFound() calls after hydration trigger the global-not-found.
  if (typeof window !== 'undefined' && isAppHydrated()) {
    const globalNotFoundPath = getGlobalNotFoundPath()
    if (globalNotFoundPath) {
      throw createGlobalNotFoundError(globalNotFoundPath)
    }
  }

  const error = new Error(DIGEST) as HTTPAccessFallbackError
  ;(error as HTTPAccessFallbackError).digest = DIGEST

  throw error
}
