import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import FileSystemCache from 'next/dist/server/lib/incremental-cache/file-system-cache'
import { nodeFs } from 'next/dist/server/lib/node-fs-methods'
import {
  CachedRouteKind,
  IncrementalCacheKind,
} from 'next/dist/server/response-cache'
import type { CacheFs } from 'next/dist/shared/lib/utils'
import { waitFor } from 'next-test-utils'

const cacheDir = fileURLToPath(new URL('./cache', import.meta.url))

describe('FileSystemCache clock', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  // areTagsExpired compares with the monotonic clock. Entries and revalidations
  // must be stamped with it too: a wall clock running ahead would date them in
  // the future, so an entry set before a revalidation looks newer than it.
  it.each([0, 50, 1000])(
    'expires an entry set before its tag was revalidated, with the wall clock %d ms ahead',
    async (wallClockAheadMs) => {
      const wallClock = Date.now
      jest
        .spyOn(Date, 'now')
        .mockImplementation(() => wallClock.call(Date) + wallClockAheadMs)
      const fsCache = new FileSystemCache({
        _requestHeaders: {},
        flushToDisk: false,
        fs: nodeFs,
        serverDistDir: cacheDir,
        revalidatedTags: [],
        maxMemoryCacheSize: 1024 * 1024,
      })
      const key = `/wall-clock-${wallClockAheadMs}`
      const tag = `wall-clock-${wallClockAheadMs}`

      await fsCache.set(
        key,
        {
          kind: CachedRouteKind.APP_PAGE,
          html: 'old',
          rscData: undefined,
          headers: { 'x-next-cache-tags': tag },
          postponed: undefined,
          status: 200,
          segmentData: undefined,
        },
        { isRoutePPREnabled: false, isFallback: false }
      )
      // Both timestamps are whole milliseconds: revalidate in a later one.
      await waitFor(2)
      await fsCache.revalidateTag(tag, { expire: 0 })

      expect(
        await fsCache.get(key, {
          kind: IncrementalCacheKind.APP_PAGE,
          isRoutePPREnabled: false,
          isFallback: false,
        })
      ).toBeNull()
    }
  )

  // Without the memory cache, every read comes from disk, where file mtimes
  // are wall-clock time. Entries must keep their monotonic stamp on disk too.
  describe('entries read back from disk', () => {
    // The fetch cache lives next to serverDistDir, so both go in one temp dir.
    let rootDir: string
    let serverDistDir: string
    // The memory cache is shared by every FileSystemCache in a module instance
    // and stays on once a cache enables it, so these tests load their own.
    let DiskFileSystemCache: typeof FileSystemCache

    beforeEach(async () => {
      rootDir = await fs.mkdtemp(join(tmpdir(), 'next-fs-cache-clock-'))
      serverDistDir = join(rootDir, 'server')
      jest.isolateModules(() => {
        DiskFileSystemCache = jest.requireActual<{
          default: typeof FileSystemCache
        }>('next/dist/server/lib/incremental-cache/file-system-cache').default
      })
    })

    afterEach(async () => {
      await fs.rm(rootDir, { recursive: true, force: true })
    })

    // Dates every mtime the cache reads, like a wall clock running ahead.
    function createCache(wallClockAheadMs: number) {
      const fsImpl: CacheFs = {
        ...nodeFs,
        stat: async (f) => {
          const { mtime } = await nodeFs.stat(f)
          return { mtime: new Date(mtime.getTime() + wallClockAheadMs) }
        },
      }
      return new DiskFileSystemCache({
        _requestHeaders: {},
        flushToDisk: true,
        fs: fsImpl,
        serverDistDir,
        revalidatedTags: [],
        maxMemoryCacheSize: 0,
      })
    }

    const entries = [
      {
        kind: 'APP_PAGE',
        value: (tag: string) => ({
          kind: CachedRouteKind.APP_PAGE as const,
          html: 'old',
          rscData: Buffer.from('old'),
          headers: { 'x-next-cache-tags': tag },
          postponed: undefined,
          status: 200,
          segmentData: undefined,
        }),
        setContext: () => ({ isRoutePPREnabled: false, isFallback: false }),
        getContext: () => ({
          kind: IncrementalCacheKind.APP_PAGE as const,
          isRoutePPREnabled: false,
          isFallback: false,
        }),
      },
      {
        kind: 'APP_ROUTE',
        value: (tag: string) => ({
          kind: CachedRouteKind.APP_ROUTE as const,
          body: Buffer.from('old'),
          headers: { 'x-next-cache-tags': tag },
          status: 200,
        }),
        setContext: () => ({}),
        getContext: () => ({
          kind: IncrementalCacheKind.APP_ROUTE as const,
          isFallback: false,
        }),
      },
      {
        kind: 'FETCH',
        value: () => ({
          kind: CachedRouteKind.FETCH as const,
          data: { headers: {}, body: 'old', status: 200, url: '' },
          revalidate: 3600,
        }),
        setContext: (tag: string) => ({
          fetchCache: true as const,
          tags: [tag],
        }),
        getContext: (tag: string) => ({
          kind: IncrementalCacheKind.FETCH as const,
          tags: [tag],
          softTags: [],
        }),
      },
    ]

    it.each(
      entries.flatMap((entry) =>
        [0, 50, 1000].map((ms) => [entry.kind, ms, entry] as const)
      )
    )(
      'expires a %s entry set before its tag was revalidated, with the wall clock %d ms ahead',
      async (_kind, wallClockAheadMs, entry) => {
        const fsCache = createCache(wallClockAheadMs)
        const key = `/disk-${entry.kind}-${wallClockAheadMs}`
        const tag = `disk-${entry.kind}-${wallClockAheadMs}`

        await fsCache.set(key, entry.value(tag), entry.setContext(tag))
        // The entry is served from disk before the revalidation.
        expect(await fsCache.get(key, entry.getContext(tag))).not.toBeNull()
        // Both timestamps are whole milliseconds: revalidate in a later one.
        await waitFor(2)
        await fsCache.revalidateTag(tag, { expire: 0 })

        expect(await fsCache.get(key, entry.getContext(tag))).toBeNull()
      }
    )

    it('keeps reading entries written without a stored timestamp', async () => {
      const fsCache = createCache(0)
      const modified = new Date(Date.now() - 60_000)
      const filePath = join(rootDir, 'cache', 'fetch-cache', 'old')
      await fs.mkdir(join(filePath, '..'), { recursive: true })
      await fs.writeFile(
        filePath,
        JSON.stringify({
          kind: CachedRouteKind.FETCH,
          data: { headers: {}, body: 'old', status: 200, url: '' },
          revalidate: 3600,
          tags: ['old'],
        })
      )
      await fs.utimes(filePath, modified, modified)

      const data = await fsCache.get('old', {
        kind: IncrementalCacheKind.FETCH,
        tags: ['old'],
        softTags: [],
      })

      expect(data?.lastModified).toBe(modified.getTime())
      expect(data?.value).not.toHaveProperty('lastModified')
    })
  })
})
