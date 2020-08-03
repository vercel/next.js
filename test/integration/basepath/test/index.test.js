/* eslint-env jest */

import webdriver from 'next-webdriver'
import { join } from 'path'
import url from 'url'
import {
  nextServer,
  launchApp,
  findPort,
  killApp,
  nextBuild,
  startApp,
  stopApp,
  waitFor,
  check,
  getBrowserBodyText,
  renderViaHTTP,
  File,
  nextStart,
  initNextServerScript,
  getRedboxSource,
  hasRedbox,
  fetchViaHTTP,
} from 'next-test-utils'
import fs, {
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
} from 'fs-extra'
import cheerio from 'cheerio'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '..')

const runTests = (context, dev = false) => {
  if (dev) {
    it('should render error in dev overlay correctly', async () => {
      const browser = await webdriver(context.appPort, '/docs/hello')
      await browser.elementByCss('#trigger-error').click()
      expect(await hasRedbox(browser)).toBe(true)

      const errorSource = await getRedboxSource(browser)
      expect(errorSource).toMatchInlineSnapshot(`
        "pages${
          process.platform === 'win32' ? '\\\\' : '/'
        }hello.js (56:14) @ onClick

          54 |   id=\\"trigger-error\\"
          55 |   onClick={() => {
        > 56 |     throw new Error('oops heres an error')
             |          ^
          57 |   }}
          58 | >
          59 |   click me for error"
      `)
    })
  } else {
    it('should add basePath to routes-manifest', async () => {
      const routesManifest = await fs.readJSON(
        join(appDir, '.next/routes-manifest.json')
      )
      expect(routesManifest.basePath).toBe('/docs')
    })

    it('should prefetch pages correctly when manually called', async () => {
      const browser = await webdriver(context.appPort, '/docs/other-page')
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
      const browser = await webdriver(context.appPort, '/docs/hello')
      await browser.eval('window.next.router.prefetch("/gssp")')

      await check(
        async () => {
          const links = await browser.elementsByCss('link[rel=prefetch]')
          let found = new Set()

          for (const link of links) {
            const href = await link.getAttribute('href')
            if (href.match(/(gsp|gssp|other-page)-.*?\.js$/)) {
              found.add(href)
            }
            if (href.match(/gsp\.json$/)) {
              found.add(href)
            }
          }
          return found
        },
        {
          test(result) {
            return result.size === 4
          },
        }
      )
    })
  }

  it('should rewrite with basePath by default', async () => {
    const html = await renderViaHTTP(context.appPort, '/docs/rewrite-1')
    expect(html).toContain('getServerSideProps')
  })

  it('should not rewrite without basePath without disabling', async () => {
    const res = await fetchViaHTTP(context.appPort, '/rewrite-1')
    expect(res.status).toBe(404)
  })

  it('should not rewrite with basePath when set to false', async () => {
    // won't 404 as it matches the dynamic [slug] route
    const html = await renderViaHTTP(
      context.appPort,
      '/docs/rewrite-no-basePath'
    )
    expect(html).toContain('slug')
  })

  it('should rewrite without basePath when set to false', async () => {
    const html = await renderViaHTTP(context.appPort, '/rewrite-no-basePath')
    expect(html).toContain('getServerSideProps')
  })

  it('should have correct asPath for rewrite without basePath', async () => {
    const browser = await webdriver(context.appPort, '/rewrite-no-basePath')
    expect(await browser.eval(() => window.location.pathname)).toBe(
      '/rewrite-no-basePath'
    )
    expect(await browser.eval(() => window.next.router.asPath)).toBe(
      '/rewrite-no-basePath'
    )
    expect(await browser.eval(() => window.next.router.pathname)).toBe('/gssp')
  })

  it('should have correct asPath for rewrite without basePath on back()', async () => {
    const browser = await webdriver(context.appPort, '/rewrite-no-basePath')
    await browser.eval(() => (window.navigationMarker = true))
    await browser.eval(() => window.next.router.push('/hello'))
    await check(
      () => browser.eval(() => window.location.pathname),
      '/docs/hello'
    )
    await browser.back()
    await check(
      () => browser.eval(() => window.location.pathname),
      '/rewrite-no-basePath'
    )
    await check(
      () => browser.eval(() => window.next.router.asPath),
      '/rewrite-no-basePath'
    )
    expect(await browser.eval(() => window.next.router.pathname)).toBe('/gssp')
    expect(await browser.eval(() => window.navigationMarker)).toBe(true)
  })

  it('should redirect with basePath by default', async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      '/docs/redirect-1',
      undefined,
      {
        redirect: 'manual',
      }
    )
    const { pathname } = url.parse(res.headers.get('location') || '')
    expect(pathname).toBe('/docs/somewhere-else')
    expect(res.status).toBe(307)
  })

  it('should not redirect without basePath without disabling', async () => {
    const res = await fetchViaHTTP(context.appPort, '/redirect-1', undefined, {
      redirect: 'manual',
    })
    expect(res.status).toBe(404)
  })

  it('should not redirect with basePath when set to false', async () => {
    // won't 404 as it matches the dynamic [slug] route
    const html = await renderViaHTTP(
      context.appPort,
      '/docs/rewrite-no-basePath'
    )
    expect(html).toContain('slug')
  })

  it('should redirect without basePath when set to false', async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      '/redirect-no-basepath',
      undefined,
      {
        redirect: 'manual',
      }
    )
    const { pathname } = url.parse(res.headers.get('location') || '')
    expect(pathname).toBe('/another-destination')
    expect(res.status).toBe(307)
  })

  //
  it('should add header with basePath by default', async () => {
    const res = await fetchViaHTTP(context.appPort, '/docs/add-header')
    expect(res.headers.get('x-hello')).toBe('world')
  })

  it('should not add header without basePath without disabling', async () => {
    const res = await fetchViaHTTP(context.appPort, '/add-header')
    expect(res.headers.get('x-hello')).toBe(null)
  })

  it('should not add header with basePath when set to false', async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      '/docs/add-header-no-basepath'
    )
    expect(res.headers.get('x-hello')).toBe(null)
  })

  it('should add header without basePath when set to false', async () => {
    const res = await fetchViaHTTP(context.appPort, '/add-header-no-basepath')
    expect(res.headers.get('x-hello')).toBe('world')
  })

  it('should not update URL for a 404', async () => {
    const browser = await webdriver(context.appPort, '/missing')
    const pathname = await browser.eval(() => window.location.pathname)
    expect(await browser.eval(() => window.next.router.asPath)).toBe('/missing')
    expect(pathname).toBe('/missing')
  })

  it('should handle 404 urls that start with basePath', async () => {
    const browser = await webdriver(context.appPort, '/docshello')
    expect(await browser.eval(() => window.next.router.asPath)).toBe(
      '/docshello'
    )
    expect(await browser.eval(() => window.location.pathname)).toBe(
      '/docshello'
    )
  })

  it('should navigating back to a non-basepath 404 that starts with basepath', async () => {
    const browser = await webdriver(context.appPort, '/docshello')
    await browser.eval(() => window.next.router.push('/hello'))
    await browser.waitForElementByCss('#pathname')
    await browser.back()
    check(() => browser.eval(() => window.location.pathname), '/docshello')
    expect(await browser.eval(() => window.next.router.asPath)).toBe(
      '/docshello'
    )
  })

  it('should update dynamic params after mount correctly', async () => {
    const browser = await webdriver(context.appPort, '/docs/hello-dynamic')
    const text = await browser.elementByCss('#slug').text()
    expect(text).toContain('slug: hello-dynamic')
  })

  it('should navigate to index page with getStaticProps', async () => {
    const browser = await webdriver(context.appPort, '/docs/hello')
    await browser.eval('window.beforeNavigate = "hi"')

    await browser.elementByCss('#index-gsp').click()
    await browser.waitForElementByCss('#prop')

    expect(await browser.eval('window.beforeNavigate')).toBe('hi')
    expect(await browser.elementByCss('#prop').text()).toBe('hello world')
    expect(await browser.elementByCss('#nested').text()).toBe('no')
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({})
    expect(await browser.elementByCss('#pathname').text()).toBe('/')

    if (!dev) {
      const prefetches = await browser.elementsByCss('link[rel="prefetch"]')
      let found = false

      for (const prefetch of prefetches) {
        const fullHref = await prefetch.getAttribute('href')
        const href = url.parse(fullHref).pathname

        if (
          href.startsWith('/docs/_next/data') &&
          href.endsWith('index.json') &&
          !href.endsWith('index/index.json')
        ) {
          found = true
        }
      }

      expect(found).toBe(true)
    }
  })

  it('should navigate to nested index page with getStaticProps', async () => {
    const browser = await webdriver(context.appPort, '/docs/hello')
    await browser.eval('window.beforeNavigate = "hi"')

    await browser.elementByCss('#nested-index-gsp').click()
    await browser.waitForElementByCss('#prop')

    expect(await browser.eval('window.beforeNavigate')).toBe('hi')
    expect(await browser.elementByCss('#prop').text()).toBe('hello world')
    expect(await browser.elementByCss('#nested').text()).toBe('yes')
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({})
    expect(await browser.elementByCss('#pathname').text()).toBe('/index')

    if (!dev) {
      const prefetches = await browser.elementsByCss('link[rel="prefetch"]')
      let found = false

      for (const prefetch of prefetches) {
        const fullHref = await prefetch.getAttribute('href')
        const href = url.parse(fullHref).pathname

        if (
          href.startsWith('/docs/_next/data') &&
          href.endsWith('index/index.json')
        ) {
          found = true
        }
      }

      expect(found).toBe(true)
    }
  })

  it('should work with nested folder with same name as basePath', async () => {
    const html = await renderViaHTTP(context.appPort, '/docs/docs/another')
    expect(html).toContain('hello from another')

    const browser = await webdriver(context.appPort, '/docs/hello')
    await browser.eval('window.next.router.push("/docs/another")')

    await check(() => browser.elementByCss('p').text(), /hello from another/)
  })

  it('should work with normal dynamic page', async () => {
    const browser = await webdriver(context.appPort, '/docs/hello')
    await browser.elementByCss('#dynamic-link').click()
    await check(
      () => browser.eval(() => document.documentElement.innerHTML),
      /slug: first/
    )
  })

  it('should work with hash links', async () => {
    const browser = await webdriver(context.appPort, '/docs/hello')
    await browser.elementByCss('#hashlink').click()
    const url = new URL(await browser.eval(() => window.location.href))
    expect(url.pathname).toBe('/docs/hello')
    expect(url.hash).toBe('#hashlink')
  })

  it('should work with catch-all page', async () => {
    const browser = await webdriver(context.appPort, '/docs/hello')
    await browser.elementByCss('#catchall-link').click()
    await check(
      () => browser.eval(() => document.documentElement.innerHTML),
      /parts: hello\/world/
    )
  })

  it('should redirect trailing slash correctly', async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      '/docs/hello/',
      {},
      { redirect: 'manual' }
    )
    expect(res.status).toBe(308)
    const { pathname } = new URL(res.headers.get('location'))
    expect(pathname).toBe('/docs/hello')
  })

  it('should redirect trailing slash on root correctly', async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      '/docs/',
      {},
      { redirect: 'manual' }
    )
    expect(res.status).toBe(308)
    const { pathname } = new URL(res.headers.get('location'))
    expect(pathname).toBe('/docs')
  })

  it('should 404 when manually adding basePath with <Link>', async () => {
    const browser = await webdriver(
      context.appPort,
      '/docs/invalid-manual-basepath'
    )
    await browser.eval('window.beforeNav = "hi"')
    await browser.elementByCss('#other-page-link').click()

    await check(() => browser.eval('window.beforeNav'), {
      test(content) {
        return content !== 'hi'
      },
    })

    const html = await browser.eval('document.documentElement.innerHTML')
    expect(html).toContain('This page could not be found')
  })

  it('should 404 when manually adding basePath with router.push', async () => {
    const browser = await webdriver(context.appPort, '/docs/hello')
    await browser.eval('window.beforeNav = "hi"')
    await browser.eval('window.next.router.push("/docs/other-page")')

    await check(() => browser.eval('window.beforeNav'), {
      test(content) {
        return content !== 'hi'
      },
    })

    const html = await browser.eval('document.documentElement.innerHTML')
    expect(html).toContain('This page could not be found')
  })

  it('should 404 when manually adding basePath with router.replace', async () => {
    const browser = await webdriver(context.appPort, '/docs/hello')
    await browser.eval('window.beforeNav = "hi"')
    await browser.eval('window.next.router.replace("/docs/other-page")')

    await check(() => browser.eval('window.beforeNav'), {
      test(content) {
        return content !== 'hi'
      },
    })

    const html = await browser.eval('document.documentElement.innerHTML')
    expect(html).toContain('This page could not be found')
  })

  it('should show the hello page under the /docs prefix', async () => {
    const browser = await webdriver(context.appPort, '/docs/hello')
    try {
      const text = await browser.elementByCss('h1').text()
      expect(text).toBe('Hello World')
    } finally {
      await browser.close()
    }
  })

  it('should have correct router paths on first load of /', async () => {
    const browser = await webdriver(context.appPort, '/docs')
    await browser.waitForElementByCss('#pathname')
    const pathname = await browser.elementByCss('#pathname').text()
    expect(pathname).toBe('/')
    const asPath = await browser.elementByCss('#as-path').text()
    expect(asPath).toBe('/')
  })

  it('should have correct router paths on first load of /hello', async () => {
    const browser = await webdriver(context.appPort, '/docs/hello')
    await browser.waitForElementByCss('#pathname')
    const pathname = await browser.elementByCss('#pathname').text()
    expect(pathname).toBe('/hello')
    const asPath = await browser.elementByCss('#as-path').text()
    expect(asPath).toBe('/hello')
  })

  it('should fetch data for getStaticProps without reloading', async () => {
    const browser = await webdriver(context.appPort, '/docs/hello')
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
    const browser = await webdriver(context.appPort, '/docs/hello')
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
    const browser = await webdriver(context.appPort, '/docs/hello')
    const href = await browser.elementByCss('a').getAttribute('href')
    const { pathname } = url.parse(href)
    expect(pathname).toBe('/docs/other-page')
  })

  it('should have correct href for a link to /', async () => {
    const browser = await webdriver(context.appPort, '/docs/link-to-root')
    const href = await browser.elementByCss('#link-back').getAttribute('href')
    const { pathname } = url.parse(href)
    expect(pathname).toBe('/docs')
  })

  it('should show 404 for page not under the /docs prefix', async () => {
    const text = await renderViaHTTP(context.appPort, '/hello')
    expect(text).not.toContain('Hello World')
    expect(text).toContain('This page could not be found')
  })

  it('should show the other-page page under the /docs prefix', async () => {
    const browser = await webdriver(context.appPort, '/docs/other-page')
    try {
      const text = await browser.elementByCss('h1').text()
      expect(text).toBe('Hello Other')
    } finally {
      await browser.close()
    }
  })

  it('should have basePath field on Router', async () => {
    const html = await renderViaHTTP(context.appPort, '/docs/hello')
    const $ = cheerio.load(html)
    expect($('#base-path').text()).toBe('/docs')
  })

  it('should navigate to the page without refresh', async () => {
    const browser = await webdriver(context.appPort, '/docs/hello')
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
    const browser = await webdriver(context.appPort, '/docs/hello')
    try {
      await browser.eval('window._clearEventLog()')
      await browser
        .elementByCss('#other-page-link')
        .click()
        .waitForElementByCss('#other-page-title')

      const eventLog = await browser.eval('window._getEventLog()')
      expect(eventLog).toEqual([
        ['routeChangeStart', '/docs/other-page'],
        ['beforeHistoryChange', '/docs/other-page'],
        ['routeChangeComplete', '/docs/other-page'],
      ])
    } finally {
      await browser.close()
    }
  })

  it('should use urls with basepath in router events for hash changes', async () => {
    const browser = await webdriver(context.appPort, '/docs/hello')
    try {
      await browser.eval('window._clearEventLog()')
      await browser.elementByCss('#hash-change').click()

      const eventLog = await browser.eval('window._getEventLog()')
      expect(eventLog).toEqual([
        ['hashChangeStart', '/docs/hello#some-hash'],
        ['hashChangeComplete', '/docs/hello#some-hash'],
      ])
    } finally {
      await browser.close()
    }
  })

  it('should use urls with basepath in router events for cancelled routes', async () => {
    const browser = await webdriver(context.appPort, '/docs/hello')
    try {
      await browser.eval('window._clearEventLog()')
      await browser
        .elementByCss('#slow-route')
        .click()
        .elementByCss('#other-page-link')
        .click()
        .waitForElementByCss('#other-page-title')

      const eventLog = await browser.eval('window._getEventLog()')
      expect(eventLog).toEqual([
        ['routeChangeStart', '/docs/slow-route'],
        ['routeChangeError', 'Route Cancelled', true, '/docs/slow-route'],
        ['routeChangeStart', '/docs/other-page'],
        ['beforeHistoryChange', '/docs/other-page'],
        ['routeChangeComplete', '/docs/other-page'],
      ])
    } finally {
      await browser.close()
    }
  })

  it('should use urls with basepath in router events for failed route change', async () => {
    const browser = await webdriver(context.appPort, '/docs/hello')
    try {
      await browser.eval('window._clearEventLog()')
      await browser.elementByCss('#error-route').click()

      await waitFor(2000)

      const eventLog = await browser.eval('window._getEventLog()')
      expect(eventLog).toEqual([
        ['routeChangeStart', '/docs/error-route'],
        [
          'routeChangeError',
          'Failed to load static props',
          null,
          '/docs/error-route',
        ],
      ])
    } finally {
      await browser.close()
    }
  })

  it('should allow URL query strings without refresh', async () => {
    const browser = await webdriver(context.appPort, '/docs/hello?query=true')
    try {
      await browser.eval('window.itdidnotrefresh = "hello"')
      await new Promise((resolve, reject) => {
        // Timeout of EventSource created in setupPing()
        // (on-demand-entries-utils.js) is 5000 ms (see #13132, #13560)
        setTimeout(resolve, 10000)
      })
      expect(await browser.eval('window.itdidnotrefresh')).toBe('hello')

      const pathname = await browser.elementByCss('#pathname').text()
      expect(pathname).toBe('/hello')
    } finally {
      await browser.close()
    }
  })

  it('should correctly replace state when same asPath but different url', async () => {
    const browser = await webdriver(context.appPort, '/docs')
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

describe('basePath development', () => {
  let server

  let context = {}

  beforeAll(async () => {
    context.appPort = await findPort()
    server = await launchApp(join(__dirname, '..'), context.appPort, {
      env: { __NEXT_TEST_WITH_DEVTOOL: 1 },
    })
  })
  afterAll(async () => {
    await killApp(server)
  })

  runTests(context, true)

  describe('Hot Module Reloading', () => {
    describe('delete a page and add it back', () => {
      it('should load the page properly', async () => {
        const contactPagePath = join(
          __dirname,
          '../',
          'pages',
          'hmr',
          'contact.js'
        )
        const newContactPagePath = join(
          __dirname,
          '../',
          'pages',
          'hmr',
          '_contact.js'
        )
        let browser
        try {
          browser = await webdriver(context.appPort, '/docs/hmr/contact')
          const text = await browser.elementByCss('p').text()
          expect(text).toBe('This is the contact page.')

          // Rename the file to mimic a deleted page
          renameSync(contactPagePath, newContactPagePath)

          await check(
            () => getBrowserBodyText(browser),
            /This page could not be found/
          )

          // Rename the file back to the original filename
          renameSync(newContactPagePath, contactPagePath)

          // wait until the page comes back
          await check(
            () => getBrowserBodyText(browser),
            /This is the contact page/
          )
        } finally {
          if (browser) {
            await browser.close()
          }
          if (existsSync(newContactPagePath)) {
            renameSync(newContactPagePath, contactPagePath)
          }
        }
      })
    })

    describe('editing a page', () => {
      it('should detect the changes and display it', async () => {
        let browser
        try {
          browser = await webdriver(context.appPort, '/docs/hmr/about')
          const text = await browser.elementByCss('p').text()
          expect(text).toBe('This is the about page.')

          const aboutPagePath = join(
            __dirname,
            '../',
            'pages',
            'hmr',
            'about.js'
          )

          const originalContent = readFileSync(aboutPagePath, 'utf8')
          const editedContent = originalContent.replace(
            'This is the about page',
            'COOL page'
          )

          // change the content
          writeFileSync(aboutPagePath, editedContent, 'utf8')

          await check(() => getBrowserBodyText(browser), /COOL page/)

          // add the original content
          writeFileSync(aboutPagePath, originalContent, 'utf8')

          await check(
            () => getBrowserBodyText(browser),
            /This is the about page/
          )
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })

      it('should not reload unrelated pages', async () => {
        let browser
        try {
          browser = await webdriver(context.appPort, '/docs/hmr/counter')
          const text = await browser
            .elementByCss('button')
            .click()
            .elementByCss('button')
            .click()
            .elementByCss('p')
            .text()
          expect(text).toBe('COUNT: 2')

          const aboutPagePath = join(
            __dirname,
            '../',
            'pages',
            'hmr',
            'about.js'
          )

          const originalContent = readFileSync(aboutPagePath, 'utf8')
          const editedContent = originalContent.replace(
            'This is the about page',
            'COOL page'
          )

          // Change the about.js page
          writeFileSync(aboutPagePath, editedContent, 'utf8')

          // wait for 5 seconds
          await waitFor(5000)

          // Check whether the this page has reloaded or not.
          const newText = await browser.elementByCss('p').text()
          expect(newText).toBe('COUNT: 2')

          // restore the about page content.
          writeFileSync(aboutPagePath, originalContent, 'utf8')
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })

      // Added because of a regression in react-hot-loader, see issues: #4246 #4273
      // Also: https://github.com/zeit/styled-jsx/issues/425
      it('should update styles correctly', async () => {
        let browser
        try {
          browser = await webdriver(context.appPort, '/docs/hmr/style')
          const pTag = await browser.elementByCss('.hmr-style-page p')
          const initialFontSize = await pTag.getComputedCss('font-size')

          expect(initialFontSize).toBe('100px')

          const pagePath = join(__dirname, '../', 'pages', 'hmr', 'style.js')

          const originalContent = readFileSync(pagePath, 'utf8')
          const editedContent = originalContent.replace('100px', '200px')

          // Change the page
          writeFileSync(pagePath, editedContent, 'utf8')

          try {
            // Check whether the this page has reloaded or not.
            await check(async () => {
              const editedPTag = await browser.elementByCss('.hmr-style-page p')
              return editedPTag.getComputedCss('font-size')
            }, /200px/)
          } finally {
            // Finally is used so that we revert the content back to the original regardless of the test outcome
            // restore the about page content.
            writeFileSync(pagePath, originalContent, 'utf8')
          }
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })

      // Added because of a regression in react-hot-loader, see issues: #4246 #4273
      // Also: https://github.com/zeit/styled-jsx/issues/425
      it('should update styles in a stateful component correctly', async () => {
        let browser
        const pagePath = join(
          __dirname,
          '../',
          'pages',
          'hmr',
          'style-stateful-component.js'
        )
        const originalContent = readFileSync(pagePath, 'utf8')
        try {
          browser = await webdriver(
            context.appPort,
            '/docs/hmr/style-stateful-component'
          )
          const pTag = await browser.elementByCss('.hmr-style-page p')
          const initialFontSize = await pTag.getComputedCss('font-size')

          expect(initialFontSize).toBe('100px')
          const editedContent = originalContent.replace('100px', '200px')

          // Change the page
          writeFileSync(pagePath, editedContent, 'utf8')

          // Check whether the this page has reloaded or not.
          await check(async () => {
            const editedPTag = await browser.elementByCss('.hmr-style-page p')
            return editedPTag.getComputedCss('font-size')
          }, /200px/)
        } finally {
          if (browser) {
            await browser.close()
          }
          writeFileSync(pagePath, originalContent, 'utf8')
        }
      })

      // Added because of a regression in react-hot-loader, see issues: #4246 #4273
      // Also: https://github.com/zeit/styled-jsx/issues/425
      it('should update styles in a dynamic component correctly', async () => {
        let browser = null
        let secondBrowser = null
        const pagePath = join(
          __dirname,
          '../',
          'components',
          'hmr',
          'dynamic.js'
        )
        const originalContent = readFileSync(pagePath, 'utf8')
        try {
          browser = await webdriver(
            context.appPort,
            '/docs/hmr/style-dynamic-component'
          )
          const div = await browser.elementByCss('#dynamic-component')
          const initialClientClassName = await div.getAttribute('class')
          const initialFontSize = await div.getComputedCss('font-size')

          expect(initialFontSize).toBe('100px')

          const initialHtml = await renderViaHTTP(
            context.appPort,
            '/docs/hmr/style-dynamic-component'
          )
          expect(initialHtml.includes('100px')).toBeTruthy()

          const $initialHtml = cheerio.load(initialHtml)
          const initialServerClassName = $initialHtml(
            '#dynamic-component'
          ).attr('class')

          expect(initialClientClassName === initialServerClassName).toBeTruthy()

          const editedContent = originalContent.replace('100px', '200px')

          // Change the page
          writeFileSync(pagePath, editedContent, 'utf8')

          // wait for 5 seconds
          await waitFor(5000)

          secondBrowser = await webdriver(
            context.appPort,
            '/docs/hmr/style-dynamic-component'
          )
          // Check whether the this page has reloaded or not.
          const editedDiv = await secondBrowser.elementByCss(
            '#dynamic-component'
          )
          const editedClientClassName = await editedDiv.getAttribute('class')
          const editedFontSize = await editedDiv.getComputedCss('font-size')
          const browserHtml = await secondBrowser
            .elementByCss('html')
            .getAttribute('innerHTML')

          expect(editedFontSize).toBe('200px')
          expect(browserHtml.includes('font-size:200px;')).toBe(true)
          expect(browserHtml.includes('font-size:100px;')).toBe(false)

          const editedHtml = await renderViaHTTP(
            context.appPort,
            '/docs/hmr/style-dynamic-component'
          )
          expect(editedHtml.includes('200px')).toBeTruthy()
          const $editedHtml = cheerio.load(editedHtml)
          const editedServerClassName = $editedHtml('#dynamic-component').attr(
            'class'
          )

          expect(editedClientClassName === editedServerClassName).toBe(true)
        } finally {
          // Finally is used so that we revert the content back to the original regardless of the test outcome
          // restore the about page content.
          writeFileSync(pagePath, originalContent, 'utf8')

          if (browser) {
            await browser.close()
          }

          if (secondBrowser) {
            secondBrowser.close()
          }
        }
      })
    })
  })
})

describe('basePath production', () => {
  let context = {}
  let server
  let app

  beforeAll(async () => {
    await nextBuild(appDir)
    app = nextServer({
      dir: join(__dirname, '../'),
      dev: false,
      quiet: true,
    })

    server = await startApp(app)
    context.appPort = server.address().port
  })

  afterAll(() => stopApp(server))

  runTests(context)
})

describe('basePath serverless', () => {
  let context = {}
  let app

  const nextConfig = new File(join(appDir, 'next.config.js'))

  beforeAll(async () => {
    await nextConfig.replace(
      '// replace me',
      `target: 'experimental-serverless-trace',`
    )
    await nextBuild(appDir)
    context.appPort = await findPort()
    app = await nextStart(appDir, context.appPort)
  })
  afterAll(async () => {
    await killApp(app)
    await nextConfig.restore()
  })

  runTests(context)

  it('should always strip basePath in serverless-loader', async () => {
    const appPort = await findPort()
    const app = await initNextServerScript(
      join(appDir, 'server.js'),
      /ready on/,
      {
        ...process.env,
        PORT: appPort,
      }
    )

    const html = await renderViaHTTP(appPort, '/docs/gssp')
    await killApp(app)

    const $ = cheerio.load(html)

    expect($('#pathname').text()).toBe('/gssp')
    expect($('#asPath').text()).toBe('/gssp')
  })
})
