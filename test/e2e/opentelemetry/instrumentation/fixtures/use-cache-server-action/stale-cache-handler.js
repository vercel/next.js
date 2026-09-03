const entries = new Map()

module.exports = {
  async get(key) {
    const entry = entries.get(key)
    if (!entry) return undefined

    return {
      ...entry,
      value: new Response(entry.value).body,
    }
  },

  async set(key, pendingEntry) {
    const entry = await pendingEntry
    const value = await new Response(entry.value).arrayBuffer()
    entries.set(key, { ...entry, value })
  },

  async refreshTags() {},
  async getExpiration() {
    return Infinity
  },
  async updateTags() {},
}
