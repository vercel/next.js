export const NEXT_REQUEST_IN_USE_CACHE =
  'https://nextjs.org/docs/messages/next-request-in-use-cache'

export const NESTED_USE_CACHE_NO_EXPLICIT_CACHELIFE =
  'https://nextjs.org/docs/messages/nested-use-cache-no-explicit-cachelife'

export const REVALIDATING_GUIDE_DOCS =
  'https://nextjs.org/docs/app/getting-started/revalidating'

export const CACHE_TAG_API_DOCS =
  'https://nextjs.org/docs/app/api-reference/functions/cacheTag'

export const CACHE_LIFE_API_DOCS =
  'https://nextjs.org/docs/app/api-reference/functions/cacheLife'

export const USE_CACHE_PRIVATE_DIRECTIVE_DOCS =
  'https://nextjs.org/docs/app/api-reference/directives/use-cache-private'

export function createCookiesInUseCacheError(): Error {
  return new Error(
    `\`cookies()\` cannot be called inside "use cache". Read \`cookies()\` outside the cached function and pass the values you need as arguments. Learn more: ${NEXT_REQUEST_IN_USE_CACHE}`
  )
}

export function createHeadersInUseCacheError(): Error {
  return new Error(
    `\`headers()\` cannot be called inside "use cache". Read \`headers()\` outside the cached function and pass the values you need as arguments. Learn more: ${NEXT_REQUEST_IN_USE_CACHE}`
  )
}

export function createSearchParamsInUseCacheError(): Error {
  return new Error(
    `\`searchParams\` cannot be read inside "use cache". \`await searchParams\` outside the cached function and pass the values you need as arguments. Learn more: ${NEXT_REQUEST_IN_USE_CACHE}`
  )
}

export function createConnectionInSharedUseCacheError(): Error {
  return new Error(
    `\`connection()\` cannot be called inside "use cache". A cache entry may be produced before a request exists, so it cannot depend on the request lifecycle. Learn more: ${NEXT_REQUEST_IN_USE_CACHE}`
  )
}

export function createConnectionInPrivateUseCacheError(): Error {
  return new Error(
    `\`connection()\` cannot be called inside "use cache: private". A private cache entry may be produced before a navigation request, so it cannot depend on the request lifecycle. Learn more: ${NEXT_REQUEST_IN_USE_CACHE}`
  )
}

export function createDraftModeMutationInUseCacheError(
  expression: string
): Error {
  return new Error(
    `\`${expression}\` cannot be called inside "use cache". The status of \`draftMode()\` can be read in a cache, but it must not be enabled or disabled there. Learn more: ${NEXT_REQUEST_IN_USE_CACHE}`
  )
}

// Only reachable via Server Action -> "use cache" -> revalidate.
export function createRevalidateDuringUseCacheError(expression: string): Error {
  return new Error(
    `\`${expression}\` cannot be called inside "use cache". Revalidation must run outside renders and cached functions so caches stay consistent. Learn more: ${REVALIDATING_GUIDE_DOCS}`
  )
}

export function createRequestIoInUseCacheError(expression: string): Error {
  return new Error(
    `\`${expression}\` cannot be used inside "use cache". Read it outside the cached function and pass the values you need as arguments. Learn more: ${NEXT_REQUEST_IN_USE_CACHE}`
  )
}

export function createCacheTagOutsideUseCacheError(): Error {
  return new Error(
    `\`cacheTag()\` can only be called inside a "use cache" function. Learn more: ${CACHE_TAG_API_DOCS}`
  )
}

export function createCacheLifeOutsideUseCacheError(): Error {
  return new Error(
    `\`cacheLife()\` can only be called inside a "use cache" function. Learn more: ${CACHE_LIFE_API_DOCS}`
  )
}

export function createNestedUseCacheZeroRevalidateWithoutOuterCacheLifeError(): Error {
  return new Error(
    `Nested "use cache" with \`revalidate: 0\` cannot be used inside an outer "use cache" without an explicit \`cacheLife()\`. Add \`cacheLife()\` to the outer "use cache" with non-zero \`revalidate\` to prerender it, or zero \`revalidate\` to keep it dynamic. Learn more: ${NESTED_USE_CACHE_NO_EXPLICIT_CACHELIFE}`
  )
}

export function createNestedUseCacheShortExpireWithoutOuterCacheLifeError(): Error {
  return new Error(
    `Nested "use cache" with short \`expire\` (under 5 minutes) cannot be used inside an outer "use cache" without an explicit \`cacheLife()\`. Add \`cacheLife()\` to the outer "use cache" with longer \`expire\` to prerender it, or short \`expire\` to keep it dynamic. Learn more: ${NESTED_USE_CACHE_NO_EXPLICIT_CACHELIFE}`
  )
}

export function createUseCachePrivateInsideUnstableCacheError(
  expression: string
): Error {
  return new Error(
    `${expression} cannot be used inside \`unstable_cache()\`. Learn more: ${USE_CACHE_PRIVATE_DIRECTIVE_DOCS}`
  )
}

export function createUseCachePrivateInsideSharedUseCacheError(
  expression: string
): Error {
  return new Error(
    `${expression} cannot be nested inside "use cache". It can only be nested inside another "use cache: private". Learn more: ${USE_CACHE_PRIVATE_DIRECTIVE_DOCS}`
  )
}

export function createUseCachePrivateOutsideRequestContextError(
  expression: string
): Error {
  return new Error(
    `${expression} requires an active request and cannot be used during \`generateStaticParams\` or other build-time contexts. Learn more: ${USE_CACHE_PRIVATE_DIRECTIVE_DOCS}`
  )
}
