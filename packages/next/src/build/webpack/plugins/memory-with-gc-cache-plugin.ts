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

import { Compiler } from 'next/dist/compiled/webpack/webpack'

const CACHE_STAGE_MEMORY = -10

export class MemoryWithGcCachePlugin {
  private maxGenerations: number
  constructor({ maxGenerations }: { maxGenerations: number }) {
    this.maxGenerations = maxGenerations
  }
  apply(compiler: Compiler) {
    const maxGenerations = this.maxGenerations
    // TODO: Potentially optimize this to a data structure that sorts by lowest ttl so that we don't have to traverse all items on afterDone.
    const cache = new Map()
    compiler.hooks.afterDone.tap('MemoryWithGcCachePlugin', () => {
      for (const [identifier, entry] of cache) {
        // decrease ttl
        entry.ttl--
        // if ttl is 0, delete entry
        if (entry.ttl <= 0) {
          cache.delete(identifier)
        }
      }
    })
    compiler.cache.hooks.store.tap(
      { name: 'MemoryWithGcCachePlugin', stage: CACHE_STAGE_MEMORY },
      (identifier, etag, data) => {
        cache.set(identifier, { etag, data, ttl: maxGenerations })
      }
    )
    compiler.cache.hooks.get.tap(
      { name: 'MemoryWithGcCachePlugin', stage: CACHE_STAGE_MEMORY },
      (identifier, etag, gotHandlers) => {
        const cacheEntry = cache.get(identifier)
        // Item found
        if (cacheEntry !== undefined) {
          // When cache entry is hit we reset the counter.
          cacheEntry.ttl = maxGenerations
          // Null is special-cased as it doesn't have an etag.
          if (cacheEntry.data === null) {
            return null
          }

          return cacheEntry.etag === etag ? cacheEntry.data : null
        }

        // Handle case where other cache does have the identifier, puts it into the memory cache
        gotHandlers.push((result, callback) => {
          cache.set(identifier, {
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
      { name: 'MemoryWithGcCachePlugin', stage: CACHE_STAGE_MEMORY },
      () => {
        cache.clear()
      }
    )
  }
}
