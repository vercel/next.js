import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { check, fetchViaHTTP } from 'next-test-utils'
import { join } from 'path'
import webdriver from 'next-webdriver'

describe('skip-trailing-slash-redirect', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(join(__dirname, 'app')),
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('should allow rewriting invalid buildId correctly', async () => {
    const res = await fetchViaHTTP(
      next.url,
      '/_next/data/missing-id/hello.json',
      undefined,
      {
        headers: {
          'x-nextjs-data': '1',
        },
      }
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Example Domain')

    if (!(global as any).isNextDeploy) {
      await check(() => next.cliOutput, /missing-id rewrite/)
      expect(next.cliOutput).toContain('/_next/data/missing-id/hello.json')
    }
  })

  it('should allow response body from middleware with flag', async () => {
    const res = await fetchViaHTTP(next.url, '/middleware-response-body')
    expect(res.status).toBe(200)
    expect(res.headers.get('x-from-middleware')).toBe('true')
    expect(await res.text()).toBe('hello from middleware')
  })

  it('should merge cookies from middleware and API routes correctly', async () => {
    const res = await fetchViaHTTP(next.url, '/api/test-cookie', undefined, {
      redirect: 'manual',
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toEqual(
      'from-middleware=1; Path=/, hello=From API'
    )
  })

  it('should merge cookies from middleware and edge API routes correctly', async () => {
    const res = await fetchViaHTTP(
      next.url,
      '/api/test-cookie-edge',
      undefined,
      {
        redirect: 'manual',
      }
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toEqual(
      'from-middleware=1; Path=/, hello=From%20API; Path=/'
    )
  })

  if ((global as any).isNextStart) {
    it('should not have trailing slash redirects in manifest', async () => {
      const routesManifest = JSON.parse(
        await next.readFile('.next/routes-manifest.json')
      )

      expect(
        routesManifest.redirects.some((redirect) => {
          return (
            redirect.statusCode === 308 &&
            (redirect.destination === '/:path+' ||
              redirect.destination === '/:path+/')
          )
        })
      ).toBe(false)
    })
  }

  it('should correct skip URL normalizing in middleware', async () => {
    let res = await fetchViaHTTP(
      next.url,
      '/middleware-rewrite-with-slash',
      undefined,
      { redirect: 'manual', headers: { 'x-nextjs-data': '1' } }
    )
    expect(res.headers.get('x-nextjs-rewrite').endsWith('/another/')).toBe(true)

    res = await fetchViaHTTP(
      next.url,
      '/middleware-rewrite-without-slash',
      undefined,
      { redirect: 'manual', headers: { 'x-nextjs-data': '1' } }
    )
    expect(res.headers.get('x-nextjs-rewrite').endsWith('/another')).toBe(true)

    res = await fetchViaHTTP(
      next.url,
      '/middleware-redirect-external-with',
      undefined,
      { redirect: 'manual' }
    )
    expect(res.status).toBe(307)
    expect(res.headers.get('Location')).toBe(
      'https://example.vercel.sh/somewhere/'
    )

    res = await fetchViaHTTP(
      next.url,
      '/middleware-redirect-external-without',
      undefined,
      { redirect: 'manual' }
    )
    expect(res.status).toBe(307)
    expect(res.headers.get('Location')).toBe(
      'https://example.vercel.sh/somewhere'
    )
  })

  it('should apply config redirect correctly', async () => {
    const res = await fetchViaHTTP(next.url, '/redirect-me', undefined, {
      redirect: 'manual',
    })
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get('location'), 'http://n').pathname).toBe(
      '/another'
    )
  })

  it('should apply config rewrites correctly', async () => {
    const res = await fetchViaHTTP(next.url, '/rewrite-me', undefined, {
      redirect: 'manual',
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('another page')
  })

  it('should not apply trailing slash redirect (with slash)', async () => {
    const res = await fetchViaHTTP(next.url, '/another/', undefined, {
      redirect: 'manual',
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('another page')
  })

  it('should not apply trailing slash redirect (without slash)', async () => {
    const res = await fetchViaHTTP(next.url, '/another', undefined, {
      redirect: 'manual',
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('another page')
  })

  it('should respond to index correctly', async () => {
    const res = await fetchViaHTTP(next.url, '/', undefined, {
      redirect: 'manual',
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('index page')
  })

  it('should respond to dynamic route correctly', async () => {
    const res = await fetchViaHTTP(next.url, '/blog/first', undefined, {
      redirect: 'manual',
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('blog page')
  })

  it('should navigate client side correctly', async () => {
    const browser = await webdriver(next.url, '/')

    expect(await browser.eval('location.pathname')).toBe('/')

    await browser.elementByCss('#to-another').click()
    await browser.waitForElementByCss('#another')

    expect(await browser.eval('location.pathname')).toBe('/another')
    await browser.back()
    await browser.waitForElementByCss('#index')

    expect(await browser.eval('location.pathname')).toBe('/')

    await browser.elementByCss('#to-blog-first').click()
    await browser.waitForElementByCss('#blog')

    expect(await browser.eval('location.pathname')).toBe('/blog/first')
  })
})
