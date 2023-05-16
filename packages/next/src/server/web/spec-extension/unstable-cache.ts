import {
  StaticGenerationStore,
  staticGenerationAsyncStorage as _staticGenerationAsyncStorage,
  StaticGenerationAsyncStorage,
} from '../../../client/components/static-generation-async-storage'
import { CACHE_ONE_YEAR } from '../../../lib/constants'
import { addImplicitTags } from '../../lib/patch-fetch'

type Callback = (...args: any[]) => Promise<any>

export function unstable_cache<T extends Callback>(
  cb: T,
  keyParts?: string[],
  options: {
    revalidate?: number | false
    tags?: string[]
  } = {}
): T {
  const joinedKey =
    keyParts && keyParts.length > 0 ? keyParts.join(',') : cb.toString()

  const staticGenerationAsyncStorage: StaticGenerationAsyncStorage =
    (fetch as any).__nextGetStaticStore?.() || _staticGenerationAsyncStorage

  const store: undefined | StaticGenerationStore =
    staticGenerationAsyncStorage?.getStore()

  const incrementalCache:
    | import('../../lib/incremental-cache').IncrementalCache
    | undefined =
    store?.incrementalCache || (globalThis as any).__incrementalCache

  if (!incrementalCache) {
    throw new Error(
      `Invariant: incrementalCache missing in unstable_cache ${joinedKey}`
    )
  }
  if (options.revalidate === 0) {
    throw new Error(
      `Invariant revalidate: 0 can not be passed to unstable_cache(), must be "false" or "> 0" ${joinedKey}`
    )
  }

  const cachedCb = async (...args: any[]) => {
    // We override the default fetch cache handling inside of the
    // cache callback so that we only cache the specific values returned
    // from the callback instead of also caching any fetches done inside
    // of the callback as well
    return staticGenerationAsyncStorage.run(
      {
        ...store,
        fetchCache: 'only-no-store',
        isStaticGeneration: !!store?.isStaticGeneration,
        pathname: store?.pathname || '/',
      },
      async () => {
        const cacheKey = await incrementalCache?.fetchCacheKey(joinedKey)
        const cacheEntry =
          cacheKey &&
          !(
            store?.isOnDemandRevalidate || incrementalCache.isOnDemandRevalidate
          ) &&
          (await incrementalCache?.get(cacheKey, true, options.revalidate))

        const tags = options.tags || []
        const implicitTags = addImplicitTags(store)

        for (const tag of implicitTags) {
          if (!tags.includes(tag)) {
            tags.push(tag)
          }
        }

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
                  tags,
                },
                revalidate:
                  typeof options.revalidate !== 'number'
                    ? CACHE_ONE_YEAR
                    : options.revalidate,
              },
              options.revalidate,
              true
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
        const currentTags = cacheEntry.value.data.tags

        if (isStale) {
          if (!store) {
            return invokeCallback()
          } else {
            if (!store.pendingRevalidates) {
              store.pendingRevalidates = []
            }
            store.pendingRevalidates.push(
              invokeCallback().catch((err) =>
                console.error(`revalidating cache with key: ${joinedKey}`, err)
              )
            )
          }
        } else if (tags && !tags.every((tag) => currentTags?.includes(tag))) {
          if (!cacheEntry.value.data.tags) {
            cacheEntry.value.data.tags = []
          }

          for (const tag of tags) {
            if (!cacheEntry.value.data.tags.includes(tag)) {
              cacheEntry.value.data.tags.push(tag)
            }
          }
          incrementalCache?.set(
            cacheKey,
            cacheEntry.value,
            options.revalidate,
            true
          )
        }
        return cachedValue
      }
    )
  }
  // TODO: once AsyncLocalStorage.run() returns the correct types this override will no longer be necessary
  return cachedCb as unknown as T
}
