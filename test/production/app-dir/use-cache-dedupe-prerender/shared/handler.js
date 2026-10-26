const { notify } = require('./notify')

// This handler stores fully collected cache entries in memory. It sends
// `lookup:<tag>` requests from `get()` and `stored:<tag>` notifications after
// successful `set()` calls.
const entries = new Map()

module.exports = {
  async get(key) {
    const entry = entries.get(key)
    if (!entry) {
      return undefined
    }

    const tag = entry.tags.find((tag) => tag.startsWith('short-lived:'))
    if (tag) {
      await notify(`lookup:${tag}`)
    }

    const [value, retained] = entry.value.tee()
    entry.value = retained
    return { ...entry, value }
  },
  async set(key, pendingEntry) {
    const entry = await pendingEntry
    const [value, consumed] = entry.value.tee()
    const reader = consumed.getReader()
    while (!(await reader.read()).done) {}
    entries.set(key, { ...entry, value })
    const tag = entry.tags.find((tag) => tag.startsWith('short-lived:'))
    if (tag) {
      // Notify after the write promise settles so prerenders cannot join the
      // warmup.
      setImmediate(() => {
        void notify(`stored:${tag}`)
      })
    }
  },
  async refreshTags() {},
  async getExpiration() {
    return 0
  },
  async updateTags() {},
}
