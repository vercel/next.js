import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// @force-gate start
describe('param-matching-runtime', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function render(pathname: string, params: string) {
    const res = await next.fetch(pathname)
    const html = await res.text()
    expect(res.status).toBe(200)
    expect(html).toContain(`<p id="params">${params}</p>`)
    const marker = html.match(/<p id="shell-marker">([^<]+)<\/p>/)?.[1]
    expect(marker).toBeDefined()
    // Inspect emitted HTML, not the serialized Suspense fallback in Flight.
    return { marker, hasFallback: html.includes('<p id="pending">') }
  }

  describe.each(['blocking', 'blocking-no-seed'])('%s', (route) => {
    it('prerenders the requested params before serving a cold document', async () => {
      const a = await render(`/${route}/cold-a`, 'cold-a')
      const b = await render(`/${route}/cold-b`, 'cold-b')

      expect(a.hasFallback).toBe(false)
      expect(b.hasFallback).toBe(false)
      expect(a.marker).not.toBe(b.marker)
      expect((await render(`/${route}/cold-a`, 'cold-a')).marker).toBe(a.marker)
    })

    it('shields concurrent cold requests with one concrete prerender', async () => {
      const responses = await Promise.all(
        Array.from({ length: 3 }, () =>
          render(`/${route}/concurrent`, 'concurrent')
        )
      )
      for (const response of responses) {
        expect(response.hasFallback).toBe(false)
        expect(response.marker).toBe(responses[0].marker)
      }
      expect((await render(`/${route}/concurrent`, 'concurrent')).marker).toBe(
        responses[0].marker
      )
    })
  })

  describe.each(['fallback', 'fallback-no-seed'])('%s', (route) => {
    it('serves a shared shell and resumes novel params for the first visitor', async () => {
      const a = await render(`/${route}/first-a`, 'first-a')
      const b = await render(`/${route}/first-b`, 'first-b')

      expect(a.hasFallback).toBe(true)
      expect(b.hasFallback).toBe(true)
      expect(a.marker).toBe(b.marker)
    })

    it('upgrades the shell only when Partial Prefetching enables upgrades', async () => {
      const pathname = `/${route}/upgrade`
      const first = await render(pathname, 'upgrade')
      expect(first.hasFallback).toBe(true)

      const config = await next.getResolvedConfig()
      if (config.partialPrefetching) {
        await retry(async () => {
          const upgraded = await render(pathname, 'upgrade')
          expect(upgraded.hasFallback).toBe(false)
          expect(upgraded.marker).not.toBe(first.marker)
        })
      } else {
        const resumed = await render(pathname, 'upgrade')
        expect(resumed.hasFallback).toBe(true)
        expect(resumed.marker).toBe(first.marker)
      }
    })
  })

  it('starts with concrete outputs for build-time examples', async () => {
    for (const route of ['blocking', 'fallback']) {
      const first = await render(`/${route}/seed`, 'seed')
      expect(first.hasFallback).toBe(false)
      expect((await render(`/${route}/seed`, 'seed')).marker).toBe(first.marker)
    }
  })

  it('blocks for a novel prerenderable prefix but keeps the tail dynamic', async () => {
    const first = await render('/dynamic/top-a/bottom-a', 'top-a/bottom-a')
    const sameTop = await render('/dynamic/top-a/bottom-b', 'top-a/bottom-b')
    const otherTop = await render('/dynamic/top-b/bottom-a', 'top-b/bottom-a')

    // The bottom value is resumed independently on each request, not captured
    // in the cached output for top. A different top needs its own prerender.
    expect(first.marker).toBe(sameTop.marker)
    expect(first.marker).not.toBe(otherTop.marker)
  })
})
