import { nextTestSetup } from 'e2e-utils'
import { load } from 'cheerio'
import {
  fetchViaHTTP,
  findPort,
  killApp,
  nextStart,
  retry,
} from 'next-test-utils'
import { createServer } from 'http'
import type { AddressInfo } from 'net'
import { join } from 'path'
import { getRouteCacheKey } from 'next/dist/server/lib/route-cache-key'
import { RouteKind } from 'next/dist/server/route-kind'

// An on-demand entry must retain its lifetime when read by a new process.
describe('isr-cache-control-restart', () => {
  describe.each(['default', 'custom', 'cache-components'])(
    '%s cache',
    (fixture) => {
      const { next } = nextTestSetup({
        files: join(__dirname, fixture),
      })

      it('keeps the Cache-Control and freshness of an on-demand page after a restart', async () => {
        const rendered = await next.fetch('/1')
        expect(rendered.status).toBe(200)
        expect(rendered.headers.get('x-nextjs-cache')).toBe('MISS')
        const cacheControl = rendered.headers.get('cache-control')
        expect(cacheControl).toContain('s-maxage=3600')
        expect(load(await rendered.text())('#page').text()).toBe('page 1')

        const renderedAt = performance.now()
        await next.stop()

        // The broken fallback lifetime is one second. Age the entry beyond it,
        // but keep it well within the intended one-hour lifetime.
        await retry(() => {
          expect(performance.now() - renderedAt).toBeGreaterThan(2000)
        }, 5000)

        await next.start({ skipBuild: true })

        const cached = await next.fetch('/1')
        expect(cached.status).toBe(200)
        expect(cached.headers.get('x-nextjs-cache')).toBe('HIT')
        expect(cached.headers.get('cache-control')).toBe(cacheControl)
        expect(load(await cached.text())('#page').text()).toBe('page 1')

        const repeated = await next.fetch('/1')
        expect(repeated.headers.get('x-nextjs-cache')).toBe('HIT')
        expect(repeated.headers.get('cache-control')).toBe(cacheControl)
      })
    }
  )

  describe('replacement entries shared by running instances', () => {
    const cacheKey = getRouteCacheKey('/1', {
      kind: RouteKind.APP_PAGE,
      sourceRoute: '/[id]/page',
    })
    const { next } = nextTestSetup({
      files: join(__dirname, 'cache-components'),
      skipStart: true,
    })
    let result = 'success'
    const service = createServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          message: result,
          revalidate: result === 'success' ? 3600 : 2,
        })
      )
    })
    let serverB: Awaited<ReturnType<typeof nextStart>>
    let portB: number

    beforeAll(async () => {
      await new Promise<void>((resolve) => {
        service.listen(0, '127.0.0.1', resolve)
      })
      const { port } = service.address() as AddressInfo
      next.env.CACHE_LIFE_SERVICE_URL = `http://127.0.0.1:${port}`
      await next.start()

      // Both processes use the same build and on-disk route-cache handler.
      portB = await findPort()
      serverB = await nextStart(next.testDir, portB, {
        cwd: next.testDir,
        nextBin: join(next.testDir, 'node_modules/next/dist/bin/next'),
        env: next.env,
      })
      if (!serverB) throw new Error('Server B failed to start')
    })

    afterAll(async () => {
      await killApp(serverB)
      await new Promise<void>((resolve, reject) => {
        service.close((err) => (err ? reject(err) : resolve()))
      })
    })

    it("uses the replacement entry lifetime instead of the first instance's remembered lifetime", async () => {
      const initial = await next.fetch('/1')
      expect(initial.headers.get('x-nextjs-cache')).toBe('MISS')
      expect(initial.headers.get('cache-control')).toContain('s-maxage=3600')
      expect(load(await initial.text())('#result').text()).toBe('success')

      const cacheFile = '.next/shared-cache.json'
      await retry(async () => {
        const entries = JSON.parse(await next.readFile(cacheFile))
        expect(entries[cacheKey].cacheControl.revalidate).toBe(3600)
      })

      // Evict the route directly. No revalidatePath() is used, so this does
      // not rely on the fixture handler's no-op revalidateTag(). Keep A alive.
      result = 'error'
      const entries = JSON.parse(await next.readFile(cacheFile))
      delete entries[cacheKey]
      await next.patchFile(cacheFile, JSON.stringify(entries))

      const replacement = await fetchViaHTTP(portB, '/1')
      expect(replacement.headers.get('x-nextjs-cache')).toBe('MISS')
      const cacheControl = replacement.headers.get('cache-control')
      expect(cacheControl).toContain('s-maxage=2,')
      expect(load(await replacement.text())('#result').text()).toBe('error')

      const lastModified = await retry(async () => {
        const shared = JSON.parse(await next.readFile(cacheFile))[cacheKey]
        expect(shared.cacheControl.revalidate).toBe(2)
        return shared.lastModified as number
      })

      const cached = await next.fetch('/1')
      expect(cached.headers.get('x-nextjs-cache')).toBe('HIT')
      expect(cached.headers.get('cache-control')).toBe(cacheControl)
      expect(load(await cached.text())('#result').text()).toBe('error')

      await retry(() => {
        expect(Date.now() - lastModified).toBeGreaterThan(2100)
      }, 5000)
      const stale = await next.fetch('/1')
      expect(stale.headers.get('x-nextjs-cache')).toBe('STALE')
      expect(stale.headers.get('cache-control')).toBe(cacheControl)
      await stale.text()
    })
  })
})
