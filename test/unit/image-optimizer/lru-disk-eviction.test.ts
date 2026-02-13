/* eslint-env jest */
import { join } from 'path'
import { promises } from 'fs'
import { tmpdir } from 'os'
import { setTimeout } from 'timers/promises'
import {
  getOrInitImageDiskLRU,
  resetImageDiskLRU,
} from 'next/dist/server/image-optimizer'

describe('LRU disk eviction', () => {
  let cacheDir: string

  beforeEach(async () => {
    cacheDir = await promises.mkdtemp(join(tmpdir(), 'next-img-lru-test-'))
    resetImageDiskLRU()
  })

  afterEach(async () => {
    resetImageDiskLRU()
    await promises.rm(cacheDir, { recursive: true, force: true })
  })

  /**
   * Helper to write a fake cache entry matching the image optimizer's format:
   * cacheDir/<cacheKey>/<maxAge>.<expireAt>.<etag>.<upstreamEtag>.<extension>
   */
  async function writeFakeCacheEntry(
    key: string,
    sizeInBytes: number,
    expireAt: number = Date.now() + 60_000,
    maxAge: number = 60
  ) {
    const dir = join(cacheDir, key)
    await promises.mkdir(dir, { recursive: true })
    const filename = `${maxAge}.${expireAt}.etag.upEtag.png`
    const buffer = Buffer.alloc(sizeInBytes, 0x42)
    await promises.writeFile(join(dir, filename), buffer)
  }

  it('should evict oldest entries on initialization', async () => {
    const expireAt = Date.now() + 60_000
    // Write 3 entries of 400 bytes each (total 1600)
    await writeFakeCacheEntry('entry-a', 400, expireAt + 1)
    await writeFakeCacheEntry('entry-b', 400, expireAt + 2)
    await writeFakeCacheEntry('entry-c', 400, expireAt + 3)
    await writeFakeCacheEntry('entry-d', 400, expireAt + 4)

    // Init LRU with 1500 byte limit (less than 1600 current total)
    const lru = await getOrInitImageDiskLRU(cacheDir, 1500)

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
    const lru = await getOrInitImageDiskLRU(cacheDir, 1000)

    // Add entries via LRU set (simulating what ImageOptimizerCache.set does)
    await writeFakeCacheEntry('new-a', 400)
    await writeFakeCacheEntry('new-b', 400)
    lru.set('new-a', 400)
    lru.set('new-b', 400)

    // Both should exist
    expect(lru.has('new-a')).toBe(true)
    expect(lru.has('new-b')).toBe(true)

    // Adding a third entry should evict the oldest (new-a)
    await writeFakeCacheEntry('new-c', 400)
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
    const lru = await getOrInitImageDiskLRU(cacheDir, 1000)

    await writeFakeCacheEntry('x', 400)
    await writeFakeCacheEntry('y', 400)
    lru.set('x', 400)
    lru.set('y', 400)

    // Access 'x' to promote it (mark as recently used)
    lru.get('x')

    // Add 'z' - should evict 'y' (least recently used) instead of 'x'
    await writeFakeCacheEntry('z', 400)
    lru.set('z', 400)

    expect(lru.has('x')).toBe(true)
    expect(lru.has('y')).toBe(false)
    expect(lru.has('z')).toBe(true)
  })

  it('should return the same LRU instance on subsequent calls', async () => {
    const lru1 = await getOrInitImageDiskLRU(cacheDir, 1000)
    const lru2 = await getOrInitImageDiskLRU(cacheDir, 1000)
    expect(lru1 === lru2).toBeTrue()
  })

  it('should deduplicate concurrent init calls', async () => {
    const [lru1, lru2] = await Promise.all([
      getOrInitImageDiskLRU(cacheDir, 1000),
      getOrInitImageDiskLRU(cacheDir, 1000),
    ])
    expect(lru1 === lru2).toBeTrue()
  })

  it('should handle empty cache directory', async () => {
    const lru = await getOrInitImageDiskLRU(cacheDir, 1000)
    expect(lru.size).toBe(0)
  })

  it('should handle non-existent cache directory', async () => {
    const nonExistent = join(cacheDir, 'this-does-not-exist')
    const lru = await getOrInitImageDiskLRU(nonExistent, 1000)
    expect(lru.size).toBe(0)
  })
})
