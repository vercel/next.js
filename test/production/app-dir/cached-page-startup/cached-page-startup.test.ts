import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import * as cheerio from 'cheerio'

describe('cached-page-startup', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('serves complete cached HTML without loading the page bundle', async () => {
    const response = await next.fetch('/')
    expect(response.status).toBe(200)
    expect(response.headers.get('x-test-page-loaded')).toBe('no')
    expect(response.headers.get('x-nextjs-cache')).toBe('HIT')
    expect(response.headers.get('cache-control')).toBe('s-maxage=31536000')
    expect(response.headers.get('vary')?.toLowerCase()).toContain('rsc')
    expect(response.headers.get('x-next-cache-tags')).toBeNull()
    expect(await response.text()).toContain('id="counter"')
  })

  it('preserves HEAD and conditional responses', async () => {
    const response = await next.fetch('/')
    const etag = response.headers.get('etag')!
    const html = await response.text()
    const head = await next.fetch('/', { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(head.headers.get('etag')).toBe(etag)
    expect(Number(head.headers.get('content-length'))).toBe(
      Buffer.byteLength(html)
    )
    expect(await head.text()).toBe('')
    const conditional = await next.fetch('/', {
      cache: 'no-cache',
      headers: { 'if-none-match': etag },
    })
    expect(conditional.status).toBe(304)
    expect(await conditional.text()).toBe('')
  })

  it('preserves rewrites and configured response headers', async () => {
    const response = await next.fetch('/alias')
    expect(response.status).toBe(200)
    expect(response.headers.get('x-configured')).toBe('kept')
    expect(response.headers.get('cache-control')).toBe('public, max-age=7')
    expect(await response.text()).toContain('id="counter"')
  })

  it('matches the normal cached handler response', async () => {
    const shortcut = await next.fetch('/')
    const normal = await next.fetch('/', {
      headers: { cookie: 'comparison=1' },
    })
    expect(await shortcut.text()).toBe(await normal.text())
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
      expect(shortcut.headers.get(name)).toBe(normal.headers.get(name))
    }
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

  it('validates RSC cache-busting headers before serving Flight', async () => {
    const response = await next.fetch('/?_rsc=invalid', {
      headers: { rsc: '1' },
      redirect: 'manual',
    })
    expect(response.status).toBe(307)
    const destination = new URL(response.headers.get('location')!, next.url)
    expect(destination.searchParams.has('_rsc')).toBe(true)
    expect(destination.searchParams.get('_rsc')).not.toBe('invalid')
  })

  it('hydrates cached HTML and navigates to dynamic SSR', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#counter').click()
    expect(await browser.elementByCss('#counter').text()).toBe('1')
    await browser.elementByCss('a[href="/dynamic"]').click()
    expect(await browser.elementByCss('#dynamic').text()).toBe(
      'Dynamic content'
    )
    await browser.elementByCss('a[href="/"]').click()
    expect(await browser.elementByCss('#counter').text()).toBe('0')
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
    expect(await response.text()).toContain('id="counter"')
  })
})
