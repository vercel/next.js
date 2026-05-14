import { getOrInitDiskLRU, resetDiskLRU } from './disk-lru-cache.external'

// Helpers to build mock callbacks — no fs access needed when maxDiskSize is provided.
const makeReadEntries =
  (
    entries: Array<{ key: string; size: number; expireAt: number }>
  ): Parameters<typeof getOrInitDiskLRU>[2] =>
  async () =>
    entries

const makeEvict = (): Parameters<typeof getOrInitDiskLRU>[3] =>
  jest.fn().mockResolvedValue(undefined)

// maxDiskSize large enough that no evictions happen during init replay.
const MAX = 100 * 1024 * 1024 // 100 MB

describe('getOrInitDiskLRU', () => {
  beforeEach(() => {
    resetDiskLRU()
  })

  afterEach(() => {
    resetDiskLRU()
    jest.restoreAllMocks()
  })

  it('initialises the LRU with valid entries', async () => {
    const entries = [
      { key: 'img-a', size: 1024, expireAt: Date.now() + 60_000 },
      { key: 'img-b', size: 2048, expireAt: Date.now() + 60_000 },
    ]
    const lru = await getOrInitDiskLRU(
      '/cache',
      MAX,
      makeReadEntries(entries),
      makeEvict()
    )

    expect(lru.has('img-a')).toBe(true)
    expect(lru.has('img-b')).toBe(true)
  })

  it('skips a 0-byte (size=0) entry and warns instead of poisoning the singleton', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

    const entries = [
      { key: 'corrupt', size: 0, expireAt: Date.now() + 60_000 },
      { key: 'valid', size: 512, expireAt: Date.now() + 60_000 },
    ]
    const lru = await getOrInitDiskLRU(
      '/cache',
      MAX,
      makeReadEntries(entries),
      makeEvict()
    )

    // Corrupt entry must be skipped — not present in the LRU.
    expect(lru.has('corrupt')).toBe(false)
    // Valid entry must still be loaded.
    expect(lru.has('valid')).toBe(true)
    // A warning must be emitted identifying the bad entry.
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('corrupt')
    )
  })

  it('leaves the singleton functional after skipping a 0-byte entry', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {})

    const lru = await getOrInitDiskLRU(
      '/cache',
      MAX,
      makeReadEntries([{ key: 'zero', size: 0, expireAt: Date.now() + 60_000 }]),
      makeEvict()
    )

    // The singleton must not be poisoned — subsequent set() calls work fine.
    expect(() => lru.set('new-img', 4096)).not.toThrow()
    expect(lru.has('new-img')).toBe(true)
  })

  it('returns the same singleton instance on repeated calls', async () => {
    const readEntries = makeReadEntries([
      { key: 'img', size: 256, expireAt: Date.now() + 60_000 },
    ])
    const evict = makeEvict()

    const lru1 = await getOrInitDiskLRU('/cache', MAX, readEntries, evict)
    const lru2 = await getOrInitDiskLRU('/cache', MAX, readEntries, evict)

    expect(lru1).toBe(lru2)
  })

  it('handles all-corrupt entries without throwing', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {})

    const entries = [
      { key: 'bad-1', size: 0, expireAt: Date.now() + 60_000 },
      { key: 'bad-2', size: 0, expireAt: Date.now() + 60_000 },
    ]

    await expect(
      getOrInitDiskLRU('/cache', MAX, makeReadEntries(entries), makeEvict())
    ).resolves.toBeDefined()
  })
})
