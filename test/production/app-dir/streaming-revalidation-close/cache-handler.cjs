const { getState } = require('./state.cjs')

module.exports = {
  async get(key) {
    const state = getState()
    const entry = state.entries.get(key)
    if (!entry) {
      return undefined
    }
    return {
      ...entry,
      timestamp: state.stale ? Date.now() - 2000 : entry.timestamp,
      value: new ReadableStream({
        start(controller) {
          controller.enqueue(entry.value)
          controller.close()
        },
      }),
    }
  },
  async set(key, pendingEntry) {
    const entry = await pendingEntry
    const value = new Uint8Array(await new Response(entry.value).arrayBuffer())
    getState().entries.set(key, { ...entry, value })
    for (const tag of entry.tags) {
      getState().events.push('written:' + tag)
    }
  },
  async refreshTags() {},
  async getExpiration() {
    return 0
  },
  async updateTags() {},
}
