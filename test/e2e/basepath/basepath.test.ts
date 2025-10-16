import url from 'url'
import assert from 'assert'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'
import { nextTestSetup } from 'e2e-utils'
import {
  assertNoRedbox,
  check,
  fetchViaHTTP,
  getClientBuildManifestLoaderChunkUrlPath,
  renderViaHTTP,
  waitFor,
} from 'next-test-utils'

describe('basePath', () => {
  const basePath = '/docs'

  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: __dirname,
    nextConfig: {
      basePath,
      onDemandEntries: {
        // Make sure entries are not getting disposed.
        maxInactiveAge: 1000 * 60 * 60,
      },
      async rewrites() {
        return [
          {
            source: '/rewrite-no-basepath',
            destination: 'https://example.vercel.sh',
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

  it('should navigate to external site and back', async () => {
    const browser = await webdriver(next.url, `${basePath}/external-and-back`)
    const initialText = await browser.elementByCss('p').text()
    expect(initialText).toBe('server')

    await browser
      .elementByCss('a')
      .click()
      .waitForElementByCss('input', { state: 'attached' })
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

  if (!isNextDev) {
    if (!isNextDeploy) {
      it('should add basePath to routes-manifest', async () => {
        const routesManifest = JSON.parse(
          await next.readFile('.next/routes-manifest.json')
        )
        expect(routesManifest.basePath).toBe(basePath)
      })

      it('should prefetch pages correctly when manually called', async () => {
        const browser = await webdriver(next.url, `${basePath}/other-page`)
        await browser.eval('window.next.router.prefetch("/gssp")')

        let chunk = getClientBuildManifestLoaderChunkUrlPath(
          next.testDir,
          '/gssp'
        )

        await check(
          async () => {
            const links = await browser.elementsByCss('link[rel=prefetch]')

            for (const link of links) {
              const href = await link.getAttribute('href')
              if (href.includes(chunk)) {
                return true
              }
            }

            const scripts = await browser.elementsByCss('script')

            for (const script of scripts) {
              const src = await script.getAttribute('src')
              if (src.includes(chunk)) {
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

          let chunkGsp = getClientBuildManifestLoaderChunkUrlPath(
            next.testDir,
            '/gsp'
          )
          let chunkGssp = getClientBuildManifestLoaderChunkUrlPath(
            next.testDir,
            '/gssp'
          )
          let chunkOtherPage = getClientBuildManifestLoaderChunkUrlPath(
            next.testDir,
            '/other-page'
          )

          const prefetches = await browser.eval(
            `[].slice.call(document.querySelectorAll("link[rel=prefetch]")).map((e) => new URL(e.href).pathname)`
          )
          expect(prefetches).toContainEqual(expect.stringContaining(chunkGsp))
          expect(prefetches).toContainEqual(expect.stringContaining(chunkGssp))
          expect(prefetches).toContainEqual(
            expect.stringContaining(chunkOtherPage)
          )
          return 'yes'
        }, 'yes')
      })
    }
  }

  it('should serve public file with basePath correctly', async () => {
    const res = await fetchViaHTTP(next.url, `${basePath}/data.txt`)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('hello world')
  })

  it('should 404 for public file without basePath', async () => {
    const res = await fetchViaHTTP(next.url, '/data.txt')
    expect(res.status).toBe(404)
  })

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
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({})
    expect(await browser.elementByCss('#pathname').text()).toBe('/')

    if (!isNextDev) {
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
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({})
    expect(await browser.elementByCss('#pathname').text()).toBe('/index')

    if (!isNextDev) {
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

  if (!isNextDeploy) {
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
      isNextDeploy ? 'NOT_FOUND' : 'This page could not be found'
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

  it('should allow URL query strings without refresh', async () => {
    const browser = await webdriver(next.url, `${basePath}/hello?query=true`)
    try {
      await browser.eval('window.itdidnotrefresh = "hello"')
      await new Promise((resolve, reject) => {
        // Timeout of EventSource created in setupPing()
        // (on-demand-entries-utils.js) is 5000 ms (see #13132, #13560)
        setTimeout(resolve, isNextDev ? 10000 : 1000)
      })
      expect(await browser.eval('window.itdidnotrefresh')).toBe('hello')

      const pathname = await browser.elementByCss('#pathname').text()
      expect(pathname).toBe('/hello')
      expect(await browser.eval('window.location.pathname')).toBe(
        `${basePath}/hello`
      )
      expect(await browser.eval('window.location.search')).toBe('?query=true')

      if (isNextDev) {
        await assertNoRedbox(browser)
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
        setTimeout(resolve, isNextDev ? 10000 : 1000)
      })
      expect(await browser.eval('window.itdidnotrefresh')).toBe('hello')

      const pathname = await browser.elementByCss('#pathname').text()
      expect(pathname).toBe('/')
      expect(await browser.eval('window.location.pathname')).toBe(basePath)
      expect(await browser.eval('window.location.search')).toBe('?query=true')

      if (isNextDev) {
        await assertNoRedbox(browser)
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
})
