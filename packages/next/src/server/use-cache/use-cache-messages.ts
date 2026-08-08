/**
 * Centralized error factories for `"use cache"` / `"use cache: private"`
 * misuse. State the scope and constraint, explain non-obvious boundaries,
 * give the immediate fix, then link to the relevant docs.
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
    `Route "${route}": \`connection()\` can't be called inside \`"use cache"\` because the cached function can run before a request exists. Call it outside the cached function.\nLearn more: ${NEXT_REQUEST_IN_USE_CACHE}`
  )
}

export function createConnectionInPrivateUseCacheError(route: string): Error {
  return new Error(
    `Route "${route}": \`connection()\` can't be called inside \`"use cache: private"\` because the cached function can run during prefetching, before a navigation request exists. Call it outside the cached function.\nLearn more: ${USE_CACHE_PRIVATE_API_DOCS}`
  )
}

export function createConnectionInUnstableCacheError(route: string): Error {
  return new Error(
    `Route "${route}": \`connection()\` can't be called inside \`unstable_cache()\` because the cached function can run before a request exists. Call it outside the cached function.\nLearn more: ${UNSTABLE_CACHE_API_DOCS}`
  )
}

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

export function createRevalidateInUseCacheError(
  route: string,
  expression: string
): Error {
  return new Error(
    `Route "${route}": \`${expression}\` can't be called inside \`"use cache"\`. Revalidation must run outside renders and cached functions so caches stay consistent.\nLearn more: ${REVALIDATE_IN_USE_CACHE}`
  )
}

export function createRevalidateInUnstableCacheError(
  route: string,
  expression: string
): Error {
  return new Error(
    `Route "${route}": \`${expression}\` can't be called inside \`unstable_cache()\`. Revalidation must run outside renders and cached functions so caches stay consistent.\nLearn more: ${REVALIDATE_IN_USE_CACHE}`
  )
}

export function createCacheTagOutsideUseCacheError(): Error {
  return new Error(
    `\`cacheTag()\` can only be called inside a \`"use cache"\` function.\nLearn more: ${CACHE_TAG_OUTSIDE_USE_CACHE}`
  )
}

export function createCacheLifeOutsideUseCacheError(): Error {
  return new Error(
    `\`cacheLife()\` can only be called inside a \`"use cache"\` function.\nLearn more: ${CACHE_LIFE_OUTSIDE_USE_CACHE}`
  )
}

/**
 * Factories rather than exported strings so the error-code tool can
 * statically match the message at the `new Error(…)` call site. The
 * chained `NestedDynamicUseCacheError` is passed as `cause`.
 */
export function createNestedCacheZeroRevalidateError(
  cause: Error | undefined
): Error {
  return new Error(
    `A nested \`"use cache"\` with \`revalidate: 0\` is inside an outer \`"use cache"\` that has no \`cacheLife()\`. Add \`cacheLife()\` to the outer one to choose: a non-zero \`revalidate\` to prerender it, or \`revalidate: 0\` to keep it dynamic.\nLearn more: https://nextjs.org/docs/messages/nested-use-cache-no-explicit-cachelife`,
    { cause }
  )
}

export function createNestedCacheShortExpireError(
  cause: Error | undefined
): Error {
  return new Error(
    `A nested \`"use cache"\` with a short \`expire\` (under 5 minutes) is inside an outer \`"use cache"\` that has no \`cacheLife()\`. Add \`cacheLife()\` to the outer one to choose: a longer \`expire\` to prerender it, or a short \`expire\` to keep it dynamic.\nLearn more: https://nextjs.org/docs/messages/nested-use-cache-no-explicit-cachelife`,
    { cause }
  )
}

export function createUseCachePrivateInsidePublicUseCacheError(): Error {
  return new Error(
    `\`"use cache: private"\` can't be nested inside \`"use cache"\` because a shared cached function can't depend on private request data. Nest it only inside another \`"use cache: private"\`.\nLearn more: ${USE_CACHE_PRIVATE_COMPOSITION}`
  )
}

export function createUseCachePrivateInsideUnstableCacheError(): Error {
  return new Error(
    `\`"use cache: private"\` can't be used inside \`unstable_cache()\` because it can't depend on private request data. Call the private cached function outside \`unstable_cache()\`.\nLearn more: ${USE_CACHE_PRIVATE_COMPOSITION}`
  )
}

export function createUseCachePrivateOutsideRequestContextError(): Error {
  return new Error(
    `\`"use cache: private"\` needs an active request, so it can't be used during \`generateStaticParams\` or other build-time contexts. Move it to a request-time component or function.\nLearn more: ${USE_CACHE_PRIVATE_COMPOSITION}`
  )
}
