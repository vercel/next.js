// @ts-check

// A minimal cache handler that persists entries on disk, so they survive dev
// server restarts (like any custom cache handler backed by external storage).
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const cacheDir = path.join(__dirname, '.file-system-cache')

function filePathForKey(cacheKey) {
  const hash = crypto.createHash('sha256').update(cacheKey).digest('hex')
  return path.join(cacheDir, `${hash}.json`)
}

/**
 * @type {import('next/dist/server/lib/cache-handlers/types').CacheHandler}
 */
const cacheHandler = {
  async get(cacheKey) {
    const filePath = filePathForKey(cacheKey)
    if (!fs.existsSync(filePath)) {
      return undefined
    }
    const { value, ...metadata } = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    const bytes = new Uint8Array(Buffer.from(value, 'base64'))
    return {
      ...metadata,
      value: new ReadableStream({
        start(controller) {
          controller.enqueue(bytes)
          controller.close()
        },
      }),
    }
  },

  async set(cacheKey, pendingEntry) {
    const { value, ...metadata } = await pendingEntry
    const chunks = []
    const reader = value.getReader()
    while (true) {
      const { done, value: chunk } = await reader.read()
      if (done) break
      chunks.push(chunk)
    }
    fs.mkdirSync(cacheDir, { recursive: true })
    fs.writeFileSync(
      filePathForKey(cacheKey),
      JSON.stringify({
        ...metadata,
        value: Buffer.concat(chunks).toString('base64'),
      })
    )
  },

  async refreshTags() {},

  async getExpiration() {
    return 0
  },

  async updateTags() {},
}

module.exports = cacheHandler
