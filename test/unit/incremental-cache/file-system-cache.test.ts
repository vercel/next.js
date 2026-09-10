import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import FileSystemCache from 'next/dist/server/lib/incremental-cache/file-system-cache'
import { nodeFs } from 'next/dist/server/lib/node-fs-methods'
import { NEXT_CACHE_TAGS_HEADER } from 'next/dist/lib/constants'
import {
  CachedRouteKind,
  IncrementalCacheKind,
} from 'next/dist/server/response-cache'

const cacheDir = fileURLToPath(new URL('./cache', import.meta.url))

describe('FileSystemCache', () => {
  it('set image route', async () => {
    const fsCache = new FileSystemCache({
      _requestHeaders: {},
      flushToDisk: true,
      fs: nodeFs,
      serverDistDir: cacheDir,
      revalidatedTags: [],
    })

    const binary = await fs.readFile(
      fileURLToPath(new URL('./images/icon.png', import.meta.url))
    )

    await fsCache.set(
      'icon.png',
      {
        body: binary,
        headers: {
          'Content-Type': 'image/png',
        },
        status: 200,
        kind: CachedRouteKind.APP_ROUTE,
      },
      {}
    )

    expect(
      (
        await fsCache.get('icon.png', {
          kind: IncrementalCacheKind.APP_ROUTE,
          isFallback: undefined,
        })
      )?.value
    ).toEqual({
      body: binary,
      headers: {
        'Content-Type': 'image/png',
      },
      status: 200,
      kind: IncrementalCacheKind.APP_ROUTE,
    })
  })

  it('preserves expired generated PPR shells for blocking revalidation', async () => {
    const serverDistDir = await fs.mkdtemp(
      join(tmpdir(), 'next-fs-cache-expired-route-')
    )
    const tag = 'expired-route-entry'
    const fsCache = new FileSystemCache({
      _requestHeaders: {},
      flushToDisk: true,
      fs: nodeFs,
      serverDistDir,
      revalidatedTags: [],
      maxMemoryCacheSize: 0,
    })

    try {
      await fsCache.set(
        'expired-page',
        {
          kind: CachedRouteKind.APP_PAGE,
          html: 'expired page',
          rscData: undefined,
          postponed: '{}',
          headers: { [NEXT_CACHE_TAGS_HEADER]: tag },
          status: 200,
          segmentData: undefined,
        },
        {
          isRoutePPREnabled: true,
          isFallback: false,
        }
      )

      const oldDate = new Date(Date.now() - 1000)
      await fs.utimes(
        join(serverDistDir, 'app', 'expired-page.html'),
        oldDate,
        oldDate
      )
      await fsCache.revalidateTag(tag, { expire: 0 })

      const entry = await fsCache.get('expired-page', {
        kind: IncrementalCacheKind.APP_PAGE,
        isRoutePPREnabled: true,
        isFallback: false,
      })

      expect(entry).toMatchObject({
        lastModified: -1,
        value: {
          kind: CachedRouteKind.APP_PAGE,
          html: 'expired page',
        },
      })

      await fsCache.set(
        'expired-static-page',
        {
          kind: CachedRouteKind.APP_PAGE,
          html: 'expired static page',
          rscData: Buffer.from('expired static page RSC'),
          postponed: undefined,
          headers: { [NEXT_CACHE_TAGS_HEADER]: tag },
          status: 200,
          segmentData: undefined,
        },
        {
          isRoutePPREnabled: false,
          isFallback: false,
        }
      )
      await fs.utimes(
        join(serverDistDir, 'app', 'expired-static-page.html'),
        oldDate,
        oldDate
      )
      await fsCache.revalidateTag(tag, { expire: 0 })

      expect(
        await fsCache.get('expired-static-page', {
          kind: IncrementalCacheKind.APP_PAGE,
          isRoutePPREnabled: false,
          isFallback: false,
        })
      ).toBeNull()
    } finally {
      await fs.rm(serverDistDir, { recursive: true, force: true })
    }
  })
})

describe('FileSystemCache (isrMemory 0)', () => {
  const fsCache = new FileSystemCache({
    _requestHeaders: {},
    flushToDisk: true,
    fs: nodeFs,
    serverDistDir: cacheDir,
    revalidatedTags: [],
    maxMemoryCacheSize: 0, // disable memory cache
  })

  it('should cache fetch', async () => {
    await fsCache.set(
      'fetch-cache',
      {
        kind: CachedRouteKind.FETCH,
        data: {
          headers: {},
          body: 'MTcwMDA1NjM4MQ==',
          status: 200,
          url: 'http://my-api.local',
        },
        revalidate: 30,
      },
      {
        fetchCache: true,
        fetchUrl: 'http://my-api.local',
        fetchIdx: 5,
        tags: ['server-time'],
      }
    )

    const res = await fsCache.get('fetch-cache', {
      tags: ['server-time'],
      kind: IncrementalCacheKind.FETCH,
    })

    expect(res?.value).toEqual({
      kind: 'FETCH',
      data: {
        headers: {},
        body: 'MTcwMDA1NjM4MQ==',
        status: 200,
        url: 'http://my-api.local',
      },
      revalidate: 30,
      tags: ['server-time'],
    })
  })

  it('should cache unstable_cache', async () => {
    await fsCache.set(
      'unstable-cache',
      {
        kind: CachedRouteKind.FETCH,
        data: { headers: {}, body: '1700056381', status: 200, url: '' },
        revalidate: 30,
      },
      { fetchCache: true, tags: ['server-time2'] }
    )

    const res = await fsCache.get('unstable-cache', {
      tags: ['server-time'],
      kind: IncrementalCacheKind.FETCH,
    })

    expect(res?.value).toEqual({
      kind: 'FETCH',
      data: { headers: {}, body: '1700056381', status: 200, url: '' },
      revalidate: 30,
      tags: ['server-time2'],
    })
  })
})
