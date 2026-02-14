import { promises } from 'fs'
import { join } from 'path'
import { LRUCache } from './lru-cache'
import * as Log from '../../build/output/log'

/**
 * Module-level LRU singleton for disk cache eviction.
 * Initialized once on first `set()`, shared across all consumers.
 * Once resolved, the promise stays resolved — subsequent calls just await the cached result.
 */
let _diskLRUPromise: Promise<LRUCache<number>> | null = null

/**
 * Initialize or return the module-level LRU for disk cache eviction.
 * Concurrent calls are deduplicated via the shared promise.
 *
 * @param cacheDir - The directory where cached files are stored
 * @param cacheMaxDiskSize - Max size in bytes (0 = auto-detect via statfs at 50% available space)
 * @param readEntries - Callback to scan existing cache entries (format-agnostic)
 */
export async function getOrInitDiskLRU(
  cacheDir: string,
  cacheMaxDiskSize: number,
  readEntries: (
    cacheDir: string
  ) => Promise<Array<{ key: string; size: number; expireAt: number }>>
): Promise<LRUCache<number>> {
  if (!_diskLRUPromise) {
    _diskLRUPromise = (async () => {
      let maxSize = cacheMaxDiskSize
      if (maxSize === undefined) {
        // If config is not provided, default to 50% of available disk space
        const { bavail, bsize } = await promises.statfs(cacheDir)
        maxSize = Math.floor((bavail * bsize) / 2)
      }

      const lru = new LRUCache<number>(
        maxSize,
        (size) => size,
        (cacheKey) => {
          // Fire-and-forget: intentionally don't await rm to avoid blocking
          promises
            .rm(join(/* turbopackIgnore: true */ cacheDir, cacheKey), {
              recursive: true,
              force: true,
            })
            .catch((err) => {
              Log.error(`Failed to delete cache key ${cacheKey}`, err)
            })
        }
      )

      const entries = await readEntries(cacheDir)
      for (const entry of entries) {
        lru.set(entry.key, entry.size)
      }

      return lru
    })()
  }
  return _diskLRUPromise
}

/**
 * Reset the module-level LRU singleton. Exported for testing only.
 */
export function resetDiskLRU(): void {
  _diskLRUPromise = null
}
