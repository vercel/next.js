const { IncrementalCache } = require('@neshca/cache-handler')
const { createClient } = require('redis')

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

IncrementalCache.onCreation(() => {
  return {
    cache: {
      async get(key) {
        try {
          const value = (await client.json.get(key)) ?? null

          if (value && value.kind === 'ROUTE' && value.body.type === 'Buffer') {
            value.body = Buffer.from(value.body)
          }

          return value
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

          return sharedTagsManifest
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
