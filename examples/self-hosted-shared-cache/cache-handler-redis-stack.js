const { IncrementalCache } = require('@neshca/cache-handler')
const { createClient } = require('redis')

if (!process.env.REDIS_URL) {
  console.warn(
    'Make sure that REDIS_URL is added to the env. redis://localhost:6379 is used by default'
  )
}

/** @type {import('@neshca/cache-handler').TagsManifest} */
let localTagsManifest = {
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

async function connectAndSetManifest(client) {
  try {
    await client.connect()
  } catch (error) {
    console.error('Redis connection error:', error.message)
  }

  try {
    await client.json.set(TAGS_MANIFEST_KEY, '.', localTagsManifest, {
      NX: true,
    })
  } catch (error) {
    console.error('Redis set tagsManifest error:', error.message)
  }
}

const client = createRedisClient(
  process.env.REDIS_URL ?? 'redis://localhost:6379'
)

connectAndSetManifest(client).then(() => {
  console.log('Redis connected')
})

/**
 * You may prefer to use
 */
IncrementalCache.onCreation(() => {
  return {
    cache: {
      async get(key) {
        try {
          return (await client.json.get(key)) ?? null
        } catch (error) {
          return null
        }
      },
      async set(key, value) {
        try {
          await client.json.set(key, '.', value)
        } catch (error) {
          // ignore because value will be written to disk
        }
      },
      async getTagsManifest() {
        try {
          const sharedTagsManifest =
            (await client.json.get(TAGS_MANIFEST_KEY)) ?? null

          if (sharedTagsManifest) {
            localTagsManifest = sharedTagsManifest
          }

          return localTagsManifest
        } catch (error) {
          return localTagsManifest
        }
      },
      async revalidateTag(tag, revalidatedAt) {
        try {
          await client.json.set(TAGS_MANIFEST_KEY, `.items.${tag}`, {
            revalidatedAt,
          })
        } catch (error) {
          localTagsManifest.items[tag] = { revalidatedAt }
        }
      },
    },
  }
})

module.exports = IncrementalCache
