import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import * as cheerio from 'cheerio'

describe('cached-page-startup', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('serves the normal cached response without loading the page bundle', async () => {
    const response = await next.fetch('/')
    expect(response.status).toBe(200)
    expect(response.headers.get('x-test-page-loaded')).toBe('no')
    expect(response.headers.get('x-nextjs-cache')).toBe('HIT')
    expect(response.headers.get('cache-control')).toBe('s-maxage=31536000')
    expect(response.headers.get('vary')?.toLowerCase()).toContain('rsc')
    expect(response.headers.get('x-next-cache-tags')).toBeNull()
    const html = await response.text()
    expect(html).toContain('id="rendered-at"')

    const normal = await next.fetch('/', {
      headers: { cookie: 'comparison=1' },
    })
    expect(html).toBe(await normal.text())
    for (const name of [
      'cache-control',
      'content-type',
      'content-length',
      'etag',
      'vary',
      'x-nextjs-cache',
      'x-nextjs-prerender',
      'x-nextjs-stale-time',
    ]) {
      expect(response.headers.get(name)).toBe(normal.headers.get(name))
    }

    const head = await next.fetch('/', { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(head.headers.get('etag')).toBe(response.headers.get('etag'))
    expect(await head.text()).toBe('')
  })

  it('preserves rewrites and configured response headers', async () => {
    const response = await next.fetch('/alias')
    expect(response.status).toBe(200)
    expect(response.headers.get('x-configured')).toBe('kept')
    expect(response.headers.get('cache-control')).toBe('public, max-age=7')
    expect(await response.text()).toContain('id="rendered-at"')
  })

  it('regenerates invalidated HTML through the page handler', async () => {
    const before = (await next.render$('/'))('#rendered-at').text()
    expect((await next.fetch('/api/revalidate')).status).toBe(200)
    await retry(async () => {
      const response = await next.fetch('/')
      const $ = cheerio.load(await response.text())
      expect($('#rendered-at').text()).not.toBe(before)
      expect(response.headers.get('x-test-page-loaded')).toBe('yes')
    })
  })

  it('bypasses the cached response for draft mode', async () => {
    const draft = await next.fetch('/api/draft')
    const cookie = draft.headers.get('set-cookie')!.split(';')[0]
    const response = await next.fetch('/', { headers: { cookie } })
    const $ = cheerio.load(await response.text())
    expect($('#draft').text()).toBe('true')
    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it('serves Flight instead of cached HTML for RSC requests', async () => {
    const response = await next.fetch('/?_rsc=invalid', {
      headers: { rsc: '1' },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/x-component')
    expect(await response.text()).not.toContain('<html')
  })
})

describe('cached-page-startup without a memory cache', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: { TEST_MEMORY_CACHE_OFF: '1' },
  })

  it('serves the page through the existing handler', async () => {
    const response = await next.fetch('/')
    expect(response.status).toBe(200)
    expect(response.headers.get('x-test-page-loaded')).toBe('yes')
    expect(response.headers.get('x-nextjs-cache')).toBe('HIT')
    expect(await response.text()).toContain('id="rendered-at"')
  })
})
