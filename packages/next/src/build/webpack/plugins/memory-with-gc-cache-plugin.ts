/*
This plugin is based on the internal one in webpack but heavily modified to use a different caching heuristic.
https://github.com/webpack/webpack/blob/853bfda35a0080605c09e1bdeb0103bcb9367a10/lib/cache/MemoryWithGcCachePlugin.js#L15

https://github.com/webpack/webpack/blob/main/LICENSE
Copyright JS Foundation and other contributors

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

/*
The change in this plugin compared to the built-in one in webpack is that this plugin always cleans up after 5 compilations.
The built-in plugin only cleans up "total modules / max generations".
The default for max generations is 5, so 1/5th of the modules would be marked for deletion.
This plugin instead always checks the cache and decreases the time to live of all entries. That way memory is cleaned up earlier.
*/

import type { webpack } from 'next/dist/compiled/webpack/webpack'
import type { Compiler } from 'next/dist/compiled/webpack/webpack'

// Webpack doesn't expose Etag as a type so get it this way instead.
type Etag = Parameters<typeof webpack.Cache.prototype.get>[1]

/**
 * Entry in the memory cache
 */
interface CacheEntry {
  /**
   * Webpack provided etag
   */
  etag: Etag
  /**
   * Webpack provided data
   */
  data: unknown | null
  /**
   * Number of compilations left before the cache item is evicted.
   */
  ttl: number
}

// Used to hook into the memory stage of the webpack caching
const CACHE_STAGE_MEMORY = -10 // TODO: Somehow webpack.Cache.STAGE_MEMORY doesn't work.

const PLUGIN_NAME = 'NextJsMemoryWithGcCachePlugin'

export class MemoryWithGcCachePlugin {
  /**
   * Maximum number of compilations to keep the cache entry around for when it's not used.
   * We keep the modules for a few more compilations so that if you comment out a package and bring it back it doesn't need a full compile again.
   */
  private maxGenerations: number
  constructor({ maxGenerations }: { maxGenerations: number }) {
    this.maxGenerations = maxGenerations
  }
  apply(compiler: Compiler) {
    const maxGenerations = this.maxGenerations

    /**
     * The memory cache
     */
    const cache = new Map<string, CacheEntry>()

    /**
     * Cache cleanup implementation
     */
    function decreaseTTLAndEvict() {
      for (const [identifier, entry] of cache) {
        // Decrease item time to live
        entry.ttl--

        // if ttl is 0 or below, evict entry from the cache
        if (entry.ttl <= 0) {
          cache.delete(identifier)
        }
      }
    }
    compiler.hooks.afterDone.tap(PLUGIN_NAME, decreaseTTLAndEvict)
    compiler.cache.hooks.store.tap(
      { name: PLUGIN_NAME, stage: CACHE_STAGE_MEMORY },
      (identifier, etag, data) => {
        cache.set(identifier, { etag, data, ttl: maxGenerations })
      }
    )
    compiler.cache.hooks.get.tap(
      { name: PLUGIN_NAME, stage: CACHE_STAGE_MEMORY },
      (identifier, etag, gotHandlers) => {
        const cacheEntry = cache.get(identifier)
        // Item found
        if (cacheEntry !== undefined) {
          // When cache entry is hit we reset the counter.
          cacheEntry.ttl = maxGenerations
          // Handles `null` separately as it doesn't have an etag.
          if (cacheEntry.data === null) {
            return null
          }

          return cacheEntry.etag === etag ? cacheEntry.data : null
        }

        // Handle case where other cache does have the identifier, puts it into the memory cache
        gotHandlers.push((result, callback) => {
          cache.set(identifier, {
            // Handles `null` separately as it doesn't have an etag.
            etag: result === null ? null : etag,
            data: result,
            ttl: maxGenerations,
          })
          return callback()
        })

        // No item found
        return undefined
      }
    )
    compiler.cache.hooks.shutdown.tap(
      { name: PLUGIN_NAME, stage: CACHE_STAGE_MEMORY },
      () => {
        cache.clear()
      }
    )
  }
}
