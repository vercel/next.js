import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { check, fetchViaHTTP } from 'next-test-utils'
import { join } from 'path'
import cheerio from 'cheerio'
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

  // the tests below are run in both pages and app dir to ensure the behavior is the same
  // the other cases aren't added to this block since they are either testing pages-specific behavior
  // or aren't specific to either router implementation
  async function runSharedTests(basePath: string) {
    it('should not apply trailing slash redirect (with slash)', async () => {
      const res = await fetchViaHTTP(
        next.url,
        `${basePath}another/`,
        undefined,
        {
          redirect: 'manual',
        }
      )
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('another page')
    })

    it('should not apply trailing slash redirect (without slash)', async () => {
      const res = await fetchViaHTTP(
        next.url,
        `${basePath}another`,
        undefined,
        {
          redirect: 'manual',
        }
      )
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('another page')
    })

    it('should preserve original trailing slashes to links on client', async () => {
      const browser = await webdriver(next.url, basePath)
      await browser.eval('window.beforeNav = 1')

      expect(
        new URL(
          await browser.elementByCss('#to-another').getAttribute('href'),
          'http://n'
        ).pathname
      ).toBe(`${basePath}another`)

      expect(
        new URL(
          await browser
            .elementByCss('#to-another-with-slash')
            .getAttribute('href'),
          'http://n'
        ).pathname
      ).toBe(`${basePath}another/`)

      await browser.elementByCss('#to-another').click()
      await browser.waitForElementByCss('#another')

      expect(await browser.eval('window.location.pathname')).toBe(
        `${basePath}another`
      )

      await browser.back().waitForElementByCss('#to-another')

      expect(
        new URL(
          await browser
            .elementByCss('#to-another-with-slash')
            .getAttribute('href'),
          'http://n'
        ).pathname
      ).toBe(`${basePath}another/`)

      await browser.elementByCss('#to-another-with-slash').click()
      await browser.waitForElementByCss('#another')

      expect(await browser.eval('window.location.pathname')).toBe(
        `${basePath}another/`
      )

      await browser.back().waitForElementByCss('#to-another')
      expect(await browser.eval('window.beforeNav')).toBe(1)
    })

    it('should respond to index correctly', async () => {
      const res = await fetchViaHTTP(next.url, basePath, undefined, {
        redirect: 'manual',
      })
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('index page')
    })

    it('should respond to dynamic route correctly', async () => {
      const res = await fetchViaHTTP(
        next.url,
        `${basePath}blog/first`,
        undefined,
        {
          redirect: 'manual',
        }
      )
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('blog page')
    })

    it('should navigate client side correctly', async () => {
      const browser = await webdriver(next.url, basePath)

      expect(await browser.eval('location.pathname')).toBe(basePath)

      await browser.elementByCss('#to-another').click()
      await browser.waitForElementByCss('#another')

      expect(await browser.eval('location.pathname')).toBe(`${basePath}another`)
      await browser.back()
      await browser.waitForElementByCss('#index')

      expect(await browser.eval('location.pathname')).toBe(basePath)

      await browser.elementByCss('#to-blog-first').click()
      await browser.waitForElementByCss('#blog')

      expect(await browser.eval('location.pathname')).toBe(
        `${basePath}blog/first`
      )
    })
  }

  it('should parse locale info for data request correctly', async () => {
    const pathname = `/_next/data/${next.buildId}/ja-jp/locale-test.json`
    const res = await next.fetch(pathname)

    expect(await res.json()).toEqual({
      locale: 'ja-jp',
      pathname,
    })
  })

  it.each(['EN', 'JA-JP'])(
    'should be able to redirect locale casing $1',
    async (locale) => {
      const res = await next.fetch(`/${locale}`, { redirect: 'manual' })
      expect(res.status).toBe(307)
      expect(new URL(res.headers.get('location'), 'http://n').pathname).toBe(
        `/${locale.toLowerCase()}`
      )
    }
  )

  it.each([
    { pathname: '/chained-rewrite-ssg' },
    { pathname: '/chained-rewrite-static' },
    { pathname: '/chained-rewrite-ssr' },
    { pathname: '/docs/first' },
    { pathname: '/docs-auto-static/first' },
    { pathname: '/docs-ssr/first' },
  ])(
    'should handle external rewrite correctly $pathname',
    async ({ pathname }) => {
      const res = await fetchViaHTTP(next.url, pathname, undefined, {
        redirect: 'manual',
      })
      expect(res.status).toBe(200)

      const html = await res.text()
      const $ = cheerio.load(html)

      if (!pathname.includes('static')) {
        expect(JSON.parse($('#props').text()).params).toEqual({
          slug: 'first',
        })
        expect(JSON.parse($('#query').text())).toEqual({
          slug: 'first',
        })
      }

      const browser = await webdriver(next.url, '/docs', {
        waitHydration: false,
      })
      await check(
        () => browser.eval('next.router.isReady ? "yes": "no"'),
        'yes'
      )
      await check(() => browser.elementByCss('#mounted').text(), 'yes')
      await browser.eval('window.beforeNav = 1')

      await browser.elementByCss(`#${pathname.replace(/\//g, '')}`).click()
      await check(async () => {
        const query = JSON.parse(await browser.elementByCss('#query').text())
        expect(query).toEqual({ slug: 'first' })
        return 'success'
      }, 'success')

      expect(await browser.eval('window.beforeNav')).toBe(1)
    }
  )

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

  it('should provide original _next/data URL with skipProxyUrlNormalize', async () => {
    const res = await fetchViaHTTP(
      next.url,
      `/_next/data/${next.buildId}/valid.json`,
      undefined,
      {
        headers: {
          'x-nextjs-data': '1',
        },
      }
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Example Domain')
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
      `/_next/data/${next.buildId}/middleware-rewrite-with-slash.json`,
      undefined,
      { redirect: 'manual', headers: { 'x-nextjs-data': '1' } }
    )
    expect(res.headers.get('x-nextjs-rewrite').endsWith('/another/')).toBe(true)

    res = await fetchViaHTTP(
      next.url,
      `/_next/data/${next.buildId}/middleware-rewrite-without-slash.json`,
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

  it('should not apply trailing slash on load on client', async () => {
    let browser = await webdriver(next.url, '/another')
    await check(() => browser.eval('next.router.isReady ? "yes": "no"'), 'yes')

    expect(await browser.eval('location.pathname')).toBe('/another')

    browser = await webdriver(next.url, '/another/')
    await check(() => browser.eval('next.router.isReady ? "yes": "no"'), 'yes')

    expect(await browser.eval('location.pathname')).toBe('/another/')
  })

  describe('pages dir', () => {
    runSharedTests('/')
  })

  describe('app dir - skip trailing slash redirect', () => {
    runSharedTests('/with-app-dir/')
  })
})
