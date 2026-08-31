/**
 * Centralized error factories for cached function and revalidation misuse.
 * State the scope and constraint, explain non-obvious boundaries, give the
 * immediate fix, then link to the relevant docs.
 */

const NEXT_REQUEST_IN_USE_CACHE =
  'https://nextjs.org/docs/messages/next-request-in-use-cache'

const UNSTABLE_CACHE_API_DOCS =
  'https://nextjs.org/docs/app/api-reference/functions/unstable_cache'

const USE_CACHE_PRIVATE_API_DOCS =
  'https://nextjs.org/docs/app/api-reference/directives/use-cache-private'

const CACHE_TAG_OUTSIDE_USE_CACHE =
  'https://nextjs.org/docs/messages/cache-tag-outside-use-cache'

const CACHE_LIFE_OUTSIDE_USE_CACHE =
  'https://nextjs.org/docs/messages/cache-life-outside-use-cache'

const USE_CACHE_PRIVATE_COMPOSITION =
  'https://nextjs.org/docs/messages/use-cache-private-composition'

const REVALIDATE_IN_USE_CACHE =
  'https://nextjs.org/docs/messages/revalidate-in-use-cache'

// Request data accessed in caches

export function createCookiesInUseCacheError(route: string): Error {
  return new Error(
    `Route "${route}": \`cookies()\` can't be read inside \`"use cache"\`. Read it outside the cached function and pass what you need as an argument.\nLearn more: ${NEXT_REQUEST_IN_USE_CACHE}`
  )
}

export function createCookiesInUnstableCacheError(route: string): Error {
  return new Error(
    `Route "${route}": \`cookies()\` can't be read inside \`unstable_cache()\`. Read it outside the cached function and pass what you need as an argument.\nLearn more: ${UNSTABLE_CACHE_API_DOCS}`
  )
}

export function createHeadersInUseCacheError(route: string): Error {
  return new Error(
    `Route "${route}": \`headers()\` can't be read inside \`"use cache"\`. Read it outside the cached function and pass what you need as an argument.\nLearn more: ${NEXT_REQUEST_IN_USE_CACHE}`
  )
}

export function createHeadersInUnstableCacheError(route: string): Error {
  return new Error(
    `Route "${route}": \`headers()\` can't be read inside \`unstable_cache()\`. Read it outside the cached function and pass what you need as an argument.\nLearn more: ${UNSTABLE_CACHE_API_DOCS}`
  )
}

export function createSearchParamsInUseCacheError(route: string): Error {
  return new Error(
    `Route "${route}": \`searchParams\` can't be read inside \`"use cache"\`. Await it outside the cached function and pass what you need as an argument.\nLearn more: ${NEXT_REQUEST_IN_USE_CACHE}`
  )
}

export function createConnectionInPublicUseCacheError(route: string): Error {
  return new Error(
    `Route "${route}": \`connection()\` can't be called inside \`"use cache"\` because cached functions may run during prerendering, without an incoming request. Call it outside the cached function.\nLearn more: ${NEXT_REQUEST_IN_USE_CACHE}`
  )
}

export function createConnectionInPrivateUseCacheError(route: string): Error {
  return new Error(
    `Route "${route}": \`connection()\` can't be called inside \`"use cache: private"\` because private cached functions may run during prefetching, without a navigation request. Call it outside the cached function.\nLearn more: ${USE_CACHE_PRIVATE_API_DOCS}`
  )
}

export function createConnectionInUnstableCacheError(route: string): Error {
  return new Error(
    `Route "${route}": \`connection()\` can't be called inside \`unstable_cache()\` because cached functions may run during prerendering, without an incoming request. Call it outside the cached function.\nLearn more: ${UNSTABLE_CACHE_API_DOCS}`
  )
}

export function createRouteHandlerRequestInUseCacheError(
  route: string,
  expression: string
): Error {
  return new Error(
    `Route "${route}": \`${expression}\` can't be read inside \`"use cache"\`. Read it outside the cached function and pass what you need as an argument.\nLearn more: ${NEXT_REQUEST_IN_USE_CACHE}`
  )
}

export function createRouteHandlerRequestInUnstableCacheError(
  route: string,
  expression: string
): Error {
  return new Error(
    `Route "${route}": \`${expression}\` can't be read inside \`unstable_cache()\`. Read it outside the cached function and pass what you need as an argument.\nLearn more: ${UNSTABLE_CACHE_API_DOCS}`
  )
}

// Mutations inside caches and render

/**
 * Used when `draftMode().enable()` or `.disable()` is called inside
 * `"use cache"` or `"use cache: private"`. Reading `draftMode()` is fine
 * inside a cached function, but toggling it is not.
 */
export function createDraftModeMutationInUseCacheError(
  route: string,
  expression: string
): Error {
  return new Error(
    `Route "${route}": \`${expression}\` can't be called inside \`"use cache"\`. Draft mode can be read inside a cached function, but enabling or disabling it must happen outside.\nLearn more: ${NEXT_REQUEST_IN_USE_CACHE}`
  )
}

export function createDraftModeMutationInUnstableCacheError(
  route: string,
  expression: string
): Error {
  return new Error(
    `Route "${route}": \`${expression}\` can't be called inside \`unstable_cache()\`. Draft mode can be read inside a cached function, but enabling or disabling it must happen outside.\nLearn more: ${UNSTABLE_CACHE_API_DOCS}`
  )
}

export function createRevalidateDuringRenderError(
  route: string,
  expression: string
): Error {
  return new Error(
    `Route "${route}": \`${expression}\` can't be called during render, inside a cached function, or inside \`generateStaticParams\`. Call it from a Server Action or Route Handler instead.\nLearn more: ${REVALIDATE_IN_USE_CACHE}`
  )
}

// Cache configuration and nesting

export function createCacheTagOutsideUseCacheError(): Error {
  return new Error(
    `\`cacheTag()\` can only be called inside a \`"use cache"\` or \`"use cache: private"\` function.\nLearn more: ${CACHE_TAG_OUTSIDE_USE_CACHE}`
  )
}

export function createCacheLifeOutsideUseCacheError(): Error {
  return new Error(
    `\`cacheLife()\` can only be called inside a \`"use cache"\` or \`"use cache: private"\` function.\nLearn more: ${CACHE_LIFE_OUTSIDE_USE_CACHE}`
  )
}

export function createNestedCacheZeroRevalidateError(
  cause: Error | undefined
): Error {
  return new Error(
    `A nested \`"use cache"\` with \`revalidate: 0\` is inside an outer \`"use cache"\` that has no \`cacheLife()\`. Add \`cacheLife()\` to the outer one to choose whether to prerender it with a non-zero \`revalidate\` or keep it dynamic with \`revalidate: 0\`.\nLearn more: https://nextjs.org/docs/messages/nested-use-cache-no-explicit-cachelife`,
    { cause }
  )
}

export function createNestedCacheShortExpireError(
  cause: Error | undefined
): Error {
  return new Error(
    `A nested \`"use cache"\` with a short \`expire\` (under 5 minutes) is inside an outer \`"use cache"\` that has no \`cacheLife()\`. Add \`cacheLife()\` to the outer one to choose whether to prerender it with a longer \`expire\` or keep it dynamic with a short \`expire\`.\nLearn more: https://nextjs.org/docs/messages/nested-use-cache-no-explicit-cachelife`,
    { cause }
  )
}

// Private cache composition and request context

export function createUseCachePrivateInsidePublicUseCacheError(): Error {
  return new Error(
    `\`"use cache: private"\` can't be nested inside \`"use cache"\` because a shared cached function can't depend on private request data. Nest it only inside another \`"use cache: private"\`.\nLearn more: ${USE_CACHE_PRIVATE_COMPOSITION}`
  )
}

export function createUseCachePrivateInsideUnstableCacheError(): Error {
  return new Error(
    `\`"use cache: private"\` can't be used inside \`unstable_cache()\` because \`unstable_cache()\` uses a shared cache that can't contain private request data. Call the private cached function outside \`unstable_cache()\`.\nLearn more: ${USE_CACHE_PRIVATE_COMPOSITION}`
  )
}

export function createUseCachePrivateOutsideRequestContextError(): Error {
  return new Error(
    `\`"use cache: private"\` needs an active request, so it can't be used during \`generateStaticParams\` or other build-time contexts. Move it to a request-time component or function.\nLearn more: ${USE_CACHE_PRIVATE_COMPOSITION}`
  )
}
