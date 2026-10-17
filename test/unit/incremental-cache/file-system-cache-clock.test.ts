import { fileURLToPath } from 'node:url'
import FileSystemCache from 'next/dist/server/lib/incremental-cache/file-system-cache'
import { nodeFs } from 'next/dist/server/lib/node-fs-methods'
import {
  CachedRouteKind,
  IncrementalCacheKind,
} from 'next/dist/server/response-cache'
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
})
