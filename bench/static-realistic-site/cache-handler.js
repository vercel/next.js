// A custom `cacheHandler` (BENCH_CACHE_HANDLER=1): one JSON file per entry
// under `.next/cache/bench-handler`, no memory cache. It stands in for a
// handler that keeps entries in an external store, where every read and
// write is serialized and asynchronous.
const crypto = require('crypto')
const fs = require('fs/promises')
const path = require('path')

const replacer = (_key, value) => {
  if (value instanceof Map) return { $map: [...value] }
  if (value && value.type === 'Buffer' && Array.isArray(value.data))
    return { $buffer: Buffer.from(value.data).toString('base64') }
  return value
}
const reviver = (_key, value) => {
  if (value && typeof value === 'object') {
    if (Array.isArray(value.$map)) return new Map(value.$map)
    if (typeof value.$buffer === 'string')
      return Buffer.from(value.$buffer, 'base64')
  }
  return value
}

module.exports = class BenchCacheHandler {
  constructor(options) {
    this.dir = path.join(
      options.serverDistDir || path.join(process.cwd(), '.next/server'),
      '../cache/bench-handler'
    )
    this.ready = fs.mkdir(this.dir, { recursive: true })
  }

  file(key) {
    return path.join(
      this.dir,
      crypto.createHash('sha256').update(key).digest('hex') + '.json'
    )
  }

  async get(key) {
    await this.ready
    try {
      return JSON.parse(await fs.readFile(this.file(key), 'utf8'), reviver)
    } catch {
      return null
    }
  }

  async set(key, value, context) {
    await this.ready
    await fs.writeFile(
      this.file(key),
      JSON.stringify(
        { value, lastModified: Date.now(), tags: context.tags || [] },
        replacer
      )
    )
  }

  async revalidateTag() {}

  resetRequestCache() {}
}
