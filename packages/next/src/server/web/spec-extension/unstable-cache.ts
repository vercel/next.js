import type { IncrementalCache } from '../../lib/incremental-cache'

import { CACHE_ONE_YEAR } from '../../../lib/constants'
import {
  addImplicitTags,
  validateRevalidate,
  validateTags,
} from '../../lib/patch-fetch'
import { staticGenerationAsyncStorage } from '../../../client/components/static-generation-async-storage.external'

type Callback<T extends unknown[], R> = (...args: T) => Promise<R>

let noStoreFetchIdx = 0

function cacheNewResult(
  result: unknown,
  incrementalCache: IncrementalCache,
  cacheKey: string,
  tags: string[],
  revalidate: number | false | undefined,
  fetchIdx: number,
  fetchUrl: string
): Promise<void> {
  return incrementalCache.set(
    cacheKey,
    {
      kind: 'FETCH',
      data: {
        headers: {},
        // TODO: handle non-JSON values?
        body: JSON.stringify(result),
        status: 200,
        url: '',
      },
      revalidate: typeof revalidate !== 'number' ? CACHE_ONE_YEAR : revalidate,
    },
    {
      revalidate,
      fetchCache: true,
      tags,
      fetchIdx,
      fetchUrl,
    }
  )
}

/**
 * This function allows you to cache the results of expensive operations, like database queries, and reuse them across multiple requests.
 *
 * Read more: [Next.js Docs: `unstable_cache`](https://nextjs.org/docs/app/api-reference/functions/unstable_cache)
 */
export function unstable_cache<T extends any[], R>(
  callback: Callback<T, R>,
  keyParts?: string[],
  options: {
    /**
     * The revalidation interval in seconds.
     */
    revalidate?: number | false
    tags?: string[]
  } = {}
): Callback<T, R> {
  if (options.revalidate === 0) {
    throw new Error(
      `Invariant revalidate: 0 can not be passed to unstable_cache(), must be "false" or "> 0" ${callback.toString()}`
    )
  }

  // Validate the tags provided are valid
  const tags = options.tags
    ? validateTags(options.tags, `unstable_cache ${callback.toString()}`)
    : []

  // Validate the revalidate options
  validateRevalidate(
    options.revalidate,
    `unstable_cache ${callback.name || callback.toString()}`
  )

  // Stash the fixed part of the key at construction time. The invocation key will combine
  // the fixed key with the arguments when actually called
  // @TODO if cb.toString() is long we should hash it
  // @TODO come up with a collision-free way to combine keyParts
  // @TODO consider validating the keyParts are all strings. TS can't provide runtime guarantees
  // and the error produced by accidentally using something that cannot be safely coerced is likely
  // hard to debug
  const fixedKey = `${callback.toString()}-${
    Array.isArray(keyParts) && keyParts.join(',')
  }`

  return async (...args: T): Promise<R> => {
    const store = staticGenerationAsyncStorage.getStore()

    // We must be able to find the incremental cache otherwise we throw
    const incrementalCache:
      | import('../../lib/incremental-cache').IncrementalCache
      | undefined =
      store?.incrementalCache || (globalThis as any).__incrementalCache

    if (!incrementalCache) {
      throw new Error(
        `Invariant: incrementalCache missing in unstable_cache ${callback.toString()}`
      )
    }

    // Construct the complete cache key for this function invocation
    // @TODO stringify is likely not safe here. We will coerce undefined to null which will make
    // the keyspace smaller than the execution space
    const invocationKey = `${fixedKey}-${JSON.stringify(args)}`
    const cacheKey = await incrementalCache.fetchCacheKey(invocationKey)
    const fetchUrl = `unstable_cache ${
      callback.name ? ` ${callback.name}` : cacheKey
    }`
    const fetchIdx = (store ? store.nextFetchId : noStoreFetchIdx) ?? 1

    if (store) {
      store.nextFetchId = fetchIdx + 1

      // We are in an App Router context. We try to return the cached entry if it exists and is valid
      // If the entry is fresh we return it. If the entry is stale we return it but revalidate the entry in
      // the background. If the entry is missing or invalid we generate a new entry and return it.

      // We update the store's revalidate property if the option.revalidate is a higher precedence
      if (typeof options.revalidate === 'number') {
        if (
          typeof store.revalidate === 'number' &&
          store.revalidate < options.revalidate
        ) {
          // The store is already revalidating on a shorter time interval, leave it alone
        } else {
          store.revalidate = options.revalidate
        }
      } else if (
        options.revalidate === false &&
        typeof store.revalidate === 'undefined'
      ) {
        // The store has not defined revalidate type so we can use the false option
        store.revalidate = options.revalidate
      }

      // We need to accumulate the tags for this invocation within the store
      if (!store.tags) {
        store.tags = tags.slice()
      } else {
        for (const tag of tags) {
          // @TODO refactor tags to be a set to avoid this O(n) lookup
          if (!store.tags.includes(tag)) {
            store.tags.push(tag)
          }
        }
      }
      // @TODO check on this API. addImplicitTags mutates the store and returns the implicit tags. The naming
      // of this function is potentially a little confusing
      const implicitTags = addImplicitTags(store)

      if (
        // when we are nested inside of other unstable_cache's
        // we should bypass cache similar to fetches
        store.fetchCache !== 'force-no-store' &&
        !store.isOnDemandRevalidate &&
        !incrementalCache.isOnDemandRevalidate &&
        !store.isDraftMode
      ) {
        // We attempt to get the current cache entry from the incremental cache.
        const cacheEntry = await incrementalCache.get(cacheKey, {
          kindHint: 'fetch',
          revalidate: options.revalidate,
          tags,
          softTags: implicitTags,
          fetchIdx,
        })

        if (cacheEntry && cacheEntry.value) {
          // The entry exists and has a value
          if (cacheEntry.value.kind !== 'FETCH') {
            // The entry is invalid and we need a special warning
            // @TODO why do we warn this way? Should this just be an error? How are these errors surfaced
            // so bugs can be reported
            // @TODO the invocation key can have sensitive data in it. we should not log this entire object
            console.error(
              `Invariant invalid cacheEntry returned for ${invocationKey}`
            )
            // will fall through to generating a new cache entry below
          } else {
            // We have a valid cache entry so we will be returning it. We also check to see if we need
            // to background revalidate it by checking if it is stale.
            const cachedResponse =
              typeof cacheEntry.value.data.body === 'string'
                ? JSON.parse(cacheEntry.value.data.body)
                : undefined

            // We had a valid cache entry so we return it here
            if (!cacheEntry.isStale) return cachedResponse

            // In App Router we return the stale result and revalidate in the
            // background.
            store.pendingRevalidates ??= {}

            // We run the cache function asynchronously and save the result when it completes
            store.pendingRevalidates[invocationKey] =
              staticGenerationAsyncStorage
                .run(
                  {
                    ...store,
                    isUnstableCacheCallback: true,
                  },
                  callback,
                  ...args
                )
                .then((result) =>
                  cacheNewResult(
                    result,
                    incrementalCache,
                    cacheKey,
                    tags,
                    options.revalidate,
                    fetchIdx,
                    fetchUrl
                  )
                )
                .catch((err) =>
                  console.error(
                    `revalidating cache with key: ${invocationKey}`,
                    err
                  )
                )

            return cachedResponse
          }
        }
      }

      // If we got this far then we had an invalid cache entry and need to generate a new one
      const result = await staticGenerationAsyncStorage.run(
        {
          ...store,
          isUnstableCacheCallback: true,
        },
        callback,
        ...args
      )

      cacheNewResult(
        result,
        incrementalCache,
        cacheKey,
        tags,
        options.revalidate,
        fetchIdx,
        fetchUrl
      ).catch((err) => {
        console.error(`failed to cache result with key: ${invocationKey}`, err)
      })

      return result
    } else {
      noStoreFetchIdx += 1
      // We are in Pages Router or were called outside of a render. We don't have a store
      // so we just call the callback directly when it needs to run.
      // If the entry is fresh we return it. If the entry is stale we return it but revalidate the entry in
      // the background. If the entry is missing or invalid we generate a new entry and return it.

      if (!incrementalCache.isOnDemandRevalidate) {
        // We aren't doing an on demand revalidation so we check use the cache if valid

        const cacheEntry = await incrementalCache.get(cacheKey, {
          kindHint: 'fetch',
          revalidate: options.revalidate,
          tags,
        })

        if (cacheEntry && cacheEntry.value) {
          // The entry exists and has a value
          if (cacheEntry.value.kind !== 'FETCH') {
            // The entry is invalid and we need a special warning
            // @TODO why do we warn this way? Should this just be an error? How are these errors surfaced
            // so bugs can be reported
            console.error(
              `Invariant invalid cacheEntry returned for ${invocationKey}`
            )
            // will fall through to generating a new cache entry below
          } else if (!cacheEntry.isStale) {
            // We have a valid cache entry and it is fresh so we return it
            return cacheEntry.value.data.body !== undefined
              ? JSON.parse(cacheEntry.value.data.body)
              : undefined
          }
        }
      }

      // If we got this far then we had an invalid cache entry and need to generate a new one
      // @TODO this storage wrapper is included here because it existed prior to the latest refactor
      // however it is incorrect logic because it causes any internal cache calls to follow the App Router
      // path rather than Pages router path. This may mean there is existing buggy behavior however no specific
      // issues are known at this time. The whole static generation storage pathways should be reworked
      // to allow tracking which "mode" we are in without the presence of a store or not. For now I have
      // maintained the existing behavior to limit the impact of the current refactor
      const result = await staticGenerationAsyncStorage.run(
        // We are making a fake store that is useful for scoping isUnstableCacheCallback: true
        // The fact that we need to construct this kind of fake store indicates the code is not factored correctly
        // @TODO refactor to not require this fake store object
        {
          isUnstableCacheCallback: true,
          urlPathname: '/',
          isStaticGeneration: false,
          prerenderState: null,
        },
        callback,
        ...args
      )

      cacheNewResult(
        result,
        incrementalCache,
        cacheKey,
        tags,
        options.revalidate,
        fetchIdx,
        fetchUrl
      ).catch((err) => {
        console.error(`failed to cache result with key: ${invocationKey}`, err)
      })

      return result
    }
  }
}
