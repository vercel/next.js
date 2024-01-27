import url from 'url'
import { join } from 'path'
import assert from 'assert'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import {
  check,
  fetchViaHTTP,
  hasRedbox,
  renderViaHTTP,
  waitFor,
} from 'next-test-utils'

describe('basePath', () => {
  let next: NextInstance
  const basePath = '/docs'

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'basepath/pages')),
        public: new FileRef(join(__dirname, 'basepath/public')),
        external: new FileRef(join(__dirname, 'basepath/external')),
      },
      nextConfig: {
        basePath,
        onDemandEntries: {
          // Make sure entries are not getting disposed.
          maxInactiveAge: 1000 * 60 * 60,
        },
        async rewrites() {
          return [
            {
              source: '/rewrite-1',
              destination: '/gssp',
            },
            {
              source: '/rewrite-no-basepath',
              destination: 'https://example.vercel.sh',
              basePath: false,
            },
            {
              source: '/rewrite/chain-1',
              destination: '/rewrite/chain-2',
            },
            {
              source: '/rewrite/chain-2',
              destination: '/gssp',
            },
          ]
        },

        async redirects() {
          return [
            {
              source: '/redirect-1',
              destination: '/somewhere-else',
              permanent: false,
            },
            {
              source: '/redirect-no-basepath',
              destination: '/another-destination',
              permanent: false,
              basePath: false,
            },
          ]
        },

        async headers() {
          return [
            {
              source: '/add-header',
              headers: [
                {
                  key: 'x-hello',
                  value: 'world',
                },
              ],
            },
            {
              source: '/add-header-no-basepath',
              basePath: false,
              headers: [
                {
                  key: 'x-hello',
                  value: 'world',
                },
              ],
            },
          ]
        },
      },
    })
  })
  afterAll(() => next.destroy())

  const runTests = (isDev = false, isDeploy = false) => {
    it('should navigate to /404 correctly client-side', async () => {
      const browser = await webdriver(next.url, `${basePath}/slug-1`)
      await check(
        () => browser.eval('document.documentElement.innerHTML'),
        /slug-1/
      )

      await browser.eval('next.router.push("/404", "/slug-2")')
      await check(
        () => browser.eval('document.documentElement.innerHTML'),
        /page could not be found/
      )
      expect(await browser.eval('location.pathname')).toBe(`${basePath}/slug-2`)
    })

    it('should navigate to /_error correctly client-side', async () => {
      const browser = await webdriver(next.url, `${basePath}/slug-1`)
      await check(
        () => browser.eval('document.documentElement.innerHTML'),
        /slug-1/
      )

      await browser.eval('next.router.push("/_error", "/slug-2")')
      await check(
        () => browser.eval('document.documentElement.innerHTML'),
        /page could not be found/
      )
      expect(await browser.eval('location.pathname')).toBe(`${basePath}/slug-2`)
    })

    it('should navigate to external site and back', async () => {
      const browser = await webdriver(next.url, `${basePath}/external-and-back`)
      const initialText = await browser.elementByCss('p').text()
      expect(initialText).toBe('server')

      await browser
        .elementByCss('a')
        .click()
        .waitForElementByCss('input')
        .back()
        .waitForElementByCss('p')

      await waitFor(1000)
      const newText = await browser.elementByCss('p').text()
      expect(newText).toBe('server')
    })

    if (process.env.BROWSER_NAME === 'safari') {
      // currently only testing the above test in safari
      // we can investigate testing more cases below if desired
      return
    }

    it.each([
      { hash: '#hello?' },
      { hash: '#?' },
      { hash: '##' },
      { hash: '##?' },
      { hash: '##hello?' },
      { hash: '##hello' },
      { hash: '#hello?world' },
      { search: '?hello=world', hash: '#a', query: { hello: 'world' } },
      { search: '?hello', hash: '#a', query: { hello: '' } },
      { search: '?hello=', hash: '#a', query: { hello: '' } },
    ])(
      'should handle query/hash correctly during query updating $hash $search',
      async ({ hash, search, query }) => {
        const browser = await webdriver(
          next.url,
          `${basePath}${search || ''}${hash || ''}`
        )

        await check(
          () =>
            browser.eval('window.next.router.isReady ? "ready" : "not ready"'),
          'ready'
        )
        expect(await browser.eval('window.location.pathname')).toBe(basePath)
        expect(await browser.eval('window.location.search')).toBe(search || '')
        expect(await browser.eval('window.location.hash')).toBe(hash || '')
        expect(await browser.eval('next.router.pathname')).toBe('/')
        expect(
          JSON.parse(await browser.eval('JSON.stringify(next.router.query)'))
        ).toEqual(query || {})
      }
    )

    it('should navigate back correctly to a dynamic route', async () => {
      const browser = await webdriver(next.url, `${basePath}`)

      expect(await browser.elementByCss('#index-page').text()).toContain(
        'index page'
      )

      await browser.eval('window.beforeNav = 1')

      await browser.eval('window.next.router.push("/catchall/first")')

      await check(() => browser.elementByCss('p').text(), /first/)
      expect(await browser.eval('window.beforeNav')).toBe(1)

      await browser.eval('window.next.router.push("/catchall/second")')
      await check(() => browser.elementByCss('p').text(), /second/)
      expect(await browser.eval('window.beforeNav')).toBe(1)

      await browser.eval('window.next.router.back()')
      await check(() => browser.elementByCss('p').text(), /first/)
      expect(await browser.eval('window.beforeNav')).toBe(1)

      await browser.eval('window.history.forward()')
      await check(() => browser.elementByCss('p').text(), /second/)
      expect(await browser.eval('window.beforeNav')).toBe(1)
    })

    it('should respect basePath in amphtml link rel', async () => {
      const html = await renderViaHTTP(next.url, `${basePath}/amp-hybrid`)
      const $ = cheerio.load(html)
      const expectedAmpHtmlUrl = isDev
        ? `${basePath}/amp-hybrid?amp=1`
        : `${basePath}/amp-hybrid.amp`
      expect($('link[rel=amphtml]').first().attr('href')).toBe(
        expectedAmpHtmlUrl
      )
    })

    if (!isDev) {
      if (!(global as any).isNextDeploy) {
        it('should add basePath to routes-manifest', async () => {
          const routesManifest = JSON.parse(
            await next.readFile('.next/routes-manifest.json')
          )
          expect(routesManifest.basePath).toBe(basePath)
        })
      }

      it('should prefetch pages correctly when manually called', async () => {
        const browser = await webdriver(next.url, `${basePath}/other-page`)
        await browser.eval('window.next.router.prefetch("/gssp")')

        await check(
          async () => {
            const links = await browser.elementsByCss('link[rel=prefetch]')

            for (const link of links) {
              const href = await link.getAttribute('href')
              if (href.includes('gssp')) {
                return true
              }
            }

            const scripts = await browser.elementsByCss('script')

            for (const script of scripts) {
              const src = await script.getAttribute('src')
              if (src.includes('gssp')) {
                return true
              }
            }
            return false
          },
          {
            test(result) {
              return result === true
            },
          }
        )
      })

      it('should prefetch pages correctly in viewport with <Link>', async () => {
        const browser = await webdriver(next.url, `${basePath}/hello`)
        await browser.eval('window.next.router.prefetch("/gssp")')

        await check(async () => {
          const hrefs = await browser.eval(
            `Object.keys(window.next.router.sdc)`
          )
          hrefs.sort()

          assert.deepEqual(
            hrefs.map((href) =>
              new URL(href).pathname.replace(/\/_next\/data\/[^/]+/, '')
            ),
            [
              `${basePath}/gsp.json`,
              `${basePath}/index.json`,
              // `${basePath}/index/index.json`,
            ]
          )

          const prefetches = await browser.eval(
            `[].slice.call(document.querySelectorAll("link[rel=prefetch]")).map((e) => new URL(e.href).pathname)`
          )
          expect(prefetches).toContainEqual(
            expect.stringMatching(/\/gsp-[^./]+\.js/)
          )
          expect(prefetches).toContainEqual(
            expect.stringMatching(/\/gssp-[^./]+\.js/)
          )
          expect(prefetches).toContainEqual(
            expect.stringMatching(/\/other-page-[^./]+\.js/)
          )
          return 'yes'
        }, 'yes')
      })
    }

    it('should 404 for public file without basePath', async () => {
      const res = await fetchViaHTTP(next.url, '/data.txt')
      expect(res.status).toBe(404)
    })

    it('should serve public file with basePath correctly', async () => {
      const res = await fetchViaHTTP(next.url, `${basePath}/data.txt`)
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('hello world')
    })

    it('should rewrite with basePath by default', async () => {
      const html = await renderViaHTTP(next.url, `${basePath}/rewrite-1`)
      expect(html).toContain('getServerSideProps')
    })

    it('should not rewrite without basePath without disabling', async () => {
      const res = await fetchViaHTTP(next.url, '/rewrite-1')
      expect(res.status).toBe(404)
    })

    it('should not rewrite with basePath when set to false', async () => {
      // won't 404 as it matches the dynamic [slug] route
      const html = await renderViaHTTP(
        next.url,
        `${basePath}/rewrite-no-basePath`
      )
      expect(html).toContain('slug')
    })

    it('should rewrite without basePath when set to false', async () => {
      const html = await renderViaHTTP(next.url, '/rewrite-no-basePath')
      expect(html).toContain('Example Domain')
    })

    it('should redirect with basePath by default', async () => {
      const res = await fetchViaHTTP(
        next.url,
        `${basePath}/redirect-1`,
        undefined,
        {
          redirect: 'manual',
        }
      )
      const { pathname } = url.parse(res.headers.get('location') || '')
      expect(pathname).toBe(`${basePath}/somewhere-else`)
      expect(res.status).toBe(307)
      const text = await res.text()
      expect(text).toContain(`${basePath}/somewhere-else`)
    })

    it('should not redirect without basePath without disabling', async () => {
      const res = await fetchViaHTTP(next.url, '/redirect-1', undefined, {
        redirect: 'manual',
      })
      expect(res.status).toBe(404)
    })

    it('should not redirect with basePath when set to false', async () => {
      // won't 404 as it matches the dynamic [slug] route
      const html = await renderViaHTTP(
        next.url,
        `${basePath}/rewrite-no-basePath`
      )
      expect(html).toContain('slug')
    })

    it('should redirect without basePath when set to false', async () => {
      const res = await fetchViaHTTP(
        next.url,
        '/redirect-no-basepath',
        undefined,
        {
          redirect: 'manual',
        }
      )
      const { pathname } = url.parse(res.headers.get('location') || '')
      expect(pathname).toBe('/another-destination')
      expect(res.status).toBe(307)
      const text = await res.text()
      expect(text).toContain('/another-destination')
    })

    //
    it('should add header with basePath by default', async () => {
      const res = await fetchViaHTTP(next.url, `${basePath}/add-header`)
      expect(res.headers.get('x-hello')).toBe('world')
    })

    it('should not add header without basePath without disabling', async () => {
      const res = await fetchViaHTTP(next.url, '/add-header')
      expect(res.headers.get('x-hello')).toBe(null)
    })

    it('should not add header with basePath when set to false', async () => {
      const res = await fetchViaHTTP(
        next.url,
        `${basePath}/add-header-no-basepath`
      )
      expect(res.headers.get('x-hello')).toBe(null)
    })

    it('should add header without basePath when set to false', async () => {
      const res = await fetchViaHTTP(next.url, '/add-header-no-basepath')
      expect(res.headers.get('x-hello')).toBe('world')
    })

    it('should not update URL for a 404', async () => {
      const browser = await webdriver(next.url, '/missing')

      if (isDeploy) {
        // the custom 404 only shows inside of the basePath so this
        // will be the Vercel default 404 page
        expect(
          await browser.eval('document.documentElement.innerHTML')
        ).toContain('NOT_FOUND')
      } else {
        const pathname = await browser.eval(() => window.location.pathname)
        expect(
          await browser.eval(() => (window as any).next.router.asPath)
        ).toBe('/missing')
        expect(pathname).toBe('/missing')
      }
    })

    it('should handle 404 urls that start with basePath', async () => {
      const browser = await webdriver(next.url, `${basePath}hello`)

      if (isDeploy) {
        // the custom 404 only shows inside of the basePath so this
        // will be the Vercel default 404 page
        expect(
          await browser.eval('document.documentElement.innerHTML')
        ).toContain('NOT_FOUND')
      } else {
        expect(
          await browser.eval(() => (window as any).next.router.asPath)
        ).toBe(`${basePath}hello`)
        expect(await browser.eval(() => window.location.pathname)).toBe(
          `${basePath}hello`
        )
      }
    })

    // TODO: this test has been passing incorrectly since the below check
    // wasn't being awaited. We need to investigate if this test is
    // correct or not.
    it.skip('should navigate back to a non-basepath 404 that starts with basepath', async () => {
      const browser = await webdriver(next.url, `${basePath}hello`)
      await browser.eval(() => ((window as any).navigationMarker = true))
      await browser.eval(() => (window as any).next.router.push('/hello'))
      await browser.waitForElementByCss('#pathname')
      await browser.back()
      await check(
        () => browser.eval(() => window.location.pathname),
        `${basePath}hello`
      )
      expect(await browser.eval(() => (window as any).next.router.asPath)).toBe(
        `${basePath}hello`
      )
      expect(await browser.eval(() => (window as any).navigationMarker)).toBe(
        true
      )
    })

    it('should update dynamic params after mount correctly', async () => {
      const browser = await webdriver(next.url, `${basePath}/hello-dynamic`)
      await check(
        () => browser.elementByCss('#slug').text(),
        /slug: hello-dynamic/
      )
    })

    it('should navigate to index page with getStaticProps', async () => {
      const browser = await webdriver(next.url, `${basePath}/hello`)
      await browser.eval('window.beforeNavigate = "hi"')

      await browser.elementByCss('#index-gsp').click()
      await browser.waitForElementByCss('#prop')

      expect(await browser.eval('window.beforeNavigate')).toBe('hi')
      expect(await browser.elementByCss('#prop').text()).toBe('hello world')
      expect(await browser.elementByCss('#nested').text()).toBe('no')
      expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual(
        {}
      )
      expect(await browser.elementByCss('#pathname').text()).toBe('/')

      if (!isDev) {
        const hrefs = await browser.eval(`Object.keys(window.next.router.sdc)`)
        hrefs.sort()

        expect(
          hrefs.map((href) =>
            new URL(href).pathname.replace(/\/_next\/data\/[^/]+/, '')
          )
        ).toEqual([
          `${basePath}/gsp.json`,
          `${basePath}/index.json`,
          // `${basePath}/index/index.json`,
        ])
      }
    })

    // TODO: investigate index/index seems this shouldn't work
    // as pages/index.js conflicts with pages/index/index.js
    it.skip('should navigate to nested index page with getStaticProps', async () => {
      const browser = await webdriver(next.url, `${basePath}/hello`)
      await browser.eval('window.beforeNavigate = "hi"')

      await browser.elementByCss('#nested-index-gsp').click()
      await browser.waitForElementByCss('#prop')

      expect(await browser.eval('window.beforeNavigate')).toBe('hi')
      expect(await browser.elementByCss('#prop').text()).toBe('hello world')
      expect(await browser.elementByCss('#nested').text()).toBe('yes')
      expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual(
        {}
      )
      expect(await browser.elementByCss('#pathname').text()).toBe('/index')

      if (!isDev) {
        const hrefs = await browser.eval(`Object.keys(window.next.router.sdc)`)
        hrefs.sort()

        expect(
          hrefs.map((href) =>
            new URL(href).pathname.replace(/\/_next\/data\/[^/]+/, '')
          )
        ).toEqual([
          `${basePath}/gsp.json`,
          `${basePath}/index.json`,
          `${basePath}/index/index.json`,
        ])
      }
    })

    it('should work with nested folder with same name as basePath', async () => {
      const html = await renderViaHTTP(next.url, `${basePath}/docs/another`)
      expect(html).toContain('hello from another')

      const browser = await webdriver(next.url, `${basePath}/hello`)
      await browser.eval('window.next.router.push("/docs/another")')

      await check(() => browser.elementByCss('p').text(), /hello from another/)
    })

    it('should work with normal dynamic page', async () => {
      const browser = await webdriver(next.url, `${basePath}/hello`)
      await browser.elementByCss('#dynamic-link').click()
      await check(
        () => browser.eval(() => document.documentElement.innerHTML),
        /slug: first/
      )
    })

    it('should work with hash links', async () => {
      const browser = await webdriver(next.url, `${basePath}/hello`)
      await browser.elementByCss('#hashlink').click()
      const url = new URL(await browser.eval(() => window.location.href))
      expect(url.pathname).toBe(`${basePath}/hello`)
      expect(url.hash).toBe('#hashlink')
    })

    it('should work with catch-all page', async () => {
      const browser = await webdriver(next.url, `${basePath}/hello`)
      await browser.elementByCss('#catchall-link').click()
      await check(
        () => browser.eval(() => document.documentElement.innerHTML),
        /parts: hello\/world/
      )
    })

    it('should redirect trailing slash correctly', async () => {
      const res = await fetchViaHTTP(
        next.url,
        `${basePath}/hello/`,
        {},
        { redirect: 'manual' }
      )
      expect(res.status).toBe(308)
      const { pathname } = new URL(res.headers.get('location'))
      expect(pathname).toBe(`${basePath}/hello`)
      const text = await res.text()
      expect(text).toContain(`${basePath}/hello`)
    })

    it('should redirect trailing slash on root correctly', async () => {
      const res = await fetchViaHTTP(
        next.url,
        `${basePath}/`,
        {},
        { redirect: 'manual' }
      )
      expect(res.status).toBe(308)
      const { pathname } = new URL(res.headers.get('location'))
      expect(pathname).toBe(`${basePath}`)
      const text = await res.text()
      expect(text).toContain(`${basePath}`)
    })

    it('should navigate an absolute url', async () => {
      const browser = await webdriver(next.url, `${basePath}/absolute-url`)
      await browser.waitForElementByCss('#absolute-link').click()
      await check(
        () => browser.eval(() => window.location.origin),
        'https://vercel.com'
      )
    })

    if (!(global as any).isNextDeploy) {
      it('should navigate an absolute local url with basePath', async () => {
        const browser = await webdriver(
          next.url,
          `${basePath}/absolute-url-basepath?port=${next.appPort}`
        )
        await browser.eval('window._didNotNavigate = true')
        await browser.waitForElementByCss('#absolute-link').click()
        const text = await browser
          .waitForElementByCss('#something-else-page')
          .text()

        expect(text).toBe('something else')
        expect(await browser.eval('window._didNotNavigate')).toBe(true)
      })

      it('should navigate an absolute local url without basePath', async () => {
        const browser = await webdriver(
          next.url,
          `${basePath}/absolute-url-no-basepath?port=${next.appPort}`
        )
        await browser.waitForElementByCss('#absolute-link').click()
        await check(
          () => browser.eval(() => location.pathname),
          '/rewrite-no-basepath'
        )
        const text = await browser.elementByCss('body').text()

        expect(text).toContain('Example Domain')
      })
    }

    it('should 404 when manually adding basePath with <Link>', async () => {
      const browser = await webdriver(
        next.url,
        `${basePath}/invalid-manual-basepath`
      )
      await browser.eval('window.beforeNav = "hi"')
      await browser.elementByCss('#other-page-link').click()

      await check(() => browser.eval('window.beforeNav'), {
        test(content) {
          return content !== 'hi'
        },
      })

      await check(
        () => browser.eval('document.documentElement.innerHTML'),
        /This page could not be found/
      )
    })

    it('should 404 when manually adding basePath with router.push', async () => {
      const browser = await webdriver(next.url, `${basePath}/hello`)
      await browser.eval('window.beforeNav = "hi"')
      await browser.eval(`window.next.router.push("${basePath}/other-page")`)

      await check(() => browser.eval('window.beforeNav'), {
        test(content) {
          return content !== 'hi'
        },
      })

      const html = await browser.eval('document.documentElement.innerHTML')
      expect(html).toContain('This page could not be found')
    })

    it('should 404 when manually adding basePath with router.replace', async () => {
      const browser = await webdriver(next.url, `${basePath}/hello`)
      await browser.eval('window.beforeNav = "hi"')
      await browser.eval(`window.next.router.replace("${basePath}/other-page")`)

      await check(() => browser.eval('window.beforeNav'), {
        test(content) {
          return content !== 'hi'
        },
      })

      const html = await browser.eval('document.documentElement.innerHTML')
      expect(html).toContain('This page could not be found')
    })

    it('should show the hello page under the /docs prefix', async () => {
      const browser = await webdriver(next.url, `${basePath}/hello`)
      try {
        const text = await browser.elementByCss('h1').text()
        expect(text).toBe('Hello World')
      } finally {
        await browser.close()
      }
    })

    it('should have correct router paths on first load of /', async () => {
      const browser = await webdriver(next.url, `${basePath}`)
      await browser.waitForElementByCss('#pathname')
      const pathname = await browser.elementByCss('#pathname').text()
      expect(pathname).toBe('/')
      const asPath = await browser.elementByCss('#as-path').text()
      expect(asPath).toBe('/')
    })

    it('should have correct router paths on first load of /hello', async () => {
      const browser = await webdriver(next.url, `${basePath}/hello`)
      await browser.waitForElementByCss('#pathname')
      const pathname = await browser.elementByCss('#pathname').text()
      expect(pathname).toBe('/hello')
      const asPath = await browser.elementByCss('#as-path').text()
      expect(asPath).toBe('/hello')
    })

    it('should fetch data for getStaticProps without reloading', async () => {
      const browser = await webdriver(next.url, `${basePath}/hello`)
      await browser.eval('window.beforeNavigate = true')
      await browser.elementByCss('#gsp-link').click()
      await browser.waitForElementByCss('#gsp')
      expect(await browser.eval('window.beforeNavigate')).toBe(true)

      const props = JSON.parse(await browser.elementByCss('#props').text())
      expect(props.hello).toBe('world')

      const pathname = await browser.elementByCss('#pathname').text()
      expect(pathname).toBe('/gsp')
    })

    it('should fetch data for getServerSideProps without reloading', async () => {
      const browser = await webdriver(next.url, `${basePath}/hello`)
      await browser.eval('window.beforeNavigate = true')
      await browser.elementByCss('#gssp-link').click()
      await browser.waitForElementByCss('#gssp')
      expect(await browser.eval('window.beforeNavigate')).toBe(true)

      const props = JSON.parse(await browser.elementByCss('#props').text())
      expect(props.hello).toBe('world')

      const pathname = await browser.elementByCss('#pathname').text()
      const asPath = await browser.elementByCss('#asPath').text()
      expect(pathname).toBe('/gssp')
      expect(asPath).toBe('/gssp')
    })

    it('should have correct href for a link', async () => {
      const browser = await webdriver(next.url, `${basePath}/hello`)
      const href = await browser.elementByCss('a').getAttribute('href')
      const { pathname } = url.parse(href)
      expect(pathname).toBe(`${basePath}/other-page`)
    })

    it('should have correct href for a link to /', async () => {
      const browser = await webdriver(next.url, `${basePath}/link-to-root`)
      const href = await browser.elementByCss('#link-back').getAttribute('href')
      const { pathname } = url.parse(href)
      expect(pathname).toBe(`${basePath}`)
    })

    it('should show 404 for page not under the /docs prefix', async () => {
      const text = await renderViaHTTP(next.url, '/hello')
      expect(text).not.toContain('Hello World')
      expect(text).toContain(
        isDeploy ? 'NOT_FOUND' : 'This page could not be found'
      )
    })

    it('should show the other-page page under the /docs prefix', async () => {
      const browser = await webdriver(next.url, `${basePath}/other-page`)
      try {
        const text = await browser.elementByCss('h1').text()
        expect(text).toBe('Hello Other')
      } finally {
        await browser.close()
      }
    })

    it('should have basePath field on Router', async () => {
      const html = await renderViaHTTP(next.url, `${basePath}/hello`)
      const $ = cheerio.load(html)
      expect($('#base-path').text()).toBe(`${basePath}`)
    })

    it('should navigate to the page without refresh', async () => {
      const browser = await webdriver(next.url, `${basePath}/hello`)
      try {
        await browser.eval('window.itdidnotrefresh = "hello"')
        const text = await browser
          .elementByCss('#other-page-link')
          .click()
          .waitForElementByCss('#other-page-title')
          .elementByCss('h1')
          .text()

        expect(text).toBe('Hello Other')
        expect(await browser.eval('window.itdidnotrefresh')).toBe('hello')
      } finally {
        await browser.close()
      }
    })

    it('should use urls with basepath in router events', async () => {
      const browser = await webdriver(next.url, `${basePath}/hello`)
      try {
        await check(
          () => browser.eval('window.next.router.isReady ? "ready" : "no"'),
          'ready'
        )
        await browser.eval('window._clearEventLog()')
        await browser
          .elementByCss('#other-page-link')
          .click()
          .waitForElementByCss('#other-page-title')

        const eventLog = await browser.eval('window._getEventLog()')
        expect(
          eventLog.filter((item) => item[1]?.endsWith('/other-page'))
        ).toEqual([
          ['routeChangeStart', `${basePath}/other-page`, { shallow: false }],
          ['beforeHistoryChange', `${basePath}/other-page`, { shallow: false }],
          ['routeChangeComplete', `${basePath}/other-page`, { shallow: false }],
        ])
      } finally {
        await browser.close()
      }
    })

    it('should use urls with basepath in router events for hash changes', async () => {
      const browser = await webdriver(next.url, `${basePath}/hello`)
      try {
        await check(
          () => browser.eval('window.next.router.isReady ? "ready" : "no"'),
          'ready'
        )
        await browser.eval('window._clearEventLog()')
        await browser.elementByCss('#hash-change').click()

        const eventLog = await browser.eval('window._getEventLog()')
        expect(eventLog).toEqual([
          [
            'hashChangeStart',
            `${basePath}/hello#some-hash`,
            { shallow: false },
          ],
          [
            'hashChangeComplete',
            `${basePath}/hello#some-hash`,
            { shallow: false },
          ],
        ])
      } finally {
        await browser.close()
      }
    })

    it('should use urls with basepath in router events for cancelled routes', async () => {
      const browser = await webdriver(next.url, `${basePath}/hello`)
      try {
        await check(
          () => browser.eval('window.next.router.isReady ? "ready" : "no"'),
          'ready'
        )
        await browser.eval('window._clearEventLog()')

        await browser
          .elementByCss('#slow-route')
          .click()
          .elementByCss('#other-page-link')
          .click()
          .waitForElementByCss('#other-page-title')

        const eventLog = await browser.eval('window._getEventLog()')
        expect(eventLog).toEqual([
          ['routeChangeStart', `${basePath}/slow-route`, { shallow: false }],
          [
            'routeChangeError',
            'Route Cancelled',
            true,
            `${basePath}/slow-route`,
            { shallow: false },
          ],
          ['routeChangeStart', `${basePath}/other-page`, { shallow: false }],
          ['beforeHistoryChange', `${basePath}/other-page`, { shallow: false }],
          ['routeChangeComplete', `${basePath}/other-page`, { shallow: false }],
        ])
      } finally {
        await browser.close()
      }
    })

    it('should use urls with basepath in router events for failed route change', async () => {
      const browser = await webdriver(next.url, `${basePath}/hello`)
      try {
        await check(
          () => browser.eval('window.next.router.isReady ? "ready" : "no"'),
          'ready'
        )
        await browser.eval('window._clearEventLog()')
        await browser.elementByCss('#error-route').click()

        await check(async () => {
          const eventLog = await browser.eval('window._getEventLog()')
          assert.deepEqual(eventLog, [
            ['routeChangeStart', `${basePath}/error-route`, { shallow: false }],
            [
              'routeChangeError',
              'Failed to load static props',
              null,
              `${basePath}/error-route`,
              { shallow: false },
            ],
          ])
          return 'success'
        }, 'success')
      } finally {
        await browser.close()
      }
    })

    it('should allow URL query strings without refresh', async () => {
      const browser = await webdriver(next.url, `${basePath}/hello?query=true`)
      try {
        await browser.eval('window.itdidnotrefresh = "hello"')
        await new Promise((resolve, reject) => {
          // Timeout of EventSource created in setupPing()
          // (on-demand-entries-utils.js) is 5000 ms (see #13132, #13560)
          setTimeout(resolve, isDev ? 10000 : 1000)
        })
        expect(await browser.eval('window.itdidnotrefresh')).toBe('hello')

        const pathname = await browser.elementByCss('#pathname').text()
        expect(pathname).toBe('/hello')
        expect(await browser.eval('window.location.pathname')).toBe(
          `${basePath}/hello`
        )
        expect(await browser.eval('window.location.search')).toBe('?query=true')

        if (isDev) {
          expect(await hasRedbox(browser)).toBe(false)
        }
      } finally {
        await browser.close()
      }
    })

    it('should allow URL query strings on index without refresh', async () => {
      const browser = await webdriver(next.url, `${basePath}?query=true`)
      try {
        await browser.eval('window.itdidnotrefresh = "hello"')
        await new Promise((resolve, reject) => {
          // Timeout of EventSource created in setupPing()
          // (on-demand-entries-utils.js) is 5000 ms (see #13132, #13560)
          setTimeout(resolve, isDev ? 10000 : 1000)
        })
        expect(await browser.eval('window.itdidnotrefresh')).toBe('hello')

        const pathname = await browser.elementByCss('#pathname').text()
        expect(pathname).toBe('/')
        expect(await browser.eval('window.location.pathname')).toBe(basePath)
        expect(await browser.eval('window.location.search')).toBe('?query=true')

        if (isDev) {
          expect(await hasRedbox(browser)).toBe(false)
        }
      } finally {
        await browser.close()
      }
    })

    it('should correctly replace state when same asPath but different url', async () => {
      const browser = await webdriver(next.url, `${basePath}`)
      try {
        await browser.elementByCss('#hello-link').click()
        await browser.waitForElementByCss('#something-else-link')
        await browser.elementByCss('#something-else-link').click()
        await browser.waitForElementByCss('#something-else-page')
        await browser.back()
        await browser.waitForElementByCss('#index-page')
        await browser.forward()
        await browser.waitForElementByCss('#something-else-page')
      } finally {
        await browser.close()
      }
    })
  }
  runTests((global as any).isNextDev, (global as any).isNextDeploy)
})
