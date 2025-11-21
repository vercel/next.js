import type { IncrementalCache } from '../../lib/incremental-cache'

import { CACHE_ONE_YEAR } from '../../../lib/constants'
import { validateRevalidate, validateTags } from '../../lib/patch-fetch'
import {
  workAsyncStorage,
  type WorkStore,
} from '../../app-render/work-async-storage.external'
import {
  getCacheSignal,
  getDraftModeProviderForCacheScope,
  workUnitAsyncStorage,
} from '../../app-render/work-unit-async-storage.external'
import {
  CachedRouteKind,
  IncrementalCacheKind,
  type CachedFetchData,
} from '../../response-cache'
import type {
  UnstableCacheStore,
  WorkUnitStore,
} from '../../app-render/work-unit-async-storage.external'

type Callback = (...args: any[]) => Promise<any>

let noStoreFetchIdx = 0

async function cacheNewResult<T>(
  result: T,
  incrementalCache: IncrementalCache,
  cacheKey: string,
  tags: string[],
  revalidate: number | false | undefined,
  fetchIdx: number,
  fetchUrl: string
): Promise<unknown> {
  await incrementalCache.set(
    cacheKey,
    {
      kind: CachedRouteKind.FETCH,
      data: {
        headers: {},
        // TODO: handle non-JSON values?
        body: JSON.stringify(result),
        status: 200,
        url: '',
      } satisfies CachedFetchData,
      revalidate: typeof revalidate !== 'number' ? CACHE_ONE_YEAR : revalidate,
    },
    { fetchCache: true, tags, fetchIdx, fetchUrl }
  )
  return
}

/**
 * This function allows you to cache the results of expensive operations, like database queries, and reuse them across multiple requests.
 *
 * Read more: [Next.js Docs: `unstable_cache`](https://nextjs.org/docs/app/api-reference/functions/unstable_cache)
 */
export function unstable_cache<T extends Callback>(
  cb: T,
  keyParts?: string[],
  options: {
    /**
     * The revalidation interval in seconds.
     */
    revalidate?: number | false
    tags?: string[]
  } = {}
): T {
  if (options.revalidate === 0) {
    throw new Error(
      `Invariant revalidate: 0 can not be passed to unstable_cache(), must be "false" or "> 0" ${cb.toString()}`
    )
  }

  // Validate the tags provided are valid
  const tags = options.tags
    ? validateTags(options.tags, `unstable_cache ${cb.toString()}`)
    : []

  // Validate the revalidate options
  validateRevalidate(
    options.revalidate,
    `unstable_cache ${cb.name || cb.toString()}`
  )

  // Stash the fixed part of the key at construction time. The invocation key will combine
  // the fixed key with the arguments when actually called
  // @TODO if cb.toString() is long we should hash it
  // @TODO come up with a collision-free way to combine keyParts
  // @TODO consider validating the keyParts are all strings. TS can't provide runtime guarantees
  // and the error produced by accidentally using something that cannot be safely coerced is likely
  // hard to debug
  const fixedKey = `${cb.toString()}-${
    Array.isArray(keyParts) && keyParts.join(',')
  }`

  const cachedCb = async (...args: any[]) => {
    const workStore = workAsyncStorage.getStore()
    const workUnitStore = workUnitAsyncStorage.getStore()

    // We must be able to find the incremental cache otherwise we throw
    const maybeIncrementalCache:
      | import('../../lib/incremental-cache').IncrementalCache
      | undefined =
      workStore?.incrementalCache || (globalThis as any).__incrementalCache

    if (!maybeIncrementalCache) {
      throw new Error(
        `Invariant: incrementalCache missing in unstable_cache ${cb.toString()}`
      )
    }
    const incrementalCache = maybeIncrementalCache

    const cacheSignal = workUnitStore ? getCacheSignal(workUnitStore) : null
    if (cacheSignal) {
      cacheSignal.beginRead()
    }
    try {
      // If there's no request store, we aren't in a request (or we're not in
      // app router) and if there's no static generation store, we aren't in app
      // router. Default to an empty pathname and search params when there's no
      // request store or static generation store available.
      const fetchUrlPrefix =
        workStore && workUnitStore
          ? getFetchUrlPrefix(workStore, workUnitStore)
          : ''

      // Construct the complete cache key for this function invocation
      // @TODO stringify is likely not safe here. We will coerce undefined to null which will make
      // the keyspace smaller than the execution space
      const invocationKey = `${fixedKey}-${JSON.stringify(args)}`
      const cacheKey = await incrementalCache.generateCacheKey(invocationKey)
      // $urlWithPath,$sortedQueryStringKeys,$hashOfEveryThingElse
      const fetchUrl = `unstable_cache ${fetchUrlPrefix} ${cb.name ? ` ${cb.name}` : cacheKey}`
      const fetchIdx =
        (workStore ? workStore.nextFetchId : noStoreFetchIdx) ?? 1

      const implicitTags = workUnitStore?.implicitTags

      const innerCacheStore: UnstableCacheStore = {
        type: 'unstable-cache',
        phase: 'render',
        implicitTags,
        draftMode:
          workUnitStore &&
          workStore &&
          getDraftModeProviderForCacheScope(workStore, workUnitStore),
      }

      if (workStore) {
        workStore.nextFetchId = fetchIdx + 1

        // We are in an App Router context. We try to return the cached entry if it exists and is valid
        // If the entry is fresh we return it. If the entry is stale we return it but revalidate the entry in
        // the background. If the entry is missing or invalid we generate a new entry and return it.

        let isNestedUnstableCache = false

        if (workUnitStore) {
          switch (workUnitStore.type) {
            case 'cache':
            case 'private-cache':
            case 'prerender':
            case 'prerender-runtime':
            case 'prerender-ppr':
            case 'prerender-legacy':
              // We update the store's revalidate property if the option.revalidate is a higher precedence
              // options.revalidate === undefined doesn't affect timing.
              // options.revalidate === false doesn't shrink timing. it stays at the maximum.
              if (typeof options.revalidate === 'number') {
                if (workUnitStore.revalidate < options.revalidate) {
                  // The store is already revalidating on a shorter time interval, leave it alone
                } else {
                  workUnitStore.revalidate = options.revalidate
                }
              }

              // We need to accumulate the tags for this invocation within the store
              const collectedTags = workUnitStore.tags
              if (collectedTags === null) {
                workUnitStore.tags = tags.slice()
              } else {
                for (const tag of tags) {
                  // @TODO refactor tags to be a set to avoid this O(n) lookup
                  if (!collectedTags.includes(tag)) {
                    collectedTags.push(tag)
                  }
                }
              }
              break
            case 'unstable-cache':
              isNestedUnstableCache = true
              break
            case 'prerender-client':
            case 'request':
              break
            default:
              workUnitStore satisfies never
          }
        }

        if (
          // when we are nested inside of other unstable_cache's
          // we should bypass cache similar to fetches
          !isNestedUnstableCache &&
          workStore.fetchCache !== 'force-no-store' &&
          !workStore.isOnDemandRevalidate &&
          !incrementalCache.isOnDemandRevalidate &&
          !workStore.isDraftMode
        ) {
          // We attempt to get the current cache entry from the incremental cache.
          const cacheEntry = await incrementalCache.get(cacheKey, {
            kind: IncrementalCacheKind.FETCH,
            revalidate: options.revalidate,
            tags,
            softTags: implicitTags?.tags,
            fetchIdx,
            fetchUrl,
          })

          if (cacheEntry && cacheEntry.value) {
            // The entry exists and has a value
            if (cacheEntry.value.kind !== CachedRouteKind.FETCH) {
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
                cacheEntry.value.data.body !== undefined
                  ? JSON.parse(cacheEntry.value.data.body)
                  : undefined

              if (cacheEntry.isStale) {
                if (!workStore.pendingRevalidates) {
                  workStore.pendingRevalidates = {}
                }

                // Check if there's already a pending revalidation to avoid duplicate work
                if (!workStore.pendingRevalidates[invocationKey]) {
                  // Create the revalidation promise
                  const revalidationPromise = workUnitAsyncStorage
                    .run(innerCacheStore, cb, ...args)
                    .then(async (result) => {
                      await cacheNewResult(
                        result,
                        incrementalCache,
                        cacheKey,
                        tags,
                        options.revalidate,
                        fetchIdx,
                        fetchUrl
                      )
                      return result
                    })
                    .catch((err) => {
                      // @TODO This error handling seems wrong. We swallow the error?
                      console.error(
                        `revalidating cache with key: ${invocationKey}`,
                        err
                      )
                      // Return the stale value on error for foreground revalidation
                      return cachedResponse
                    })

                  // Attach the empty catch here so we don't get a "unhandled promise
                  // rejection" warning. (Behavior is matched with patch-fetch)
                  if (workStore.isStaticGeneration) {
                    revalidationPromise.catch(() => {})
                  }

                  workStore.pendingRevalidates[invocationKey] =
                    revalidationPromise
                }

                // Check if we need to do foreground revalidation
                if (workStore.isStaticGeneration) {
                  // When the page is revalidating and the cache entry is stale,
                  // we need to wait for fresh data (blocking revalidate)
                  return workStore.pendingRevalidates[invocationKey]
                }
                // Otherwise, we're doing background revalidation - return stale immediately
              }

              // We had a valid cache entry so we return it here
              return cachedResponse
            }
          }
        }

        // If we got this far then we had an invalid cache entry and need to generate a new one
        const result = await workUnitAsyncStorage.run(
          innerCacheStore,
          cb,
          ...args
        )

        if (!workStore.isDraftMode) {
          if (!workStore.pendingRevalidates) {
            workStore.pendingRevalidates = {}
          }

          // We need to push the cache result promise to pending
          // revalidates otherwise it won't be awaited and is just
          // dangling
          workStore.pendingRevalidates[invocationKey] = cacheNewResult(
            result,
            incrementalCache,
            cacheKey,
            tags,
            options.revalidate,
            fetchIdx,
            fetchUrl
          )
        }

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
            kind: IncrementalCacheKind.FETCH,
            revalidate: options.revalidate,
            tags,
            fetchIdx,
            fetchUrl,
            softTags: implicitTags?.tags,
          })

          if (cacheEntry && cacheEntry.value) {
            // The entry exists and has a value
            if (cacheEntry.value.kind !== CachedRouteKind.FETCH) {
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
        const result = await workUnitAsyncStorage.run(
          innerCacheStore,
          cb,
          ...args
        )

        // we need to wait setting the new cache result here as
        // we don't have pending revalidates on workStore to
        // push to and we can't have a dangling promise
        await cacheNewResult(
          result,
          incrementalCache,
          cacheKey,
          tags,
          options.revalidate,
          fetchIdx,
          fetchUrl
        )
        return result
      }
    } finally {
      if (cacheSignal) {
        cacheSignal.endRead()
      }
    }
  }
  // TODO: once AsyncLocalStorage.run() returns the correct types this override will no longer be necessary
  return cachedCb as unknown as T
}

function getFetchUrlPrefix(
  workStore: WorkStore,
  workUnitStore: WorkUnitStore
): string {
  switch (workUnitStore.type) {
    case 'request':
      const pathname = workUnitStore.url.pathname
      const searchParams = new URLSearchParams(workUnitStore.url.search)

      const sortedSearch = [...searchParams.keys()]
        .sort((a, b) => a.localeCompare(b))
        .map((key) => `${key}=${searchParams.get(key)}`)
        .join('&')

      return `${pathname}${sortedSearch.length ? '?' : ''}${sortedSearch}`
    case 'prerender':
    case 'prerender-client':
    case 'prerender-runtime':
    case 'prerender-ppr':
    case 'prerender-legacy':
    case 'cache':
    case 'private-cache':
    case 'unstable-cache':
      return workStore.route
    default:
      return workUnitStore satisfies never
  }
}
