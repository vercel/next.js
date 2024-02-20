/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import webdriver from 'next-webdriver'
import { NextInstance } from 'test/lib/next-modes/base'
import {
  check,
  fetchViaHTTP,
  shouldRunTurboDevTest,
  waitFor,
} from 'next-test-utils'
import { createNext, FileRef } from 'e2e-utils'

const urlsError = 'Please use only absolute URLs'

describe('Middleware Runtime', () => {
  let next: NextInstance

  const setup = ({ i18n }: { i18n: boolean }) => {
    afterAll(async () => {
      await next.destroy()
    })
    beforeAll(async () => {
      next = await createNext({
        files: {
          'middleware.js': new FileRef(join(__dirname, '../app/middleware.js')),
          pages: new FileRef(join(__dirname, '../app/pages')),
          'shared-package': new FileRef(
            join(__dirname, '../app/node_modules/shared-package')
          ),
        },
        nextConfig: {
          experimental: {
            webpackBuildWorker: true,
          },
          ...(i18n
            ? {
                i18n: {
                  locales: ['en', 'fr', 'nl'],
                  defaultLocale: 'en',
                },
              }
            : {}),
          async redirects() {
            return [
              {
                source: '/redirect-1',
                destination: '/somewhere/else',
                permanent: false,
              },
            ]
          },
          async rewrites() {
            return [
              {
                source: '/rewrite-1',
                destination: '/ssr-page?from=config',
              },
              {
                source: '/rewrite-2',
                destination: '/about/a?from=next-config',
              },
              {
                source: '/sha',
                destination: '/shallow',
              },
              {
                source: '/rewrite-3',
                destination: '/blog/middleware-rewrite?hello=config',
              },
            ]
          },
        },
        packageJson: {
          scripts: {
            setup: `cp -r ./shared-package ./node_modules`,
            build: 'pnpm run setup && next build',
            dev: `pnpm run setup && next ${
              shouldRunTurboDevTest() ? 'dev --turbo' : 'dev'
            }`,
            start: 'next start',
          },
        },
        startCommand: (global as any).isNextDev ? 'pnpm dev' : 'pnpm start',
        buildCommand: 'pnpm build',
        env: {
          ANOTHER_MIDDLEWARE_TEST: 'asdf2',
          STRING_ENV_VAR: 'asdf3',
          MIDDLEWARE_TEST: 'asdf',
        },
      })
    })
  }

  function readMiddlewareJSON(response) {
    return JSON.parse(response.headers.get('data'))
  }

  function readMiddlewareError(response) {
    return response.headers.get('error')
  }

  function runTests({ i18n }: { i18n?: boolean }) {
    it('should work with notFound: true correctly', async () => {
      const browser = await next.browser('/ssr-page')
      await browser.eval('window.next.router.push("/ssg/not-found-1")')

      await check(
        () => browser.eval('document.documentElement.innerHTML'),
        /This page could not be found/
      )

      await browser.refresh()
      await check(
        () => browser.eval('document.documentElement.innerHTML'),
        /This page could not be found/
      )
    })

    it('should be able to rewrite on _next/static/chunks/pages/ 404', async () => {
      const res = await fetchViaHTTP(
        next.url,
        '/_next/static/chunks/pages/_app-non-existent.js'
      )

      expect(res.status).toBe(200)
      expect(await res.text()).toContain('Example Domain')
    })

    if ((global as any).isNextDev) {
      it('refreshes the page when middleware changes ', async () => {
        const browser = await webdriver(next.url, `/about`)
        await browser.eval('window.didrefresh = "hello"')
        const text = await browser.elementByCss('h1').text()
        expect(text).toEqual('AboutA')

        const middlewarePath = join(next.testDir, '/middleware.js')
        const originalContent = fs.readFileSync(middlewarePath, 'utf-8')
        const editedContent = originalContent.replace('/about/a', '/about/b')

        try {
          fs.writeFileSync(middlewarePath, editedContent)
          await waitFor(1000)
          const textb = await browser.elementByCss('h1').text()
          expect(await browser.eval('window.itdidnotrefresh')).not.toBe('hello')
          expect(textb).toEqual('AboutB')
        } finally {
          fs.writeFileSync(middlewarePath, originalContent)
          await browser.close()
        }
      })

      it('should only contain middleware route in dev middleware manifest', async () => {
        const res = await fetchViaHTTP(
          next.url,
          `/_next/static/${next.buildId}/_devMiddlewareManifest.json`
        )
        const matchers = await res.json()
        expect(matchers).toEqual([{ regexp: '.*', originalSource: '/:path*' }])
      })
    }

    if ((global as any).isNextStart) {
      it('should have valid middleware field in manifest', async () => {
        const manifest = await fs.readJSON(
          join(next.testDir, '.next/server/middleware-manifest.json')
        )
        expect(manifest.middleware).toEqual({
          '/': {
            files: expect.arrayContaining([
              'server/edge-runtime-webpack.js',
              'server/middleware.js',
            ]),
            name: 'middleware',
            page: '/',
            matchers: [{ regexp: '^/.*$', originalSource: '/:path*' }],
            wasm: [],
            assets: [],
            regions: 'auto',
          },
        })
      })

      it('should have the custom config in the manifest', async () => {
        const manifest = await fs.readJSON(
          join(next.testDir, '.next/server/middleware-manifest.json')
        )

        expect(manifest.functions['/api/edge-search-params']).toHaveProperty(
          'regions',
          'auto'
        )
      })

      it('should have correct files in manifest', async () => {
        const manifest = await fs.readJSON(
          join(next.testDir, '.next/server/middleware-manifest.json')
        )
        for (const key of Object.keys(manifest.middleware)) {
          const middleware = manifest.middleware[key]
          expect(middleware.files).toContainEqual(
            expect.stringContaining('server/edge-runtime-webpack')
          )
          expect(middleware.files).not.toContainEqual(
            expect.stringContaining('static/chunks/')
          )
        }
      })

      it('should not run middleware for on-demand revalidate', async () => {
        const bypassToken = (
          await fs.readJSON(join(next.testDir, '.next/prerender-manifest.json'))
        ).preview.previewModeId

        const res = await fetchViaHTTP(next.url, '/ssg/first', undefined, {
          headers: {
            'x-prerender-revalidate': bypassToken,
          },
        })
        expect(res.status).toBe(200)
        expect(res.headers.get('x-middleware')).toBeFalsy()
        expect(res.headers.get('x-nextjs-cache')).toBe('REVALIDATED')
      })
    }

    it('passes search params with rewrites', async () => {
      const response = await fetchViaHTTP(next.url, `/api/edge-search-params`, {
        a: 'b',
      })
      await expect(response.json()).resolves.toMatchObject({
        a: 'b',
        // included from middleware
        foo: 'bar',
      })
    })

    it('should have init header for NextResponse.redirect', async () => {
      const res = await fetchViaHTTP(
        next.url,
        '/redirect-to-somewhere',
        undefined,
        {
          redirect: 'manual',
        }
      )
      expect(res.status).toBe(307)
      expect(new URL(res.headers.get('location'), 'http://n').pathname).toBe(
        '/somewhere'
      )
      expect(res.headers.get('x-redirect-header')).toBe('hi')
    })

    it('should have correct query values for rewrite to ssg page', async () => {
      const browser = await webdriver(next.url, '/to-ssg', {
        waitHydration: false,
      })
      const requests = []

      browser.on('request', (req) => {
        console.error('request', req.url(), req.method())
        if (req.method() === 'HEAD') {
          requests.push(req.url())
        }
      })
      await browser.eval('window.beforeNav = 1')

      await check(async () => {
        const didReq = await browser.eval('next.router.isReady')
        return didReq ||
          requests.some((req) =>
            new URL(req, 'http://n').pathname.endsWith('/to-ssg.json')
          )
          ? 'found'
          : JSON.stringify(requests)
      }, 'found')

      await check(
        () => browser.eval('document.documentElement.innerHTML'),
        /"slug":"hello"/
      )

      await check(() => browser.elementByCss('body').text(), /\/to-ssg/)

      expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
        from: 'middleware',
        slug: 'hello',
      })
      expect(
        JSON.parse(await browser.elementByCss('#props').text()).params
      ).toEqual({
        slug: 'hello',
      })
      expect(await browser.elementByCss('#pathname').text()).toBe('/ssg/[slug]')
      expect(await browser.elementByCss('#as-path').text()).toBe('/to-ssg')
    })

    it('should have correct dynamic route params on client-transition to dynamic route', async () => {
      const browser = await webdriver(next.url, '/404')
      await check(
        () => browser.eval('next.router.isReady ? "yes" : "nope"'),
        'yes'
      )
      await browser.eval('window.beforeNav = 1')
      await browser.eval('window.next.router.push("/blog/first")')
      await browser.waitForElementByCss('#blog')

      expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
        slug: 'first',
      })
      expect(
        JSON.parse(await browser.elementByCss('#props').text()).params
      ).toEqual({
        slug: 'first',
      })
      expect(await browser.elementByCss('#pathname').text()).toBe(
        '/blog/[slug]'
      )
      expect(await browser.elementByCss('#as-path').text()).toBe('/blog/first')

      await browser.eval('window.next.router.push("/blog/second")')
      await check(() => browser.elementByCss('body').text(), /"slug":"second"/)

      expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
        slug: 'second',
      })
      expect(
        JSON.parse(await browser.elementByCss('#props').text()).params
      ).toEqual({
        slug: 'second',
      })
      expect(await browser.elementByCss('#pathname').text()).toBe(
        '/blog/[slug]'
      )
      expect(await browser.elementByCss('#as-path').text()).toBe('/blog/second')
    })

    it('should have correct dynamic route params for middleware rewrite to dynamic route', async () => {
      const browser = await webdriver(next.url, '/404')
      await check(
        () => browser.eval('next.router.isReady ? "yes" : "no"'),
        'yes'
      )
      await browser.eval('window.beforeNav = 1')
      await browser.eval('window.next.router.push("/rewrite-to-dynamic")')
      await browser.waitForElementByCss('#blog')

      expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
        slug: 'from-middleware',
        some: 'middleware',
      })
      expect(
        JSON.parse(await browser.elementByCss('#props').text()).params
      ).toEqual({
        slug: 'from-middleware',
      })
      expect(await browser.elementByCss('#pathname').text()).toBe(
        '/blog/[slug]'
      )
      expect(await browser.elementByCss('#as-path').text()).toBe(
        '/rewrite-to-dynamic'
      )
    })

    it('should have correct route params for chained rewrite from middleware to config rewrite', async () => {
      const browser = await webdriver(next.url, '/404')
      await check(
        () => browser.eval('next.router.isReady ? "yes" : "no"'),
        'yes'
      )
      await browser.eval('window.beforeNav = 1')
      await browser.eval(
        'window.next.router.push("/rewrite-to-config-rewrite")'
      )
      await browser.waitForElementByCss('#blog')

      expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
        slug: 'middleware-rewrite',
        hello: 'config',
        some: 'middleware',
      })
      expect(
        JSON.parse(await browser.elementByCss('#props').text()).params
      ).toEqual({
        slug: 'middleware-rewrite',
      })
      expect(await browser.elementByCss('#pathname').text()).toBe(
        '/blog/[slug]'
      )
      expect(await browser.elementByCss('#as-path').text()).toBe(
        '/rewrite-to-config-rewrite'
      )
    })

    it('should have correct route params for rewrite from config dynamic route', async () => {
      const browser = await webdriver(next.url, '/404')
      await browser.eval('window.beforeNav = 1')
      await browser.eval('window.next.router.push("/rewrite-3")')
      await browser.waitForElementByCss('#blog')

      expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
        slug: 'middleware-rewrite',
        hello: 'config',
      })
      expect(
        JSON.parse(await browser.elementByCss('#props').text()).params
      ).toEqual({
        slug: 'middleware-rewrite',
      })
      expect(await browser.elementByCss('#pathname').text()).toBe(
        '/blog/[slug]'
      )
      expect(await browser.elementByCss('#as-path').text()).toBe('/rewrite-3')
    })

    it('should have correct route params for rewrite from config non-dynamic route', async () => {
      const browser = await webdriver(next.url, '/404')
      await check(
        () => browser.eval('next.router.isReady ? "yes" : "nope"'),
        'yes'
      )
      await browser.eval('window.beforeNav = 1')
      await browser.eval('window.next.router.push("/rewrite-1")')

      await check(
        () => browser.eval('document.documentElement.innerHTML'),
        /Hello World/
      )

      expect(await browser.eval('window.next.router.query')).toEqual({
        from: 'config',
      })
    })

    it('should redirect the same for direct visit and client-transition', async () => {
      const res = await fetchViaHTTP(next.url, `/redirect-1`, undefined, {
        redirect: 'manual',
      })
      expect(res.status).toBe(307)
      expect(new URL(res.headers.get('location'), 'http://n').pathname).toBe(
        '/somewhere/else'
      )

      const browser = await webdriver(next.url, `/`)
      await browser.eval(`next.router.push('/redirect-1')`)
      await check(async () => {
        const pathname = await browser.eval('location.pathname')
        return pathname === '/somewhere/else' ? 'success' : pathname
      }, 'success')
    })

    it('should rewrite the same for direct visit and client-transition', async () => {
      const res = await fetchViaHTTP(next.url, `/rewrite-1`)
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('Hello World')

      const browser = await webdriver(next.url, `/404`)
      await check(
        () => browser.eval('next.router.isReady ? "yes" : "nope"'),
        'yes'
      )
      await browser.eval('window.beforeNav = 1')
      await browser.eval(`next.router.push('/rewrite-1')`)
      await check(async () => {
        const content = await browser.eval('document.documentElement.innerHTML')
        return content.includes('Hello World') ? 'success' : content
      }, 'success')
      expect(await browser.eval('window.beforeNav')).toBe(1)
    })

    it('should rewrite correctly for non-SSG/SSP page', async () => {
      const res = await fetchViaHTTP(next.url, `/rewrite-2`)
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('AboutA')

      const browser = await webdriver(next.url, `/404`)
      await browser.eval(`next.router.push('/rewrite-2')`)
      await check(async () => {
        const content = await browser.eval('document.documentElement.innerHTML')
        return content.includes('AboutA') ? 'success' : content
      }, 'success')
    })

    it('should respond with 400 on decode failure', async () => {
      const res = await fetchViaHTTP(next.url, `/%2`)
      expect(res.status).toBe(400)

      if ((global as any).isNextStart) {
        expect(await res.text()).toContain('Bad Request')
      }
    })

    if (!(global as any).isNextDeploy) {
      // user agent differs on Vercel
      it('should set fetch user agent correctly', async () => {
        const res = await fetchViaHTTP(next.url, `/fetch-user-agent-default`)

        expect(readMiddlewareJSON(res).headers['user-agent']).toBe(
          'Next.js Middleware'
        )

        const res2 = await fetchViaHTTP(next.url, `/fetch-user-agent-crypto`)
        expect(readMiddlewareJSON(res2).headers['user-agent']).toBe(
          'custom-agent'
        )
      })
    }

    it('allows to access env variables', async () => {
      const res = await fetchViaHTTP(next.url, `/global`)
      const json = readMiddlewareJSON(res)

      for (const [key, value] of Object.entries({
        ANOTHER_MIDDLEWARE_TEST: 'asdf2',
        STRING_ENV_VAR: 'asdf3',
        MIDDLEWARE_TEST: 'asdf',
        ...((global as any).isNextDeploy
          ? {}
          : {
              NEXT_RUNTIME: 'edge',
            }),
      })) {
        expect(json.process.env[key]).toBe(value)
      }
    })

    it(`should contain \`globalThis\``, async () => {
      const res = await fetchViaHTTP(next.url, '/globalthis')
      expect(readMiddlewareJSON(res).length > 0).toBe(true)
    })

    it(`should contain crypto APIs`, async () => {
      const res = await fetchViaHTTP(next.url, '/webcrypto')
      expect('error' in readMiddlewareJSON(res)).toBe(false)
    })

    if (!(global as any).isNextDeploy) {
      it(`should accept a URL instance for fetch`, async () => {
        const response = await fetchViaHTTP(next.url, '/fetch-url')
        // TODO: why is an error expected here if it should work?
        const { error } = readMiddlewareJSON(response)
        expect(error).toBeTruthy()
        expect(error.message).not.toContain("Failed to construct 'URL'")
      })
    }

    it(`should allow to abort a fetch request`, async () => {
      const response = await fetchViaHTTP(next.url, '/abort-controller')
      const payload = readMiddlewareJSON(response)
      expect('error' in payload).toBe(true)
      expect(payload.error.name).toBe('AbortError')
      expect(payload.error.message).toContain('The operation was aborted')
    })

    it(`should validate & parse request url from any route`, async () => {
      const res = await fetchViaHTTP(next.url, `/static`)

      expect(res.headers.get('req-url-basepath')).toBeFalsy()
      expect(res.headers.get('req-url-pathname')).toBe('/static')

      const { pathname, params } = JSON.parse(res.headers.get('req-url-params'))
      expect(pathname).toBe(undefined)
      expect(params).toEqual(undefined)

      expect(res.headers.get('req-url-query')).not.toBe('bar')
    })

    if (i18n) {
      it(`should validate & parse request url from a dynamic route with params`, async () => {
        const res = await fetchViaHTTP(next.url, `/fr/1`)

        expect(res.headers.get('req-url-basepath')).toBeFalsy()
        expect(res.headers.get('req-url-pathname')).toBe('/1')

        const { pathname, params } = JSON.parse(
          res.headers.get('req-url-params')
        )
        expect(pathname).toBe('/:locale/:id')
        expect(params).toEqual({ locale: 'fr', id: '1' })

        expect(res.headers.get('req-url-query')).not.toBe('bar')
        expect(res.headers.get('req-url-locale')).toBe('fr')
      })

      it(`should validate & parse request url from a dynamic route with params and no query`, async () => {
        const res = await fetchViaHTTP(next.url, `/fr/abc123`)
        expect(res.headers.get('req-url-basepath')).toBeFalsy()

        const { pathname, params } = JSON.parse(
          res.headers.get('req-url-params')
        )
        expect(pathname).toBe('/:locale/:id')
        expect(params).toEqual({ locale: 'fr', id: 'abc123' })

        expect(res.headers.get('req-url-query')).not.toBe('bar')
        expect(res.headers.get('req-url-locale')).toBe('fr')
      })
    }

    it(`should validate & parse request url from a dynamic route with params and query`, async () => {
      const res = await fetchViaHTTP(next.url, `/abc123?foo=bar`)
      expect(res.headers.get('req-url-basepath')).toBeFalsy()

      const { pathname, params } = JSON.parse(res.headers.get('req-url-params'))

      expect(pathname).toBe('/:id')
      expect(params).toEqual({ id: 'abc123' })

      expect(res.headers.get('req-url-query')).toBe('bar')

      if (i18n) {
        expect(res.headers.get('req-url-locale')).toBe('en')
      }
    })

    it('should throw when using URL with a relative URL', async () => {
      const res = await fetchViaHTTP(next.url, `/url/relative-url`)
      expect(readMiddlewareError(res)).toContain('Invalid URL')
    })

    it('should throw when using NextRequest with a relative URL', async () => {
      const response = await fetchViaHTTP(
        next.url,
        `/url/relative-next-request`
      )
      expect(readMiddlewareError(response)).toContain(urlsError)
    })

    if (!(global as any).isNextDeploy) {
      // these errors differ on Vercel
      it('should throw when using Request with a relative URL', async () => {
        const response = await fetchViaHTTP(next.url, `/url/relative-request`)
        expect(readMiddlewareError(response)).toContain(urlsError)
      })

      it('should warn when using Response.redirect with a relative URL', async () => {
        const response = await fetchViaHTTP(next.url, `/url/relative-redirect`)
        expect(readMiddlewareError(response)).toContain(urlsError)
      })
    }

    it('should warn when using NextResponse.redirect with a relative URL', async () => {
      const response = await fetchViaHTTP(
        next.url,
        `/url/relative-next-redirect`
      )
      expect(readMiddlewareError(response)).toContain(urlsError)
    })

    it('should throw when using NextResponse.rewrite with a relative URL', async () => {
      const response = await fetchViaHTTP(
        next.url,
        `/url/relative-next-rewrite`
      )
      expect(readMiddlewareError(response)).toContain(urlsError)
    })

    it('should trigger middleware for data requests', async () => {
      const browser = await webdriver(next.url, `/ssr-page`)
      const text = await browser.elementByCss('h1').text()
      expect(text).toEqual('Bye Cruel World')
      const res = await fetchViaHTTP(
        next.url,
        `/_next/data/${next.buildId}${i18n ? '/en' : ''}/ssr-page.json`
      )
      const json = await res.json()
      expect(json.pageProps.message).toEqual('Bye Cruel World')
    })

    it('should normalize data requests into page requests', async () => {
      const res = await fetchViaHTTP(
        next.url,
        `/_next/data/${next.buildId}${i18n ? '/en' : ''}/send-url.json`
      )
      expect(res.headers.get('req-url-path')).toEqual('/send-url')
    })

    it('should keep non data requests in their original shape', async () => {
      const res = await fetchViaHTTP(
        next.url,
        `/_next/static/${next.buildId}/_devMiddlewareManifest.json?foo=1`
      )
      expect(res.headers.get('req-url-path')).toEqual(
        `/_next/static/${next.buildId}/_devMiddlewareManifest.json?foo=1`
      )
    })

    it('should add a rewrite header on data requests for rewrites', async () => {
      const res = await fetchViaHTTP(next.url, `/ssr-page`)
      const dataRes = await fetchViaHTTP(
        next.url,
        `/_next/data/${next.buildId}${i18n ? '/en' : ''}/ssr-page.json`,
        undefined,
        { headers: { 'x-nextjs-data': '1' } }
      )
      const json = await dataRes.json()
      expect(json.pageProps.message).toEqual('Bye Cruel World')
      expect(res.headers.get('x-nextjs-matched-path')).toBeNull()
      expect(dataRes.headers.get('x-nextjs-matched-path')).toEqual(
        `${i18n ? '/en' : ''}/ssr-page-2`
      )
    })

    it(`hard-navigates when the data request failed`, async () => {
      const browser = await webdriver(next.url, `/error`)
      await browser.eval('window.__SAME_PAGE = true')
      await browser.elementByCss('#throw-on-data').click()
      await browser.waitForElementByCss('.refreshed')
      expect(await browser.eval('window.__SAME_PAGE')).toBeUndefined()
    })

    it('allows shallow linking with middleware', async () => {
      const browser = await webdriver(next.url, '/sha')
      const getMessageContents = () =>
        browser.elementById('message-contents').text()
      const ssrMessage = await getMessageContents()
      const requests: string[] = []

      browser.on('request', (x) => {
        requests.push(x.url())
      })

      await browser.elementById('deep-link').click()
      await browser.waitForElementByCss('[data-query-hello="goodbye"]')
      const deepLinkMessage = await getMessageContents()
      expect(deepLinkMessage).not.toEqual(ssrMessage)

      // Changing the route with a shallow link should not cause a server request
      await browser.elementById('shallow-link').click()
      await browser.waitForElementByCss('[data-query-hello="world"]')
      expect(await getMessageContents()).toEqual(deepLinkMessage)

      // Check that no server requests were made to ?hello=world,
      // as it's a shallow request.
      expect(requests.filter((req) => req.includes('_next/data'))).toEqual([
        `${next.url}/_next/data/${next.buildId}${
          i18n ? '/en' : ''
        }/sha.json?hello=goodbye`,
      ])
    })
  }
  describe('with i18n', () => {
    setup({ i18n: true })
    runTests({ i18n: true })
  })

  describe('without i18n', () => {
    setup({ i18n: false })
    runTests({ i18n: false })
  })
})
