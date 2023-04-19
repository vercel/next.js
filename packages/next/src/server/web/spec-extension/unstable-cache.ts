import {
  StaticGenerationAsyncStorage,
  StaticGenerationStore,
} from '../../../client/components/static-generation-async-storage'

type Callback = (...args: any[]) => Promise<any>

// TODO: generic callback type?
export function unstable_cache(
  cb: Callback,
  keyParts: string[],
  options: {
    revalidate: number | false
    tags?: string[]
  }
): Callback {
  const joinedKey = cb.toString() + '-' + keyParts.join(', ')
  const staticGenerationAsyncStorage = (
    fetch as any
  ).__nextGetStaticStore?.() as undefined | StaticGenerationAsyncStorage

  const store: undefined | StaticGenerationStore =
    staticGenerationAsyncStorage?.getStore()

  if (!store || !store.incrementalCache) {
    throw new Error(
      `Invariant: static generation store missing in unstable_cache ${joinedKey}`
    )
  }

  if (options.revalidate === 0) {
    throw new Error(
      `Invariant revalidate: 0 can not be passed to unstable_cache(), must be "false" or "> 0" ${joinedKey}`
    )
  }

  return async (...args: any[]) => {
    // We override the default fetch cache handling inside of the
    // cache callback so that we only cache the specific values returned
    // from the callback instead of also caching any fetches done inside
    // of the callback as well
    return staticGenerationAsyncStorage?.run(
      {
        ...store,
        fetchCache: 'only-no-store',
      },
      async () => {
        const cacheKey = await store.incrementalCache?.fetchCacheKey(joinedKey)
        const cacheEntry =
          cacheKey &&
          !store.isOnDemandRevalidate &&
          (await store.incrementalCache?.get(
            cacheKey,
            true,
            options.revalidate as number
          ))

        const invokeCallback = async () => {
          const result = await cb(...args)

          if (cacheKey && store.incrementalCache) {
            await store.incrementalCache.set(
              cacheKey,
              {
                kind: 'FETCH',
                data: {
                  headers: {},
                  // TODO: handle non-JSON values?
                  body: JSON.stringify(result),
                  status: 200,
                  tags: options.tags,
                },
                revalidate: options.revalidate as number,
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
          if (!store.pendingRevalidates) {
            store.pendingRevalidates = []
          }
          store.pendingRevalidates.push(
            invokeCallback().catch((err) =>
              console.error(`revalidating cache with key: ${joinedKey}`, err)
            )
          )
        } else if (
          options.tags &&
          !options.tags.every((tag) => currentTags?.includes(tag))
        ) {
          if (!cacheEntry.value.data.tags) {
            cacheEntry.value.data.tags = []
          }

          for (const tag of options.tags) {
            if (!cacheEntry.value.data.tags.includes(tag)) {
              cacheEntry.value.data.tags.push(tag)
            }
          }
          store.incrementalCache?.set(
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
}
