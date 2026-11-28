// Records the lifetime of an entry the way cache handlers outside of Next.js
// do: through `SharedCacheControls` from its old path. The test adds this
// file to the standalone output after the build, so file tracing has not seen
// what it imports.
const FileSystemCache =
  require('next/dist/server/lib/incremental-cache/file-system-cache').default
const {
  SharedCacheControls,
} = require('next/dist/server/lib/incremental-cache/shared-cache-controls.external')

const cacheControls = new SharedCacheControls({ routes: {}, dynamicRoutes: {} })

module.exports = class CacheHandler extends FileSystemCache {
  async get(key, ctx) {
    const data = await super.get(key, ctx)
    if (data) {
      cacheControls.set(key, { revalidate: 123, expire: 456 })
    }
    return data
  }
}
