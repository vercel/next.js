import type { CacheHandler, CacheEntry } from 'next/cache'

// eslint-disable-next-line @typescript-eslint/no-unused-expressions
;() => {
  ;({
    value: new ReadableStream<Uint8Array>(),
    tags: [],
    stale: 0,
    timestamp: 0,
    expire: 0,
    revalidate: 0,
  }) satisfies CacheEntry
  ;({
    async get(_cacheKey: string, _softTags: string[]) {
      return undefined
    },
    async set(_cacheKey: string, _pendingEntry: Promise<CacheEntry>) {},
    async refreshTags() {},
    async getExpiration(_tags: string[]) {
      return 0
    },
    async updateTags(_tags: string[], _durations?: { expire?: number }) {},
  }) satisfies CacheHandler
}
