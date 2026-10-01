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
import { getRouteCacheKey } from 'next/dist/server/lib/route-cache-key'
import { RouteKind } from 'next/dist/server/route-kind'
import type { CacheFs } from 'next/dist/shared/lib/utils'

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
})

describe('FileSystemCache route-scoped build seeds', () => {
  let serverDistDir: string

  beforeEach(async () => {
    serverDistDir = await fs.mkdtemp(join(tmpdir(), 'next-route-seed-'))
  })

  afterEach(async () => {
    await fs.rm(serverDistDir, { recursive: true, force: true })
  })

  const owner = {
    kind: RouteKind.PAGES,
    sourceRoute: '/posts/[slug]',
  }
  const pathname = '/posts/first'

  async function writeSeed(options?: {
    owner?: typeof owner
    isFallback?: boolean
    modified?: Date
    headers?: Record<string, string>
  }) {
    const seedOwner = options?.owner ?? owner
    const key = getRouteCacheKey(pathname, owner)
    const base = join(serverDistDir, 'pages', 'posts', 'first')
    await fs.mkdir(join(serverDistDir, 'pages', 'posts'), { recursive: true })
    await fs.writeFile(`${base}.html`, 'build html')
    await fs.writeFile(`${base}.json`, JSON.stringify({ source: 'build' }))
    await fs.writeFile(
      `${base}.meta`,
      JSON.stringify({
        headers: options?.headers,
        routeCache: {
          key: getRouteCacheKey(pathname, seedOwner),
          owner: seedOwner,
          isFallback: options?.isFallback ?? false,
        },
      })
    )
    if (options?.modified) {
      await fs.utimes(`${base}.html`, options.modified, options.modified)
    }
    return { base, key }
  }

  function createCache(
    flushToDisk = true,
    fsImpl: CacheFs = nodeFs,
    maxMemoryCacheSize = 0
  ) {
    return new FileSystemCache({
      _requestHeaders: {},
      flushToDisk,
      fs: fsImpl,
      serverDistDir,
      revalidatedTags: [],
      maxMemoryCacheSize,
    })
  }

  const getContext = {
    kind: IncrementalCacheKind.PAGES,
    isFallback: false,
  } as const

  it('normalizes the cache root before reading and promoting a build seed', async () => {
    const { key } = await writeSeed()
    const cache = new FileSystemCache({
      _requestHeaders: {},
      flushToDisk: true,
      fs: nodeFs,
      serverDistDir: `${serverDistDir}/nested/..`,
      revalidatedTags: [],
      maxMemoryCacheSize: 0,
    })

    expect((await cache.get(key, getContext))?.value).toMatchObject({
      html: 'build html',
    })
    expect(await fs.readFile(`${join(serverDistDir, key)}.html`, 'utf8')).toBe(
      'build html'
    )
  })

  it('verifies ownership, promotes all files, and preserves seed age', async () => {
    const modified = new Date(Date.now() - 60_000)
    const { base, key } = await writeSeed({ modified })

    const first = await createCache().get(key, getContext)
    expect(first?.value).toMatchObject({
      html: 'build html',
      pageData: { source: 'build' },
    })
    expect(first?.lastModified).toBe(modified.getTime())

    const scopedBase = join(serverDistDir, key)
    expect(await fs.readFile(`${scopedBase}.html`, 'utf8')).toBe('build html')
    expect(JSON.parse(await fs.readFile(`${scopedBase}.meta`, 'utf8'))).toEqual(
      expect.objectContaining({ routeCacheLastModified: modified.getTime() })
    )

    await fs.writeFile(`${base}.html`, 'tampered seed')
    const restarted = await createCache().get(key, getContext)
    expect(restarted?.value).toMatchObject({ html: 'build html' })
    expect(restarted?.lastModified).toBe(modified.getTime())

    await createCache().set(
      key,
      {
        kind: CachedRouteKind.PAGES,
        html: 'runtime html',
        pageData: { source: 'runtime' },
        headers: undefined,
        status: undefined,
      },
      { isFallback: false }
    )
    const afterRuntimeWrite = await createCache().get(key, getContext)
    expect(afterRuntimeWrite?.value).toMatchObject({ html: 'runtime html' })
    expect(afterRuntimeWrite?.lastModified).toBeGreaterThan(modified.getTime())
    expect(afterRuntimeWrite?.lastModified).toBe(
      (await fs.stat(`${scopedBase}.html`)).mtime.getTime()
    )
    expect(
      JSON.parse(await fs.readFile(`${scopedBase}.meta`, 'utf8'))
    ).not.toHaveProperty('routeCacheLastModified')
  })

  it.each([
    ['/', '/'],
    ['/index', '/index'],
  ])(
    'verifies normalized %s without normalizing its suffix twice',
    async (requestPath, sourceRoute) => {
      const indexOwner = { kind: RouteKind.PAGES, sourceRoute }
      const key = getRouteCacheKey(requestPath, indexOwner)
      const suffix = key.slice(key.indexOf('/$/') + 2)
      const base = join(serverDistDir, 'pages', suffix)
      await fs.mkdir(join(base, '..'), { recursive: true })
      await fs.writeFile(`${base}.html`, requestPath)
      await fs.writeFile(`${base}.json`, '{}')
      await fs.writeFile(
        `${base}.meta`,
        JSON.stringify({
          routeCache: {
            key,
            owner: indexOwner,
            isFallback: false,
          },
        })
      )

      expect((await createCache().get(key, getContext))?.value).toMatchObject({
        html: requestPath,
      })
    }
  )

  it('rejects missing, wrong-owner, fallback-mismatched, and partial entries', async () => {
    const { base, key } = await writeSeed({
      owner: { ...owner, sourceRoute: '/other/[slug]' },
    })
    expect(await createCache().get(key, getContext)).toBeNull()

    await writeSeed({ isFallback: true })
    expect(await createCache().get(key, getContext)).toBeNull()

    await fs.rm(`${base}.meta`)
    expect(await createCache().get(key, getContext)).toBeNull()

    await writeSeed()
    await fs.mkdir(join(serverDistDir, key, '..'), { recursive: true })
    await fs.writeFile(`${join(serverDistDir, key)}.html`, 'partial scoped')
    expect(await createCache().get(key, getContext)).toBeNull()
  })

  it.each([false, true])(
    'promotes an owned PPR shell for an isFallback=%s lookup',
    async (isFallback) => {
      const appOwner = {
        kind: RouteKind.APP_PAGE,
        sourceRoute: '/posts/[slug]/page',
      }
      const key = getRouteCacheKey('/posts/[slug]', appOwner)
      const base = join(serverDistDir, 'app', 'posts', '[slug]')
      await fs.mkdir(join(base, '..'), { recursive: true })
      await fs.writeFile(`${base}.html`, 'build shell')
      await fs.writeFile(
        `${base}.meta`,
        JSON.stringify({
          postponed: 'postponed data',
          routeCache: { key, owner: appOwner, isFallback: true },
        })
      )
      const context = {
        kind: IncrementalCacheKind.APP_PAGE,
        isRoutePPREnabled: true,
        isFallback,
      } as const

      const otherKey = getRouteCacheKey('/posts/[slug]', {
        ...appOwner,
        sourceRoute: '/[...slug]/page',
      })
      expect(await createCache().get(otherKey, context)).toBeNull()
      expect((await createCache().get(key, context))?.value).toMatchObject({
        html: 'build shell',
        postponed: 'postponed data',
      })

      await fs.rm(`${base}.html`)
      expect((await createCache().get(key, context))?.value).toMatchObject({
        html: 'build shell',
        postponed: 'postponed data',
      })
    }
  )

  it('serves read-only seeds without creating a scoped entry', async () => {
    const { key } = await writeSeed()
    expect(
      (await createCache(false).get(key, getContext))?.value
    ).toMatchObject({ html: 'build html' })
    await expect(fs.stat(`${join(serverDistDir, key)}.html`)).rejects.toThrow()
  })

  it('serves seeds without durable promotion when atomic writes are unavailable', async () => {
    const { key } = await writeSeed()
    const { writeFileAtomic: _writeFileAtomic, ...fsWithoutAtomic } = nodeFs

    expect(
      (await createCache(true, fsWithoutAtomic).get(key, getContext))?.value
    ).toMatchObject({ html: 'build html' })
    await expect(fs.stat(`${join(serverDistDir, key)}.html`)).rejects.toThrow()
  })

  it('does not promote an invalidated seed', async () => {
    const { key } = await writeSeed({
      headers: { 'x-next-cache-tags': 'invalidated-seed' },
      modified: new Date(Date.now() - 60_000),
    })
    const cache = createCache()
    await cache.revalidateTag('invalidated-seed')

    expect(await cache.get(key, getContext)).toBeNull()
    await expect(fs.stat(`${join(serverDistDir, key)}.html`)).rejects.toThrow()
  })

  it('keeps serving the seed when promotion fails before publication', async () => {
    const { key } = await writeSeed()
    const scopedMeta = `${join(serverDistDir, key)}.meta`
    const failingFs: CacheFs = {
      ...nodeFs,
      writeFile: async (...args: Parameters<typeof nodeFs.writeFile>) => {
        if (args[0] === scopedMeta) throw new Error('injected meta failure')
        return nodeFs.writeFile(...args)
      },
    }
    const cache = createCache(true, failingFs)

    expect((await cache.get(key, getContext))?.value).toMatchObject({
      html: 'build html',
    })
    expect((await cache.get(key, getContext))?.value).toMatchObject({
      html: 'build html',
    })
    await expect(fs.stat(`${join(serverDistDir, key)}.html`)).rejects.toThrow()
  })

  it('does not start writes before all promotion source reads succeed', async () => {
    const { base, key } = await writeSeed()
    let jsonReads = 0
    const failingFs: CacheFs = {
      ...nodeFs,
      readFile: (async (...args: Parameters<typeof nodeFs.readFile>) => {
        if (args[0] === `${base}.json` && ++jsonReads === 2) {
          throw new Error('injected second-read failure')
        }
        return nodeFs.readFile(...args)
      }) as typeof nodeFs.readFile,
    }

    expect(
      (await createCache(true, failingFs).get(key, getContext))?.value
    ).toMatchObject({ html: 'build html' })
    await expect(fs.stat(`${join(serverDistDir, key)}.html`)).rejects.toThrow()
    expect((await createCache().get(key, getContext))?.value).toMatchObject({
      html: 'build html',
    })
  })

  it('waits for atomic primary publication before another get reads disk', async () => {
    const { key } = await writeSeed()
    let releasePublication!: () => void
    let markPublicationStarted!: () => void
    const publicationStarted = new Promise<void>((resolve) => {
      markPublicationStarted = resolve
    })
    const publicationGate = new Promise<void>((resolve) => {
      releasePublication = resolve
    })
    const suspendedFs: CacheFs = {
      ...nodeFs,
      writeFileAtomic: async (
        ...args: Parameters<NonNullable<typeof nodeFs.writeFileAtomic>>
      ) => {
        markPublicationStarted()
        await publicationGate
        return nodeFs.writeFileAtomic!(...args)
      },
    }
    const cache = createCache(true, suspendedFs)
    const first = cache.get(key, getContext)
    await publicationStarted

    let secondSettled = false
    const second = cache.get(key, getContext).finally(() => {
      secondSettled = true
    })
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(secondSettled).toBe(false)

    releasePublication()
    await expect(first).resolves.toMatchObject({
      value: { html: 'build html' },
    })
    await expect(second).resolves.toMatchObject({
      value: { html: 'build html' },
    })
    expect(await fs.readFile(`${join(serverDistDir, key)}.html`, 'utf8')).toBe(
      'build html'
    )
  })

  it('does not expose a partial temporary primary after atomic publication fails', async () => {
    const { key } = await writeSeed()
    const partialFs: CacheFs = {
      ...nodeFs,
      writeFileAtomic: async (
        ...args: Parameters<NonNullable<typeof nodeFs.writeFileAtomic>>
      ) => {
        const [target, data] = args
        await fs.writeFile(
          `${target}.partial`,
          Buffer.from(data).subarray(0, 2)
        )
        throw new Error('injected partial temporary write')
      },
    }
    const cache = createCache(true, partialFs)

    expect((await cache.get(key, getContext))?.value).toMatchObject({
      html: 'build html',
    })
    expect((await cache.get(key, getContext))?.value).toMatchObject({
      html: 'build html',
    })
    await expect(fs.stat(`${join(serverDistDir, key)}.html`)).rejects.toThrow()
  })

  it('does not let an older seed promotion replace a concurrent runtime set', async () => {
    const { base, key } = await writeSeed()
    let releaseRead!: () => void
    let markReadStarted!: () => void
    const readStarted = new Promise<void>((resolve) => {
      markReadStarted = resolve
    })
    const readGate = new Promise<void>((resolve) => {
      releaseRead = resolve
    })
    const suspendedFs: CacheFs = {
      ...nodeFs,
      readFile: (async (...args: Parameters<typeof nodeFs.readFile>) => {
        if (args[0] === `${base}.html`) {
          markReadStarted()
          await readGate
        }
        return nodeFs.readFile(...args)
      }) as typeof nodeFs.readFile,
    }
    const cache = createCache(true, suspendedFs, 1024)
    const seedRead = cache.get(key, getContext)
    await readStarted
    await cache.set(
      key,
      {
        kind: CachedRouteKind.PAGES,
        html: 'runtime html',
        pageData: { source: 'runtime' },
        headers: undefined,
        status: undefined,
      },
      { isFallback: false }
    )
    releaseRead()
    expect((await seedRead)?.value).toMatchObject({ html: 'build html' })
    expect((await cache.get(key, getContext))?.value).toMatchObject({
      html: 'runtime html',
      pageData: { source: 'runtime' },
    })
    expect(await fs.readFile(`${join(serverDistDir, key)}.html`, 'utf8')).toBe(
      'runtime html'
    )
  })

  it('keeps an in-memory negative entry authoritative over a build seed', async () => {
    const { key } = await writeSeed()
    const cache = new FileSystemCache({
      _requestHeaders: {},
      flushToDisk: true,
      fs: nodeFs,
      serverDistDir,
      revalidatedTags: [],
      maxMemoryCacheSize: 1024,
    })
    await cache.set(key, null, { isFallback: false })

    expect((await cache.get(key, getContext))?.value).toBeNull()
    await expect(fs.stat(`${join(serverDistDir, key)}.html`)).rejects.toThrow()
  })
})
