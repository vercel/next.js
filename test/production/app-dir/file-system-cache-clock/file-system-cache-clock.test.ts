import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { load } from 'cheerio'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { getRouteCacheKey } from 'next/dist/server/lib/route-cache-key'
import { RouteKind } from 'next/dist/server/route-kind'

// Tag revalidations and cache entries must be dated with the same clock as
// the expiry check, including entries read back from disk. Instrumentation
// puts the monotonic clock behind the wall clock, so an entry dated with
// Date.now() or a file mtime would look newer than a later revalidation.
describe('file-system-cache-clock', () => {
  // Returns a new value on every request, so a cached value is recognizable.
  let version = 0
  const service = createServer((req, res) => {
    res.end(`${req.url} ${++version}`)
  })

  beforeAll(async () => {
    await new Promise<void>((resolve) =>
      service.listen(0, '127.0.0.1', resolve)
    )
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      service.close((err) => (err ? reject(err) : resolve()))
    )
  })

  describe.each([
    ['the default memory cache', undefined],
    ['cacheMaxMemorySize: 0', '0'],
  ])('with %s', (_name, cacheMaxMemorySize) => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      env: {
        TIME_ORIGIN_OFFSET_MS: '60000',
        ...(cacheMaxMemorySize !== undefined && {
          CACHE_MAX_MEMORY_SIZE: cacheMaxMemorySize,
        }),
      },
    })

    beforeAll(async () => {
      const { port } = service.address() as AddressInfo
      next.env.DATA_SERVICE_URL = `http://127.0.0.1:${port}`
      await next.start()
    })

    async function request(pathname: string) {
      const res = await next.fetch(pathname)
      expect(res.status).toBe(200)
      const body = await res.text()
      return {
        cache: res.headers.get('x-nextjs-cache'),
        data: pathname.startsWith('/route/')
          ? body
          : load(body)('#data').text(),
      }
    }

    async function getData(pathname: string) {
      return (await request(pathname)).data
    }

    // Wait for the expected fetch value to reach disk. Dynamic fetch-cache
    // writes can finish after the HTTP response.
    async function waitForFetchEntry(value: string) {
      return retry(async () => {
        const fetchCacheDir = join(next.testDir, '.next/cache/fetch-cache')
        const entries = await Promise.all(
          (await fs.readdir(fetchCacheDir)).map(async (file) => {
            const filePath = join(fetchCacheDir, file)
            return {
              filePath,
              entry: JSON.parse(await fs.readFile(filePath, 'utf8')),
            }
          })
        )
        const matches = entries.filter(({ entry }) => {
          const data = entry.data
          return data && Buffer.from(data.body, 'base64').toString() === value
        })
        expect(matches).toHaveLength(1)
        const [match] = matches
        expect(match.entry.lastModified).toEqual(expect.any(Number))
        return match
      })
    }

    // The response cache entry of the ISR page, as written by the default
    // file-system cache handler.
    async function readPageEntry(pathname: string) {
      const key = getRouteCacheKey(pathname, {
        kind: RouteKind.APP_PAGE,
        sourceRoute: '/static/[slug]/page',
      })
      return fs.readFile(
        join(next.testDir, '.next/server', `${key}.html`),
        'utf8'
      )
    }

    async function revalidate() {
      const res = await next.fetch('/revalidate', { method: 'POST' })
      expect(res.status).toBe(200)
      await res.text()
    }

    // Only the "build" slug is prerendered, so this entry is written at
    // runtime.
    it('serves fresh data for an ISR page right after revalidateTag', async () => {
      const pathname = '/static/runtime'
      const rendered = await request(pathname)
      expect(rendered.data).toStartWith(`${pathname} `)

      // The page has its own response cache entry, so the assertions below do
      // not pass through fetch caching alone.
      expect(await readPageEntry(pathname)).toContain(rendered.data)
      const cached = await request(pathname)
      expect(cached.data).toBe(rendered.data)
      expect(cached.cache).toBe('HIT')

      await revalidate()
      const fresh = await request(pathname)
      expect(fresh.cache).toBe('MISS')
      expect(fresh.data).toStartWith(`${pathname} `)
      expect(fresh.data).not.toBe(rendered.data)
      expect(await readPageEntry(pathname)).toContain(fresh.data)
    })

    it('serves fresh data for an ISR route handler right after revalidateTag', async () => {
      const pathname = '/route/runtime'
      const rendered = await request(pathname)
      expect(rendered.data).toStartWith(`${pathname} `)
      expect(await request(pathname)).toEqual({
        cache: 'HIT',
        data: rendered.data,
      })

      await revalidate()
      const fresh = await request(pathname)
      expect(fresh.cache).toBe('MISS')
      expect(fresh.data).toStartWith(`${pathname} `)
      expect(fresh.data).not.toBe(rendered.data)
    })

    it('serves fresh data for a dynamic page right after revalidateTag', async () => {
      const cached = await getData('/dynamic')
      expect(cached).toStartWith('/dynamic ')
      await waitForFetchEntry(cached)
      expect(await getData('/dynamic')).toBe(cached)

      await revalidate()
      const fresh = await getData('/dynamic')
      expect(fresh).toStartWith('/dynamic ')
      expect(fresh).not.toBe(cached)
      await waitForFetchEntry(fresh)
    })

    it('reads a fetch cache entry written without a stored timestamp', async () => {
      const cached = await getData('/dynamic')
      expect(cached).toStartWith('/dynamic ')
      const { filePath, entry } = await waitForFetchEntry(cached)
      await next.stop()

      // Rewrite the entry in the format used before timestamps were stored,
      // with an earlier mtime.
      delete entry.lastModified
      await fs.writeFile(filePath, JSON.stringify(entry))
      const modified = new Date(Date.now() - 60_000)
      await fs.utimes(filePath, modified, modified)

      await next.start({ skipBuild: true })

      expect(await getData('/dynamic')).toBe(cached)
      await revalidate()
      const fresh = await getData('/dynamic')
      expect(fresh).not.toBe(cached)
      // The fresh value was written in the new format.
      await waitForFetchEntry(fresh)
    })
  })
})
