const cache = new Map()
const tagIndex = new Map()

module.exports = class CacheHandler {
  async get(key) {
    return cache.get(key) ?? null
  }

  async set(key, data, ctx) {
    console.log(
      'test-cache-handler set ' +
        JSON.stringify({ key, kind: data?.kind, tags: ctx.tags ?? null })
    )

    cache.set(key, { value: data, lastModified: Date.now() })

    for (const tag of ctx.tags ?? []) {
      if (!tagIndex.has(tag)) {
        tagIndex.set(tag, new Set())
      }
      tagIndex.get(tag).add(key)
    }
  }

  async revalidateTag(tags) {
    tags = [tags].flat()
    console.log('test-cache-handler revalidateTag ' + JSON.stringify(tags))

    for (const tag of tags) {
      for (const key of tagIndex.get(tag) ?? []) {
        cache.delete(key)
      }
      tagIndex.delete(tag)
    }
  }
}
