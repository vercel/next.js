const { mkdir, readFile, writeFile } = require('node:fs/promises')
const { join } = require('node:path')
const { serialize, deserialize } = require('node:v8')

// Model an external ISR cache that survives replacement of the build output.
const cacheDirectory = join(process.cwd(), 'external-cache')

module.exports = class CacheHandler {
  async get(key) {
    console.log('cache lookup', key)
    try {
      return deserialize(
        await readFile(join(cacheDirectory, encodeURIComponent(key)))
      )
    } catch (error) {
      if (error.code === 'ENOENT') return null
      throw error
    }
  }

  async set(key, value) {
    await mkdir(cacheDirectory, { recursive: true })
    await writeFile(
      join(cacheDirectory, encodeURIComponent(key)),
      serialize({ value, lastModified: Date.now() })
    )
  }

  async revalidateTag() {}
  resetRequestCache() {}
}
