import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Public contracts: proxy.mdx#execution-order, rewrites.mdx#rewrites,
// headers.mdx#header-overriding-behavior, and redirects.mdx.
describe('documented routing phases', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('terminates a config redirect before Proxy', async () => {
    const response = await next.fetch('/order/redirect?original=preserved', {
      redirect: 'manual',
    })
    expect(response.status).toBe(307)
    // Phase ordering does not specify whether a terminal config redirect
    // retains configured response headers. Eligible page/public responses
    // assert those headers independently below.
    expect(response.headers.get('x-contract-proxy')).toBeNull()
    const location = new URL(response.headers.get('location')!, next.url)
    expect(location.pathname).toBe('/api/echo')
    expect(location.searchParams.get('stage')).toBe('config-redirect')
    expect(location.searchParams.get('original')).toBe('preserved')
  })

  it('terminates a direct Proxy response before beforeFiles and filesystem routes', async () => {
    const response = await next.fetch('/order/proxy')
    expect(response.status).toBe(202)
    expect(response.headers.get('x-contract-phase')).toBe('config-headers')
    expect(response.headers.get('x-contract-proxy')).toBe('ran')
    expect(await response.json()).toEqual({ destination: 'proxy' })
  })

  it('continues all beforeFiles rules even when an intermediate page exists', async () => {
    const response = await next.fetch('/order/before-files')
    expect(response.status).toBe(200)
    expect(response.headers.get('x-contract-proxy')).toBe('ran')
    expect(await response.json()).toMatchObject({
      destination: 'echo',
      proxy: 'ran',
      query: { stage: 'before-files-final' },
    })
  })

  it('selects an existing filesystem page before afterFiles rewrites', async () => {
    const $ = await next.render$('/order/filesystem')
    expect($('#destination').text()).toBe('filesystem')
    expect($('#proxy').text()).toBe('ran')
  })

  it('applies afterFiles before a matching dynamic page', async () => {
    const response = await next.fetch('/order/after-files')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      destination: 'echo',
      query: { stage: 'after-files' },
    })
  })

  it('stops afterFiles at the first rewrite that resolves to an existing page', async () => {
    const $ = await next.render$('/order/after-stop')
    expect($('#destination').text()).toBe('filesystem')
  })

  it('selects a dynamic page before fallback rewrites', async () => {
    const $ = await next.render$('/order/dynamic')
    expect($('#destination').text()).toBe('dynamic')
    expect(JSON.parse($('#params').text())).toEqual({ slug: 'dynamic' })
  })

  it('uses fallback only after filesystem and dynamic matches fail', async () => {
    const response = await next.fetch('/order/unknown/deep')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      destination: 'echo',
      query: { stage: 'fallback', path: ['unknown', 'deep'] },
    })
  })

  it('returns 404 when no route or fallback matches', async () => {
    const response = await next.fetch('/unmatched/deep/route')
    expect(response.status).toBe(404)
    expect(response.headers.get('x-contract-phase')).toBe('config-headers')
    expect(response.headers.get('x-contract-proxy')).toBe('ran')
  })

  for (const path of ['/headers/page', '/headers/public.txt']) {
    it(`lets the last matching header rule win on ${path}`, async () => {
      const response = await next.fetch(path)
      expect(response.status).toBe(200)
      expect(response.headers.get('x-contract-overwrite')).toBe('last')
      expect(response.headers.get('x-contract-phase')).toBe('config-headers')
      expect(await response.text()).toContain('header destination')
    })
  }

  it('[R05/R08] matches configured headers against the original URL before Proxy and rewrites', async () => {
    const rewritten = await next.fetch('/header-order/source')
    expect(rewritten.status).toBe(200)
    expect(rewritten.headers.get('x-contract-header-source')).toBe('original')
    expect(rewritten.headers.get('x-contract-header-destination')).toBeNull()
    expect(rewritten.headers.get('x-contract-proxy')).toBe('ran')
    expect(await rewritten.json()).toMatchObject({
      destination: 'echo',
      proxy: 'ran',
      query: { stage: 'header-order' },
    })

    const direct = await next.fetch('/api/echo')
    expect(direct.status).toBe(200)
    expect(direct.headers.get('x-contract-header-destination')).toBe(
      'destination'
    )
    expect(direct.headers.get('x-contract-header-source')).toBeNull()
  })

  for (const [kind, status] of [
    ['temporary', 307],
    ['permanent', 308],
  ] as const) {
    for (const method of ['POST', 'PUT', 'PATCH']) {
      it(`preserves ${method} and its body through the ${status} redirect`, async () => {
        const path = `/preserve/${kind}/captured?original=preserved`
        const body = `${method}: literal payload & unicode \u2713`
        const init = {
          method,
          body,
          headers: { 'content-type': 'text/plain' },
        }
        const redirect = await next.fetch(path, { ...init, redirect: 'manual' })
        expect(redirect.status).toBe(status)
        const location = new URL(redirect.headers.get('location')!, next.url)
        expect(location.pathname).toBe('/api/echo')
        expect(location.searchParams.get('slug')).toBe('captured')
        expect(location.searchParams.get('original')).toBe('preserved')
        const response = await next.fetch(path, init)
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
          destination: 'echo',
          method,
          body,
          query: { slug: 'captured', original: 'preserved' },
        })
      })
    }
  }

  for (const mode of ['true', 'blocking']) {
    it(`does not run fallback rewrites for getStaticPaths fallback:${mode}`, async () => {
      // Bots wait for fallback:true generation, so the response contains final HTML.
      const response = await next.fetch(`/generated-${mode}/unlisted`, {
        headers: { 'user-agent': 'Googlebot' },
      })
      expect(response.status).toBe(200)
      expect(await response.text()).toContain(`generated-${mode}:`)
      const data = await next.fetch(
        `/_next/data/${next.buildId}/generated-${mode}/unlisted.json`
      )
      expect(data.status).toBe(200)
      expect(await data.json()).toMatchObject({
        pageProps: { slug: 'unlisted' },
      })
    })
  }

  it('protects a page and its data route despite excluding _next/data in a negative matcher', async () => {
    const paths = ['/protected', `/_next/data/${next.buildId}/protected.json`]
    for (const path of paths) {
      const response = await next.fetch(path)
      expect(response.status).toBe(401)
      expect(response.headers.get('x-contract-proxy')).toBe('denied')
      expect(await response.json()).toEqual({ destination: 'proxy-denied' })
    }
    const page = await next.fetch('/protected', {
      headers: { 'x-contract-authorized': 'yes' },
    })
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('protected destination')
    const data = await next.fetch(paths[1], {
      headers: { 'x-contract-authorized': 'yes' },
    })
    expect(data.status).toBe(200)
    expect(data.headers.get('content-type')).toContain('application/json')
    expect(await data.json()).toMatchObject({
      pageProps: { marker: 'protected destination', proxy: 'ran' },
    })
  })

  it('applies Pages config redirects on client navigation only with a matching Proxy', async () => {
    // Both sources redirect for a document request, proving the rules exist.
    for (const path of ['/without-proxy', '/with-proxy']) {
      const response = await next.fetch(path, { redirect: 'manual' })
      expect(response.status).toBe(307)
      expect(
        new URL(response.headers.get('location')!, next.url).pathname
      ).toBe('/redirect-destination')
    }

    const withoutProxy = await next.browser('/navigation')
    await withoutProxy.elementByCss('#without-proxy-link').click()
    await retry(async () => {
      expect(await withoutProxy.elementByCss('#destination').text()).toBe(
        'source without Proxy'
      )
      expect(new URL(await withoutProxy.url()).pathname).toBe('/without-proxy')
    })

    const withProxy = await next.browser('/navigation')
    await withProxy.elementByCss('#with-proxy-link').click()
    await retry(async () => {
      expect(await withProxy.elementByCss('#destination').text()).toBe(
        'redirect destination'
      )
      expect(new URL(await withProxy.url()).pathname).toBe(
        '/redirect-destination'
      )
    })
  })
})
