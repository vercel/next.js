import type { ImmutableResumeDataCache } from './resume-data-cache'
import { UseCacheCacheStore, FetchCacheStore } from './cache-store'

type ResumeStoreSerialized = {
  version: 1
  store: {
    cache: {
      [key: string]: any
    }
    fetch: {
      [key: string]: any
    }
  }
}

/**
 * Serializes an immutable resume data cache into a JSON string.
 */
export async function stringifyResumeDataCache(
  resumeDataCache: ImmutableResumeDataCache
): Promise<string> {
  const json: ResumeStoreSerialized = {
    version: 1,
    store: {
      fetch: Object.fromEntries(await resumeDataCache.fetch.entries()),
      cache: Object.fromEntries(await resumeDataCache.cache.entries()),
    },
  }

  return JSON.stringify(json, null, 2)
}

/**
 * Parses a serialized resume data cache into an immutable version of the cache.
 * This cache cannot be mutated further, and is returned sealed.
 */
export async function parseResumeDataCache(
  text: string
): Promise<ImmutableResumeDataCache> {
  const json: ResumeStoreSerialized = JSON.parse(text)
  if (json.version !== 1) {
    throw new Error(`Unsupported version: ${json.version}`)
  }

  return {
    cache: new UseCacheCacheStore(Object.entries(json.store.cache)),
    fetch: new FetchCacheStore(Object.entries(json.store.fetch)),
  }
}
