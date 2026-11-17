import { load } from 'cheerio'
import { nextTestSetup } from 'e2e-utils'
import { gate, retry } from 'next-test-utils'

// These deploy assertions cover Vercel adapter prerender bypass rules. Dev does
// not use the prerender cache.
// @force-gate !dev && (!deploy || (vercel && adapter))
describe('App Page prerender HTTP methods', () => {
  const { next } = nextTestSetup({ files: __dirname })

  type PageResponse = Awaited<ReturnType<typeof next.fetch>>

  async function isPrerendered(pathname: string) {
    return pathname === '/static' || (await gate((c) => c.cacheComponents))
  }

  async function expectPage(
    response: PageResponse,
    pathname: string,
    requestValue: string
  ) {
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/^text\/html(?:;|$)/)
    const html = await response.text()
    expect(html).toMatch(/^(?:<!--[\s\S]*?-->\s*)*<!doctype html>/i)
    const $ = load(html)
    expect($('h1').text()).toBe(
      pathname === '/static' ? 'Static page' : 'Partial page'
    )
    expect($('#generation').text()).not.toBe('')
    if (pathname === '/partial') {
      expect($('#request-value').text()).toBe(requestValue)
    }
    return $('#generation').text()
  }

  async function warmPage(pathname: string) {
    const requestValue = 'warm'
    const options = {
      headers: { 'x-prerender-methods-value': requestValue },
    }
    const initial = await next.fetch(pathname, options)
    const generation = await expectPage(initial, pathname, requestValue)

    await retry(async () => {
      const response = await next.fetch(pathname, options)
      const warmedGeneration = await expectPage(
        response,
        pathname,
        requestValue
      )
      if (await isPrerendered(pathname)) {
        expect(warmedGeneration).toBe(generation)
        if (await gate((c) => c.vercel)) {
          expect(response.headers.get('x-vercel-cache')).toBe('HIT')
        }
      }
    })

    return generation
  }

  describe.each(['/static', '/partial'])('%s', (pathname) => {
    describe.each(['GET', 'HEAD'])('%s', (method) => {
      it.each([
        { description: 'without action headers', headers: {} },
        {
          description: 'with a next-action header',
          headers: { 'next-action': '0'.repeat(42) },
        },
        {
          description: 'with a multipart content type',
          headers: { 'content-type': 'multipart/form-data; boundary=test' },
        },
      ])('$description', async ({ headers }) => {
        await warmPage(pathname)
        const response = await next.fetch(pathname, {
          method,
          headers: {
            ...headers,
            'x-prerender-methods-value': 'read',
          },
        })

        // Vercel denies action headers on read requests before cache lookup.
        if ('next-action' in headers && (await gate((c) => c.vercel))) {
          expect(response.status).toBe(403)
          expect(response.headers.get('x-vercel-mitigated')).toBe('deny')
          expect(response.headers.get('x-vercel-cache')).toBeNull()
          if (method === 'HEAD') {
            expect(await response.text()).toBe('')
          } else {
            expect(await response.text()).toMatch(/^Forbidden\n/)
          }
        } else {
          expect(response.status).toBe(200)
          expect(response.headers.get('content-type')).toMatch(
            /^text\/html(?:;|$)/
          )
          if (method === 'HEAD') {
            expect(await response.text()).toBe('')
          } else {
            await expectPage(response, pathname, 'read')
          }

          if (
            (await gate((c) => c.vercel)) &&
            (await isPrerendered(pathname))
          ) {
            expect(response.headers.get('x-vercel-cache')).toBe('HIT')
          }
        }
      })
    })

    it.each([
      { description: 'an empty body', headers: {}, body: undefined },
      {
        description: 'a text body',
        headers: { 'content-type': 'text/plain' },
        body: 'ordinary POST',
      },
      {
        description: 'a JSON body',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'ordinary POST' }),
      },
    ])(
      'handles an ordinary POST with $description and preserves the cached GET',
      async ({ headers, body }) => {
        const generation = await warmPage(pathname)
        const response = await next.fetch(pathname, {
          method: 'POST',
          headers: {
            ...headers,
            'x-prerender-methods-value': 'post',
          },
          body,
        })

        // next start rejects non-action POSTs to prerendered App Pages. A
        // deployment invokes the page function through the provider instead.
        if ((await gate((c) => c.start)) && (await isPrerendered(pathname))) {
          expect(response.status).toBe(405)
          expect(response.headers.get('allow')).toBe('GET, HEAD')
          expect(await response.text()).toBe('Method Not Allowed')
        } else {
          await expectPage(response, pathname, 'post')
        }
        if ((await gate((c) => c.vercel)) && (await isPrerendered(pathname))) {
          expect(response.headers.get('x-vercel-cache')).toBe('BYPASS')
        }

        const after = await next.fetch(pathname, {
          headers: { 'x-prerender-methods-value': 'after-post' },
        })
        const afterGeneration = await expectPage(after, pathname, 'after-post')
        if (await isPrerendered(pathname)) {
          expect(afterGeneration).toBe(generation)
          if (await gate((c) => c.vercel)) {
            expect(after.headers.get('x-vercel-cache')).toBe('HIT')
          }
        }
      }
    )
  })
})
