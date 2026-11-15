// A cache handler that keeps entries in a JSON file, like a cache shared by
// several instances would. It stores the lifetime Next.js passes to `set()` and
// returns it from `get()`.
const fs = require('fs')
const path = require('path')

const file = path.join(process.cwd(), '.next', 'shared-cache.json')

const replacer = (_key, value) => {
  if (value instanceof Map) return { __map: [...value.entries()] }
  if (value && value.type === 'Buffer' && Array.isArray(value.data)) {
    return { __buffer: Buffer.from(value.data).toString('base64') }
  }
  return value
}
const reviver = (_key, value) => {
  if (value && typeof value === 'object' && '__map' in value) {
    return new Map(value.__map)
  }
  if (value && typeof value === 'object' && '__buffer' in value) {
    return Buffer.from(value.__buffer, 'base64')
  }
  return value
}

const read = () => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'), reviver)
  } catch {
    return {}
  }
}

module.exports = class CacheHandler {
  async get(key) {
    return read()[key] ?? null
  }

  async set(key, data, ctx) {
    const entries = read()
    entries[key] = {
      value: data,
      lastModified: Date.now(),
      cacheControl: ctx.cacheControl,
    }
    fs.writeFileSync(file, JSON.stringify(entries, replacer))
  }

  async revalidateTag() {}

  resetRequestCache() {}
}
