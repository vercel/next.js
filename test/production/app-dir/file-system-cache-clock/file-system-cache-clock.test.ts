import { nextTestSetup } from 'e2e-utils'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'

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
      next.env.DATA_SERVICE_URL = `http://127.0.0.1:${port}/`
      await next.start()
    })

    async function getData(pathname: string) {
      if (pathname.startsWith('/route/')) {
        const res = await next.fetch(pathname)
        expect(res.status).toBe(200)
        return res.text()
      }
      const $ = await next.render$(pathname)
      return $('#data').text()
    }

    async function revalidate() {
      const res = await next.fetch('/revalidate', { method: 'POST' })
      expect(res.status).toBe(200)
      await res.text()
    }

    it.each([
      ['an ISR page', '/static/a'],
      ['an ISR route handler', '/route/a'],
      ['a dynamic page', '/dynamic'],
    ])(
      'serves fresh data for %s right after revalidateTag',
      async (_name, pathname) => {
        // The first request renders and caches the entry at runtime.
        const cached = await getData(pathname)
        expect(await getData(pathname)).toBe(cached)

        await revalidate()
        expect(await getData(pathname)).not.toBe(cached)
      }
    )

    it('reads a fetch cache entry written without a stored timestamp', async () => {
      const cached = await getData('/dynamic')
      await next.stop()

      // Find the entry by its cached value, then rewrite it in the format
      // written before timestamps were stored, with an earlier mtime.
      const fetchCacheDir = join(next.testDir, '.next/cache/fetch-cache')
      const entries = await Promise.all(
        (await fs.readdir(fetchCacheDir)).map(async (file) => {
          const filePath = join(fetchCacheDir, file)
          return { filePath, content: await fs.readFile(filePath, 'utf8') }
        })
      )
      const matches = entries.filter(({ content }) => {
        const data = JSON.parse(content).data
        return data && Buffer.from(data.body, 'base64').toString() === cached
      })
      expect(matches).toHaveLength(1)
      const [{ filePath, content }] = matches
      const { lastModified, ...entry } = JSON.parse(content)
      expect(typeof lastModified).toBe('number')
      await fs.writeFile(filePath, JSON.stringify(entry))
      const modified = new Date(Date.now() - 60_000)
      await fs.utimes(filePath, modified, modified)

      await next.start({ skipBuild: true })

      expect(await getData('/dynamic')).toBe(cached)
      await revalidate()
      expect(await getData('/dynamic')).not.toBe(cached)
      // The fresh value was written in the new format.
      expect(
        JSON.parse(await fs.readFile(filePath, 'utf8')).lastModified
      ).toEqual(expect.any(Number))
    })
  })
})
