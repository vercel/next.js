/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import webdriver from 'next-webdriver'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { check, fetchViaHTTP, waitFor } from 'next-test-utils'

describe('Middleware Runtime trailing slash', () => {
  let next: NextInstance

  afterAll(async () => {
    await next.destroy()
  })
  beforeAll(async () => {
    next = await createNext({
      files: {
        'next.config.js': new FileRef(join(__dirname, '../app/next.config.js')),
        'middleware.js': new FileRef(join(__dirname, '../app/middleware.js')),
        pages: new FileRef(join(__dirname, '../app/pages')),
      },
    })
  })

  function runTests() {
    describe('with .html extension', () => {
      it('should work when requesting the page directly', async () => {
        const $ = await next.render$(
          '/product/shirts_and_tops/mens_ua_playoff_polo_2.0/1327037.html'
        )
        expect($('#text').text()).toBe(
          'Param found: shirts_and_tops, mens_ua_playoff_polo_2.0, 1327037.html'
        )
      })

      it('should work using browser', async () => {
        const browser = await next.browser(
          '/product/shirts_and_tops/mens_ua_playoff_polo_2.0/1327037.html'
        )
        expect(await browser.elementByCss('#text').text()).toBe(
          'Param found: shirts_and_tops, mens_ua_playoff_polo_2.0, 1327037.html'
        )
      })

      it('should work when navigating', async () => {
        const browser = await next.browser('/html-links')
        await browser.elementByCss('#with-html').click()
        expect(await browser.waitForElementByCss('#text').text()).toBe(
          'Param found: shirts_and_tops, mens_ua_playoff_polo_2.0, 1327037.html'
        )
      })
    })

    describe('without .html extension', () => {
      it('should work when requesting the page directly', async () => {
        const $ = await next.render$(
          '/product/shirts_and_tops/mens_ua_playoff_polo_2.0/1327037'
        )
        expect($('#text').text()).toBe(
          'Param found: shirts_and_tops, mens_ua_playoff_polo_2.0, 1327037'
        )
      })

      it('should work using browser', async () => {
        const browser = await next.browser(
          '/product/shirts_and_tops/mens_ua_playoff_polo_2.0/1327037'
        )
        expect(await browser.elementByCss('#text').text()).toBe(
          'Param found: shirts_and_tops, mens_ua_playoff_polo_2.0, 1327037'
        )
      })

      it('should work when navigating', async () => {
        const browser = await next.browser('/html-links')
        await browser.elementByCss('#without-html').click()
        expect(await browser.waitForElementByCss('#text').text()).toBe(
          'Param found: shirts_and_tops, mens_ua_playoff_polo_2.0, 1327037'
        )
      })
    })

    if ((global as any).isNextDev) {
      it('refreshes the page when middleware changes ', async () => {
        const browser = await webdriver(next.url, `/about/`)
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
    }

    if ((global as any).isNextStart) {
      it('should have valid middleware field in manifest', async () => {
        const manifest = await fs.readJSON(
          join(next.testDir, '.next/server/middleware-manifest.json')
        )
        expect(manifest.middleware).toEqual({
          '/': {
            files: expect.arrayContaining([
              'prerender-manifest.js',
              'server/edge-runtime-webpack.js',
              'server/middleware.js',
            ]),
            name: 'middleware',
            page: '/',
            matchers: [{ regexp: '^/.*$', originalSource: '/:path*' }],
            wasm: [],
            assets: [],
          },
        })
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

        const res = await fetchViaHTTP(next.url, '/ssg/first/', undefined, {
          headers: {
            'x-prerender-revalidate': bypassToken,
          },
        })
        expect(res.status).toBe(200)
        expect(res.headers.get('x-middleware')).toBeFalsy()
        expect(res.headers.get('x-nextjs-cache')).toBe('REVALIDATED')
      })
    }

    it('should have init header for NextResponse.redirect', async () => {
      const res = await fetchViaHTTP(
        next.url,
        '/redirect-to-somewhere/',
        undefined,
        {
          redirect: 'manual',
        }
      )
      expect(res.status).toBe(307)
      expect(new URL(res.headers.get('location'), 'http://n').pathname).toBe(
        '/somewhere/'
      )
      expect(res.headers.get('x-redirect-header')).toBe('hi')
    })

    it('should have correct query values for rewrite to ssg page', async () => {
      const browser = await webdriver(next.url, '/to-ssg/')
      await browser.eval('window.beforeNav = 1')

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
      expect(await browser.elementByCss('#as-path').text()).toBe('/to-ssg/')
    })

    it('should have correct dynamic route params on client-transition to dynamic route', async () => {
      const browser = await webdriver(next.url, '/404')
      await check(
        () => browser.eval('next.router.isReady ? "yes" : "no"'),
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
      expect(await browser.elementByCss('#as-path').text()).toBe('/blog/first/')

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
      expect(await browser.elementByCss('#as-path').text()).toBe(
        '/blog/second/'
      )
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
        '/rewrite-to-dynamic/'
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
        '/rewrite-to-config-rewrite/'
      )
    })

    it('should have correct route params for rewrite from config dynamic route', async () => {
      const browser = await webdriver(next.url, '/404')
      await check(
        () => browser.eval('next.router.isReady ? "yes" : "no"'),
        'yes'
      )
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
      expect(await browser.elementByCss('#as-path').text()).toBe('/rewrite-3/')
    })

    it('should have correct route params for rewrite from config non-dynamic route', async () => {
      const browser = await webdriver(next.url, '/404')
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
      const res = await fetchViaHTTP(next.url, `/redirect-1/`, undefined, {
        redirect: 'manual',
      })
      expect(res.status).toBe(307)
      expect(new URL(res.headers.get('location'), 'http://n').pathname).toBe(
        '/somewhere/else/'
      )

      const browser = await webdriver(next.url, `/`)
      await browser.eval(`next.router.push('/redirect-1')`)
      await check(async () => {
        const pathname = await browser.eval('location.pathname')
        return pathname === '/somewhere/else/' ? 'success' : pathname
      }, 'success')
    })

    it('should rewrite the same for direct visit and client-transition', async () => {
      const res = await fetchViaHTTP(next.url, `/rewrite-1/`)
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
      const res = await fetchViaHTTP(next.url, `/rewrite-2/`)
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
      const res = await fetchViaHTTP(next.url, `/%2/`)
      expect(res.status).toBe(400)

      if ((global as any).isNextStart) {
        expect(await res.text()).toContain('Bad Request')
      }
    })

    it(`should validate & parse request url from any route`, async () => {
      const res = await fetchViaHTTP(next.url, `/static/`)

      expect(res.headers.get('req-url-basepath')).toBeFalsy()
      expect(res.headers.get('req-url-pathname')).toBe('/static/')

      const { pathname, params } = JSON.parse(res.headers.get('req-url-params'))
      expect(pathname).toBe(undefined)
      expect(params).toEqual(undefined)

      expect(res.headers.get('req-url-query')).not.toBe('bar')
    })

    it('should trigger middleware for data requests', async () => {
      const browser = await webdriver(next.url, `/ssr-page`)
      const text = await browser.elementByCss('h1').text()
      expect(text).toEqual('Bye Cruel World')
      const res = await fetchViaHTTP(
        next.url,
        `/_next/data/${next.buildId}/ssr-page.json`,
        undefined,
        {
          headers: {
            'x-nextjs-data': '1',
          },
        }
      )
      const json = await res.json()
      expect(json.pageProps.message).toEqual('Bye Cruel World')
    })

    it('should normalize data requests into page requests', async () => {
      const res = await fetchViaHTTP(
        next.url,
        `/_next/data/${next.buildId}/send-url.json`,
        undefined,
        {
          headers: {
            'x-nextjs-data': '1',
          },
        }
      )
      expect(res.headers.get('req-url-path')).toEqual('/send-url/')
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
      const res = await fetchViaHTTP(next.url, `/ssr-page/`)
      const dataRes = await fetchViaHTTP(
        next.url,
        `/_next/data/${next.buildId}/ssr-page.json`,
        undefined,
        { headers: { 'x-nextjs-data': '1' } }
      )
      const json = await dataRes.json()
      expect(json.pageProps.message).toEqual('Bye Cruel World')
      expect(res.headers.get('x-nextjs-matched-path')).toBeNull()
      expect(dataRes.headers.get('x-nextjs-matched-path')).toEqual(
        `/ssr-page-2`
      )
    })

    it('allows shallow linking with middleware', async () => {
      const browser = await webdriver(next.url, '/sha/')
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
        `${next.url}/_next/data/${next.buildId}/sha.json?hello=goodbye`,
      ])
    })
  }

  runTests()
})
