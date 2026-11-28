const entriesByCacheKey = new Map()
const invalidatedAtByTag = new Map()

function wasInvalidatedAfterEntryWasStored(entry) {
  return entry.tags.some(
    (tag) => (invalidatedAtByTag.get(tag) ?? 0) > entry.timestamp
  )
}

// Stands in for a remote handler: a stale entry is returned with
// `revalidate: -1` after a delay, so a concurrent read can join the pending
// lookup.
module.exports = {
  async get(cacheKey) {
    const entry = entriesByCacheKey.get(cacheKey)
    if (!entry) return undefined
    const isStale = wasInvalidatedAfterEntryWasStored(entry)
    if (isStale) {
      console.log('[cache-handler] get start stale')
      await new Promise((resolve) => setTimeout(resolve, 2000))
      console.log('[cache-handler] get end stale')
    }
    return {
      ...entry,
      revalidate: isStale ? -1 : entry.revalidate,
      value: new Blob([entry.value]).stream(),
    }
  },

  async set(cacheKey, pendingEntry) {
    const entry = await pendingEntry
    const value = new Uint8Array(await new Response(entry.value).arrayBuffer())
    entriesByCacheKey.set(cacheKey, { ...entry, value })
    console.log('[cache-handler] set')
  },

  async refreshTags() {},

  async getExpiration(tags) {
    return Math.max(0, ...tags.map((tag) => invalidatedAtByTag.get(tag) ?? 0))
  },

  async updateTags(tags) {
    for (const tag of tags) invalidatedAtByTag.set(tag, Date.now())
    console.log('[cache-handler] updateTags')
  },
}
