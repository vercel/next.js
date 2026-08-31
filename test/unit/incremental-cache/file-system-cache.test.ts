import { promises as fs } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import FileSystemCache from 'next/dist/server/lib/incremental-cache/file-system-cache'
import { nodeFs } from 'next/dist/server/lib/node-fs-methods'
import {
  CachedRouteKind,
  IncrementalCacheKind,
} from 'next/dist/server/response-cache'

jest.mock('next/dist/compiled/lru-cache')
import LRUCache from 'next/dist/compiled/lru-cache'

const cacheDir = fileURLToPath(new URL('./cache', import.meta.url)),
  tagsManifestPath = join(cacheDir, 'fetch-cache', 'tags-manifest.json')

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
    expect(LRUCache).not.toHaveBeenCalled()
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

  it('revalidate timestamp', async () => {
    const timestamp = Date.now() - 10,
      key = 'unstable-cache'
    await fs.writeFile(
      tagsManifestPath,
      JSON.stringify({
        version: 1,
        items: {
          [key]: { revalidatedAt: timestamp },
        },
      })
    )
    await fsCache.revalidateTag(key)
    const tagsManifest = (await fs.readFile(tagsManifestPath)).toString()
    expect(JSON.parse(tagsManifest).items[key].revalidatedAt).toBeGreaterThan(
      timestamp
    )
  })
})

describe('page cache', () => {
  it('should cache page type in file-system', async () => {
    jest.resetAllMocks()

    const timeStampBeforeCache = Date.now(),
      fsCache = new FileSystemCache({
        _appDir: true,
        _pagesDir: true,
        _requestHeaders: {},
        flushToDisk: true,
        fs: nodeFs,
        serverDistDir: cacheDir,
        revalidatedTags: [],
        experimental: {
          ppr: false,
        },
        maxMemoryCacheSize: 5,
      }),
      pageKey = 'page-cache'

    await fsCache.set(
      pageKey,
      {
        kind: 'PAGE',
        html: '<p>hello</p>',
        pageData: {},
        headers: {},
        postponed: undefined,
        status: 200,
      },
      {
        fetchCache: true,
        revalidate: 30,
        fetchUrl: 'http://my-api.local',
        fetchIdx: 5,
        tags: [pageKey],
      }
    )

    const pagesPath = (filename: string) => join(cacheDir, 'pages', filename),
      html = await fs.readFile(pagesPath(`${pageKey}.html`)),
      pageData = await fs.readFile(pagesPath(`${pageKey}.json`)),
      metadata = await fs.readFile(pagesPath(`${pageKey}.meta`)),
      fileTimestamp = (
        await fs.stat(pagesPath(`${pageKey}.html`))
      ).mtime.getTime()

    expect(html.toString()).toEqual('<p>hello</p>')
    expect(pageData.toString()).toEqual('{}')
    expect(metadata.toString()).toEqual('{"headers":{},"status":200}')

    // ensure the file created is newer than the timestamp before initialization
    expect(fileTimestamp).toBeGreaterThan(timeStampBeforeCache)

    // ensure lru-cache API is triggered
    expect(LRUCache).toHaveBeenCalledTimes(1)
    expect(LRUCache.mock.instances[0].set).toHaveBeenCalledTimes(1)
  })
})
