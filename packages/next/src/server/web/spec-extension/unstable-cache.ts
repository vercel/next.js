import type {
  StaticGenerationStore,
  StaticGenerationAsyncStorage,
} from '../../../client/components/static-generation-async-storage.external'

import { staticGenerationAsyncStorage as _staticGenerationAsyncStorage } from '../../../client/components/static-generation-async-storage.external'
import { CACHE_ONE_YEAR } from '../../../lib/constants'
import {
  addImplicitTags,
  validateRevalidate,
  validateTags,
} from '../../lib/patch-fetch'

type Callback = (...args: any[]) => Promise<any>

export function unstable_cache<T extends Callback>(
  cb: T,
  keyParts?: string[],
  options: {
    revalidate?: number | false
    tags?: string[]
  } = {}
): T {
  const staticGenerationAsyncStorage: StaticGenerationAsyncStorage =
    (fetch as any).__nextGetStaticStore?.() || _staticGenerationAsyncStorage

  if (options.revalidate === 0) {
    throw new Error(
      `Invariant revalidate: 0 can not be passed to unstable_cache(), must be "false" or "> 0" ${cb.toString()}`
    )
  }

  const cachedCb = async (...args: any[]) => {
    const store: undefined | StaticGenerationStore =
      staticGenerationAsyncStorage?.getStore()

    if (store && typeof options.revalidate !== 'undefined') {
      validateRevalidate(
        options.revalidate,
        `unstable_cache ${cb.name || cb.toString()}`
      )
      // Revalidate 0 is a special case, it means opt-out of static generation.
      if (options.revalidate === 0) {
        // If postpone is supported we should postpone the render.
        store.postpone?.('revalidate: 0')

        // Set during dynamic rendering
        store.revalidate = 0
        // If revalidate was already set in the store before we should check if the new value is lower, set it to the lowest of the two.
      } else if (
        typeof store.revalidate === 'number' &&
        typeof options.revalidate === 'number'
      ) {
        if (store.revalidate > options.revalidate) {
          store.revalidate = options.revalidate
        }
        // All other cases we set the value from the option.
      } else {
        store.revalidate = options.revalidate
      }
    }

    const incrementalCache:
      | import('../../lib/incremental-cache').IncrementalCache
      | undefined =
      store?.incrementalCache || (globalThis as any).__incrementalCache

    if (!incrementalCache) {
      throw new Error(
        `Invariant: incrementalCache missing in unstable_cache ${cb.toString()}`
      )
    }

    const joinedKey = `${cb.toString()}-${
      Array.isArray(keyParts) && keyParts.join(',')
    }-${JSON.stringify(args)}`

    // We override the default fetch cache handling inside of the
    // cache callback so that we only cache the specific values returned
    // from the callback instead of also caching any fetches done inside
    // of the callback as well
    return staticGenerationAsyncStorage.run(
      {
        ...store,
        // force any nested fetches to bypass cache so they revalidate
        // when the unstable_cache call is revalidated
        fetchCache: 'force-no-store',
        urlPathname: store?.urlPathname || '/',
        isUnstableCacheCallback: true,
        isStaticGeneration: store?.isStaticGeneration === true,
        postpone: store?.postpone,
      },
      async () => {
        const tags = validateTags(
          options.tags || [],
          `unstable_cache ${cb.toString()}`
        )

        if (Array.isArray(tags) && store) {
          if (!store.tags) {
            store.tags = []
          }
          for (const tag of tags) {
            if (!store.tags.includes(tag)) {
              store.tags.push(tag)
            }
          }
        }
        const implicitTags = store ? addImplicitTags(store) : []

        const cacheKey = await incrementalCache?.fetchCacheKey(joinedKey)
        const cacheEntry =
          cacheKey &&
          // when we are nested inside of other unstable_cache's
          // we should bypass cache similar to fetches
          store?.fetchCache !== 'force-no-store' &&
          !(
            store?.isOnDemandRevalidate || incrementalCache.isOnDemandRevalidate
          ) &&
          (await incrementalCache?.get(cacheKey, {
            kindHint: 'fetch',
            revalidate: options.revalidate,
            tags,
            softTags: implicitTags,
          }))

        const invokeCallback = async () => {
          const result = await cb(...args)

          if (cacheKey && incrementalCache) {
            await incrementalCache.set(
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
                revalidate:
                  typeof options.revalidate !== 'number'
                    ? CACHE_ONE_YEAR
                    : options.revalidate,
              },
              {
                revalidate: options.revalidate,
                fetchCache: true,
                tags,
              }
            )
          }
          return result
        }

        if (!cacheEntry || !cacheEntry.value) {
          return invokeCallback()
        }

        if (cacheEntry.value.kind !== 'FETCH') {
          console.error(
            `Invariant invalid cacheEntry returned for ${joinedKey}`
          )
          return invokeCallback()
        }
        let cachedValue: any
        const isStale = cacheEntry.isStale

        if (cacheEntry) {
          const resData = cacheEntry.value.data
          cachedValue = JSON.parse(resData.body)
        }

        if (isStale) {
          if (!store) {
            return invokeCallback()
          } else {
            if (!store.pendingRevalidates) {
              store.pendingRevalidates = {}
            }
            store.pendingRevalidates[joinedKey] = invokeCallback().catch(
              (err) =>
                console.error(`revalidating cache with key: ${joinedKey}`, err)
            )
          }
        }
        return cachedValue
      }
    )
  }
  // TODO: once AsyncLocalStorage.run() returns the correct types this override will no longer be necessary
  return cachedCb as unknown as T
}
