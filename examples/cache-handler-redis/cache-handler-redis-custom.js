const {
  reviveFromBase64Representation,
  replaceJsonWithBase64,
} = require('@neshca/json-replacer-reviver')
const { IncrementalCache } = require('@neshca/cache-handler')
const { createClient } = require('redis')

/** @type {import('@neshca/cache-handler').TagsManifest} */
const localTagsManifest = {
  version: 1,
  items: {},
}

const TAGS_MANIFEST_KEY = 'sharedTagsManifest'

function createRedisClient(url) {
  const client = createClient({
    url,
  })

  client.on('error', (error) => {
    console.error('Redis error:', error.message)
  })

  return client
}

async function connect(client) {
  try {
    await client.connect()
  } catch (error) {
    console.error('Redis connection error:', error.message)
  }
}

IncrementalCache.onCreation(() => {
  const client = createRedisClient(
    process.env.REDIS_URL ?? 'redis://localhost:6379'
  )

  connect(client).then(() => {
    console.log('Redis connected')
  })

  return {
    cache: {
      async get(key) {
        try {
          const result = (await client.get(key)) ?? null

          if (!result) {
            return null
          }

          // use reviveFromBase64Representation to restore binary data from Base64
          return JSON.parse(result, reviveFromBase64Representation)
        } catch (error) {
          return null
        }
      },
      async set(key, value) {
        try {
          // use replaceJsonWithBase64 to store binary data in Base64 and save space
          await client.set(key, JSON.stringify(value, replaceJsonWithBase64))
        } catch (error) {
          // ignore because value will be written to disk
        }
      },
      async getTagsManifest() {
        try {
          const remoteTagsManifest = await client.hGetAll(TAGS_MANIFEST_KEY)

          if (!remoteTagsManifest) {
            return localTagsManifest
          }

          Object.entries(remoteTagsManifest).reduce(
            (acc, [tag, revalidatedAt]) => {
              acc[tag] = { revalidatedAt: parseInt(revalidatedAt ?? '0', 10) }
              return acc
            },
            localTagsManifest.items
          )

          return localTagsManifest
        } catch (error) {
          return localTagsManifest
        }
      },
      async revalidateTag(tag, revalidatedAt) {
        try {
          await client.hSet(TAGS_MANIFEST_KEY, {
            [tag]: revalidatedAt,
          })
        } catch (error) {
          localTagsManifest.items[tag] = { revalidatedAt }
        }
      },
    },
  }
})

module.exports = IncrementalCache
