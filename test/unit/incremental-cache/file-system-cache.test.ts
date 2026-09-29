import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import FileSystemCache from 'next/dist/server/lib/incremental-cache/file-system-cache'
import { nodeFs } from 'next/dist/server/lib/node-fs-methods'
import {
  CachedRouteKind,
  IncrementalCacheKind,
} from 'next/dist/server/response-cache'

const cacheDir = fileURLToPath(new URL('./cache', import.meta.url))

async function hasCacheFile(...segments: string[]) {
  try {
    await fs.access(path.join(cacheDir, ...segments))
    return true
  } catch {
    return false
  }
}

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

  it('does not write app 404 responses to disk', async () => {
    const pageKey = `missing-page-${Date.now()}`
    const routeKey = `missing-route-${Date.now()}`
    const fsCache = new FileSystemCache({
      _requestHeaders: {},
      flushToDisk: true,
      fs: nodeFs,
      serverDistDir: cacheDir,
      revalidatedTags: [],
      maxMemoryCacheSize: 0,
    })

    await fsCache.set(
      pageKey,
      {
        kind: CachedRouteKind.APP_PAGE,
        html: '<html><body>missing</body></html>',
        rscData: Buffer.from('missing'),
        headers: {},
        status: 404,
        postponed: undefined,
        segmentData: new Map([['/_tree', Buffer.from('segment')]]),
      },
      {
        cacheControl: { revalidate: 1, expire: undefined },
      }
    )

    await fsCache.set(
      routeKey,
      {
        kind: CachedRouteKind.APP_ROUTE,
        body: Buffer.from('missing'),
        headers: {},
        status: 404,
      },
      {
        cacheControl: { revalidate: 1, expire: undefined },
      }
    )

    await expect(hasCacheFile('app', `${pageKey}.html`)).resolves.toBe(false)
    await expect(hasCacheFile('app', `${pageKey}.rsc`)).resolves.toBe(false)
    await expect(hasCacheFile('app', `${pageKey}.meta`)).resolves.toBe(false)
    await expect(
      hasCacheFile('app', `${pageKey}.segments`, '_tree.segment.rsc')
    ).resolves.toBe(false)
    await expect(hasCacheFile('app', `${routeKey}.body`)).resolves.toBe(false)
    await expect(hasCacheFile('app', `${routeKey}.meta`)).resolves.toBe(false)
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
