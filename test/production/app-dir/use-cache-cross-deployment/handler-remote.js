// @ts-check

const fs = require('fs')
const path = require('path')

const dataFilePath = path.join(__dirname, 'handler-remote-data.json')

/**
 * @type {Record<string, { value: string, expiresAt?: number }>}
 */
let data = {}
try {
  data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'))
} catch (_e) {}

function persistData() {
  fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2))
}

// Date.now is considered sync IO by cache components
const now = () => performance.timeOrigin + performance.now()

// This is a Redis-like interface.
const client = {
  /**
   * @param {string} key
   * @returns {Promise<string | undefined>}
   */
  async get(key) {
    const stored = data[key]
    if (!stored) return undefined

    if (stored.expiresAt !== undefined && stored.expiresAt <= now()) {
      delete data[key]
      persistData()
      return undefined
    }

    return stored.value
  },
  /**
   * @param {string} key
   * @param {string} value
   * @param {{expire?: number} | undefined} options
   */
  async set(key, value, options) {
    if (options?.expire !== undefined && options.expire <= 0) {
      delete data[key]
    } else {
      data[key] = {
        value,
        expiresAt:
          options?.expire === undefined
            ? undefined
            : now() + options.expire * 1000,
      }
    }
    persistData()
  },
}

/** @type {Map<string, Promise<void>>} */
const pendingSets = new Map()

/** @param {string} cacheKey */
const entryKey = (cacheKey) => `entry:${cacheKey}`
/** @param {string} tag */
const tagKey = (tag) => `tag:${tag}`

/**
 * @typedef {{ stale?: number, expired?: number }} TagManifestEntry
 */

/**
 * @param {string} tag
 * @returns {Promise<TagManifestEntry>}
 */
async function getTagManifestEntry(tag) {
  const stored = await client.get(tagKey(tag))
  return stored ? JSON.parse(stored) : {}
}

/**
 * @type {import('next/dist/server/lib/cache-handlers/types').CacheHandler}
 */
module.exports = {
  async get(cacheKey, softTags) {
    console.log('CustomCacheHandler::get', cacheKey, JSON.stringify([softTags]))

    const pendingSet = pendingSets.get(cacheKey)
    if (pendingSet) {
      await pendingSet
    }

    const stored = await client.get(entryKey(cacheKey))
    if (!stored) return undefined

    // Deserialize the entry
    const entry = JSON.parse(stored)

    let revalidate = entry.revalidate
    for (const tag of entry.tags) {
      const tagManifestEntry = await getTagManifestEntry(tag)
      const now = now()
      if (
        tagManifestEntry.expired !== undefined &&
        tagManifestEntry.expired <= now &&
        tagManifestEntry.expired > entry.timestamp
      ) {
        return undefined
      }
      if (
        tagManifestEntry.stale !== undefined &&
        tagManifestEntry.stale > entry.timestamp
      ) {
        revalidate = -1
      }
    }

    // Reconstruct the ReadableStream from stored data
    return {
      value: new ReadableStream({
        start(controller) {
          controller.enqueue(Buffer.from(entry.value, 'base64'))
          controller.close()
        },
      }),
      tags: entry.tags,
      stale: entry.stale,
      timestamp: entry.timestamp,
      expire: entry.expire,
      revalidate,
    }
  },

  async set(cacheKey, pendingEntry) {
    console.log('CustomCacheHandler::set', cacheKey)
    /** @type {() => void} */
    let resolvePending = () => {}
    /** @type {Promise<void>} */
    const pendingSet = new Promise((resolve) => {
      resolvePending = /** @type {() => void} */ (resolve)
    })
    pendingSets.set(cacheKey, pendingSet)

    try {
      const entry = await pendingEntry

      // Read the stream to get the data
      const reader = entry.value.getReader()
      /** @type {Uint8Array[]} */
      const chunks = []

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
        }
      } finally {
        reader.releaseLock()
      }

      // Combine chunks and serialize
      const value = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))

      await client.set(
        entryKey(cacheKey),
        JSON.stringify({
          value: value.toString('base64'),
          tags: entry.tags,
          stale: entry.stale,
          timestamp: entry.timestamp,
          expire: entry.expire,
          revalidate: entry.revalidate,
        }),
        { expire: entry.expire }
      )
    } finally {
      resolvePending()
      pendingSets.delete(cacheKey)
    }
  },

  async refreshTags() {
    // Tags are read directly from the remote store, so there is nothing to sync.
  },

  async getExpiration(tags) {
    const entries = await Promise.all(tags.map(getTagManifestEntry))
    return Math.max(...entries.map((entry) => entry.expired || 0), 0)
  },

  async updateTags(tags, durations) {
    const now = now()

    await Promise.all(
      tags.map(async (tag) => {
        const entry = await getTagManifestEntry(tag)
        if (durations) {
          entry.stale = now
          if (durations.expire !== undefined) {
            entry.expired = now + durations.expire * 1000
          }
        } else {
          entry.expired = now
        }
        await client.set(tagKey(tag), JSON.stringify(entry), undefined)
      })
    )
  },
}
