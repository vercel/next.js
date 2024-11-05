import type { ImmutableResumeDataCache } from './resume-data-cache'
import { UseCacheCacheStore, FetchCacheStore } from './cache-store'

type ResumeStoreSerialized = {
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
  if (resumeDataCache.fetch.size === 0 && resumeDataCache.cache.size === 0) {
    return 'null'
  }

  const json: ResumeStoreSerialized = {
    store: {
      fetch: Object.fromEntries(await resumeDataCache.fetch.entries()),
      cache: Object.fromEntries(await resumeDataCache.cache.entries()),
    },
  }

  return JSON.stringify(json)
}

/**
 * Parses a serialized resume data cache into an immutable version of the cache.
 * This cache cannot be mutated further, and is returned sealed.
 */
export function parseResumeDataCache(text: string): ImmutableResumeDataCache {
  if (text === 'null') {
    return {
      cache: new UseCacheCacheStore([]),
      fetch: new FetchCacheStore([]),
    }
  }

  const json: ResumeStoreSerialized = JSON.parse(text)
  return {
    cache: new UseCacheCacheStore(Object.entries(json.store.cache)),
    fetch: new FetchCacheStore(Object.entries(json.store.fetch)),
  }
}
