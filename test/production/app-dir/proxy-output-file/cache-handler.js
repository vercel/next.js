const { readFileSync } = require('fs')
const { join } = require('path')

const cache = new Map()

module.exports = class CacheHandler {
  async get(key) {
    return cache.get(key)
  }

  async set(key, data, ctx) {
    cache.set(key, { value: data, lastModified: Date.now(), tags: ctx.tags })
  }

  async revalidateTag() {}

  resetRequestCache() {}
}

// File tracing can't resolve this file name, so the server's file trace lists
// every `.js` file of the server output, including the output of `proxy.ts`.
module.exports.readServerFile = (name) =>
  readFileSync(join(process.cwd(), '.next/server', `${name}.js`), 'utf8')
