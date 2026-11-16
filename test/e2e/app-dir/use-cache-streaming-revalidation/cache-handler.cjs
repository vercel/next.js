// @ts-check

/**
 * @typedef {import('next/cache').CacheEntry} CacheEntry
 */
/**
 * @type {Map<string, Omit<CacheEntry, 'value'> & { value: Uint8Array }>}
 */
const entries = new Map()
/**
 * @type {Map<string, Promise<void>>}
 */
const pendingWrites = new Map()

/**
 * @type {import('next/cache').CacheHandler}
 */
const handler = {
  async get(key) {
    await pendingWrites.get(key)
    const entry = entries.get(key)
    if (!entry) {
      return undefined
    }
    if (
      performance.timeOrigin + performance.now() >
      entry.timestamp + entry.expire * 1000
    ) {
      entries.delete(key)
      return undefined
    }
    return {
      ...entry,
      value: new ReadableStream({
        start(controller) {
          controller.enqueue(entry.value)
          controller.close()
        },
      }),
    }
  },
  async set(key, pendingEntry) {
    const write = pendingEntry.then(async (entry) => {
      const value = new Uint8Array(
        await new Response(entry.value).arrayBuffer()
      )
      entries.set(key, { ...entry, value })
    })
    pendingWrites.set(key, write)
    try {
      await write
    } finally {
      if (pendingWrites.get(key) === write) {
        pendingWrites.delete(key)
      }
    }
  },
  async refreshTags() {},
  async getExpiration() {
    return 0
  },
  async updateTags() {},
}

module.exports = handler
