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

  it('keeps the previous fetch cache entry readable while writing an update', async () => {
    const serverDistDir = await fs.mkdtemp(
      join(tmpdir(), 'next-file-system-cache-')
    )
    let delayWrites = false
    let resolveWriteStarted!: () => void
    let releaseWrite!: () => void
    const writeStarted = new Promise<void>((resolve) => {
      resolveWriteStarted = resolve
    })
    const writeReleased = new Promise<void>((resolve) => {
      releaseWrite = resolve
    })
    const delayedFs = {
      ...nodeFs,
      writeFile: async (filePath: string, data: string) => {
        if (!delayWrites) {
          await nodeFs.writeFile(filePath, data)
          return
        }

        await nodeFs.writeFile(filePath, '')
        resolveWriteStarted()
        await writeReleased
        await nodeFs.writeFile(filePath, data)
      },
    }
    const fsCache = new FileSystemCache({
      _requestHeaders: {},
      flushToDisk: true,
      fs: delayedFs,
      serverDistDir,
      revalidatedTags: [],
      maxMemoryCacheSize: 0,
    })
    let write: Promise<void> | undefined

    try {
      await fsCache.set(
        'fetch-cache',
        {
          kind: CachedRouteKind.FETCH,
          data: { headers: {}, body: 'old', status: 200, url: '' },
          revalidate: 30,
        },
        { fetchCache: true, tags: [] }
      )

      delayWrites = true
      write = fsCache.set(
        'fetch-cache',
        {
          kind: CachedRouteKind.FETCH,
          data: { headers: {}, body: 'new', status: 200, url: '' },
          revalidate: 30,
        },
        { fetchCache: true, tags: [] }
      )
      await writeStarted

      const entry = await fsCache.get('fetch-cache', {
        kind: IncrementalCacheKind.FETCH,
        tags: [],
      })

      expect(entry?.value).toMatchObject({
        kind: CachedRouteKind.FETCH,
        data: { body: 'old' },
      })

      releaseWrite()
      await write
    } finally {
      releaseWrite()
      await write
      await fs.rm(serverDistDir, { recursive: true, force: true })
    }
  })
})
