/* eslint-env jest */
import { join } from 'path'
import { promises } from 'fs'
import { tmpdir } from 'os'
import { setTimeout } from 'timers/promises'
import { execFileSync } from 'child_process'
import {
  getOrInitDiskLRU,
  resetDiskLRU,
} from 'next/dist/server/lib/disk-lru-cache.external'
import { ImageOptimizerCache } from 'next/dist/server/image-optimizer'
import { CachedRouteKind } from 'next/dist/server/response-cache'
import type { NextConfigRuntime } from 'next/dist/server/config-shared'

async function writeEntry(
  cacheDir: string,
  key: string,
  sizeInBytes: number,
  expireAt: number = Date.now() + 60_000
) {
  const dir = join(cacheDir, key)
  const buffer = Buffer.alloc(sizeInBytes, 0x42) // Fill with dummy data
  await promises.mkdir(dir, { recursive: true })
  await promises.writeFile(join(dir, `${expireAt}.bin`), buffer)
}

// Writes one entry in the real on-disk format used by ImageOptimizerCache:
// `<cacheDir>/<key>/<maxAge>.<expireAt>.<etag>.<upstreamEtag>.<extension>`
async function writeImageCacheEntry(
  cacheDir: string,
  key: string,
  buffer: Buffer,
  expireAt: number,
  maxAge: number = 60
) {
  const dir = join(cacheDir, key)
  await promises.mkdir(dir, { recursive: true })
  await promises.writeFile(
    join(dir, `${maxAge}.${expireAt}.etag.upstreamEtag.png`),
    buffer
  )
}

async function readEntry(cacheDir: string, key: string) {
  const dir = join(cacheDir, key)
  const [file] = await promises.readdir(dir)
  const buffer = await promises.readFile(join(dir, file))
  const [expireAtStr] = file.split('.')
  return { size: buffer.byteLength, expireAt: Number(expireAtStr) }
}

async function initEntries(
  cacheDir: string
): Promise<Array<{ key: string; size: number; expireAt: number }>> {
  const keys = await promises.readdir(cacheDir).catch(() => [])
  const entries: Array<{ key: string; size: number; expireAt: number }> = []

  for (const key of keys) {
    const { size, expireAt } = await readEntry(cacheDir, key)
    entries.push({ key, size, expireAt })
  }

  // Sort oldest-first so we can replay them chronologically into LRU
  return entries.sort((a, b) => a.expireAt - b.expireAt)
}

async function rmEntry(cacheDir: string, cacheKey: string): Promise<void> {
  await promises.rm(join(cacheDir, cacheKey), {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 500,
  })
}

describe('LRU disk eviction', () => {
  let cacheDir: string

  beforeEach(async () => {
    cacheDir = await promises.mkdtemp(join(tmpdir(), 'next-lru-test-'))
    resetDiskLRU()
  })

  afterEach(async () => {
    resetDiskLRU()
    await promises.rm(cacheDir, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 500,
    })
  })

  it('should evict oldest entries on initialization', async () => {
    const expireAt = Date.now() + 60_000
    // Write 4 entries of 400 bytes each (total 1600)
    await writeEntry(cacheDir, 'entry-a', 400, expireAt + 1)
    await writeEntry(cacheDir, 'entry-b', 400, expireAt + 2)
    await writeEntry(cacheDir, 'entry-c', 400, expireAt + 3)
    await writeEntry(cacheDir, 'entry-d', 400, expireAt + 4)

    // Init LRU with 1500 byte limit (less than 1600 current total)
    const lru = await getOrInitDiskLRU(cacheDir, 1500, initEntries, rmEntry)

    // entry-a should have been evicted (oldest)
    expect(lru.has('entry-a')).toBe(false)
    expect(lru.has('entry-b')).toBe(true)
    expect(lru.has('entry-c')).toBe(true)
    expect(lru.has('entry-d')).toBe(true)

    // Verify disk eviction (fire-and-forget, so wait a tick)
    await setTimeout(100)
    const contents = await promises.readdir(cacheDir)
    expect(contents).toEqual(['entry-b', 'entry-c', 'entry-d'])
  })

  it('should evict old entries when new entries are set', async () => {
    const lru = await getOrInitDiskLRU(cacheDir, 1000, initEntries, rmEntry)

    // Add entries via LRU set (simulating what ImageOptimizerCache.set does)
    await writeEntry(cacheDir, 'new-a', 400)
    await writeEntry(cacheDir, 'new-b', 400)
    lru.set('new-a', 400)
    lru.set('new-b', 400)

    // Both should exist
    expect(lru.has('new-a')).toBe(true)
    expect(lru.has('new-b')).toBe(true)

    // Adding a third entry should evict the oldest (new-a)
    await writeEntry(cacheDir, 'new-c', 400)
    lru.set('new-c', 400)

    expect(lru.has('new-a')).toBe(false)
    expect(lru.has('new-b')).toBe(true)
    expect(lru.has('new-c')).toBe(true)

    // Verify disk eviction (fire-and-forget, wait a tick)
    await setTimeout(100)
    const contents = await promises.readdir(cacheDir)
    expect(contents).toEqual(['new-b', 'new-c'])
  })

  it('should promote entries on get() to prevent eviction', async () => {
    const lru = await getOrInitDiskLRU(cacheDir, 1000, initEntries, rmEntry)

    await writeEntry(cacheDir, 'x', 400)
    await writeEntry(cacheDir, 'y', 400)
    lru.set('x', 400)
    lru.set('y', 400)

    // Access 'x' to promote it (mark as recently used)
    lru.get('x')

    // Add 'z' - should evict 'y' (least recently used) instead of 'x'
    await writeEntry(cacheDir, 'z', 400)
    lru.set('z', 400)

    expect(lru.has('x')).toBe(true)
    expect(lru.has('y')).toBe(false)
    expect(lru.has('z')).toBe(true)
  })

  it('should return the same LRU instance on subsequent calls', async () => {
    const lru1 = await getOrInitDiskLRU(cacheDir, 1000, initEntries, rmEntry)
    const lru2 = await getOrInitDiskLRU(cacheDir, 1000, initEntries, rmEntry)
    expect(lru1 === lru2).toBeTrue()
  })

  it('should deduplicate concurrent init calls', async () => {
    const [lru1, lru2] = await Promise.all([
      getOrInitDiskLRU(cacheDir, 1000, initEntries, rmEntry),
      getOrInitDiskLRU(cacheDir, 1000, initEntries, rmEntry),
    ])
    expect(lru1 === lru2).toBeTrue()
  })

  it('should handle empty cache directory', async () => {
    const lru = await getOrInitDiskLRU(cacheDir, 1000, initEntries, rmEntry)
    expect(lru.size).toBe(0)
  })

  it('should handle non-existent cache directory', async () => {
    const missing = join(cacheDir, 'this-does-not-exist')
    const lru = await getOrInitDiskLRU(missing, 1000, initEntries, rmEntry)
    expect(lru.size).toBe(0)
  })

  it('should skip a 0-byte entry instead of poisoning the singleton', async () => {
    // A 0-byte (empty/corrupt) cache file yields a size-0 entry. `LRUCache.set()`
    // rejects sizes <= 0, which previously threw during init and permanently
    // rejected the cached singleton promise, breaking the disk cache.
    const expireAt = Date.now() + 60_000
    await writeEntry(cacheDir, 'valid-a', 400, expireAt + 1)
    await writeEntry(cacheDir, 'empty', 0, expireAt + 2)
    await writeEntry(cacheDir, 'valid-b', 400, expireAt + 3)

    // Init must resolve (not reject) and simply skip the 0-byte entry.
    const lru = await getOrInitDiskLRU(cacheDir, 1500, initEntries, rmEntry)

    expect(lru.has('empty')).toBe(false)
    expect(lru.has('valid-a')).toBe(true)
    expect(lru.has('valid-b')).toBe(true)
  })

  it('should return a cache HIT without waiting for the full disk scan', async () => {
    // Regression test for vercel/next.js#100179: after a server restart,
    // every /_next/image cache HIT waited for the full `.next/cache/images`
    // scan that builds the disk LRU, because `ImageOptimizerCache.get()`
    // awaited the LRU promise just to mark the entry as recently used.
    // A HIT must be returned as soon as it has been read from disk.
    //
    // A FIFO stands in for a cache entry whose full read is arbitrarily
    // slow (e.g. a very large file on a slow disk): the old init read
    // every file's contents, so opening the FIFO blocked the scan — and
    // therefore every `get()` — forever. The fixed init only stats files
    // (which never blocks on a FIFO), and `get()` no longer awaits init.
    if (process.platform === 'win32') {
      // `mkfifo` is not available on Windows.
      return
    }
    const distDir = await promises.mkdtemp(
      join(tmpdir(), 'next-image-hit-test-')
    )
    try {
      const imagesDir = join(distDir, 'cache', 'images')
      await promises.mkdir(imagesDir, { recursive: true })

      const expireAt = Date.now() + 60_000
      const buffer = Buffer.alloc(1024, 0x42)
      await writeImageCacheEntry(imagesDir, 'hit-key', buffer, expireAt)

      const fifoDir = join(imagesDir, 'fifo-key')
      await promises.mkdir(fifoDir, { recursive: true })
      execFileSync('mkfifo', [
        join(fifoDir, `60.${expireAt}.etag.upstreamEtag.png`),
      ])

      const nextConfig = {
        images: {
          maximumDiskCacheSize: 1_000_000_000,
          minimumCacheTTL: 60,
        },
        experimental: { isrFlushToDisk: true },
      } as unknown as NextConfigRuntime

      const cache = new ImageOptimizerCache({
        distDir,
        nextConfig,
        cacheHandler: undefined,
      })

      // The FIFO blocks any full-content scan, so this only resolves
      // promptly if `get()` does not wait for LRU initialization.
      const abort = new AbortController()
      const timeoutPromise = setTimeout(5000, undefined, {
        signal: abort.signal,
      })
        .then(() => 'TIMEOUT' as const)
        .catch(() => 'ABORTED' as const)
      const result = await Promise.race([cache.get('hit-key'), timeoutPromise])
      abort.abort()

      expect(result).not.toBe('TIMEOUT')
      expect(result).not.toBe('ABORTED')
      expect(result).not.toBeNull()
      if (result !== null && typeof result === 'object') {
        expect(result.value.kind).toBe(CachedRouteKind.IMAGE)
        if (result.value.kind === CachedRouteKind.IMAGE) {
          expect(result.value.buffer).toEqual(buffer)
        }
      }
    } finally {
      resetDiskLRU()
      await promises.rm(distDir, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 500,
      })
    }
  })
})
