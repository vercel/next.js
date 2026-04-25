import { promises } from 'fs'
import { LRUCache } from './lru-cache'

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
 * @param maxDiskSize - Maximum disk cache size in bytes
 * @param readEntries - Callback to scan existing cache entries (format-agnostic)
 */
export async function getOrInitDiskLRU(
  cacheDir: string,
  maxDiskSize: number | undefined,
  readEntries: (
    cacheDir: string
  ) => Promise<Array<{ key: string; size: number; expireAt: number }>>,
  evictEntry: (cacheDir: string, cacheKey: string) => Promise<void>
): Promise<LRUCache<number>> {
  if (!_diskLRUPromise) {
    _diskLRUPromise = (async () => {
      let maxSize = maxDiskSize
      if (typeof maxSize === 'undefined') {
        // Ensure cacheDir exists before checking disk space
        await promises.mkdir(cacheDir, { recursive: true })
        // Since config was not provided, default to 50% of available disk space
        const { bavail, bsize } = await promises.statfs(cacheDir)
        maxSize = Math.floor((bavail * bsize) / 2)
      }

      const lru = new LRUCache<number>(
        maxSize,
        (size) => size,
        (cacheKey) => evictEntry(cacheDir, cacheKey)
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
