/* eslint-env jest */

import cheerio from 'cheerio'
import escapeRegex from 'escape-string-regexp'
import fs from 'fs-extra'
import {
  check,
  fetchViaHTTP,
  findPort,
  File,
  getBrowserBodyText,
  getRedboxHeader,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  normalizeRegEx,
  renderViaHTTP,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

jest.setTimeout(1000 * 60 * 2)
const appDir = join(__dirname, '..')
const nextConfig = new File(join(appDir, 'next.config.js'))

let app
let appPort
let buildId
let stderr

const expectedManifestRoutes = () => [
  {
    dataRouteRegex: normalizeRegEx(
      `^\\/_next\\/data\\/${escapeRegex(buildId)}\\/index.json$`
    ),
    page: '/',
  },
  {
    dataRouteRegex: normalizeRegEx(
      `^\\/_next\\/data\\/${escapeRegex(buildId)}\\/another.json$`
    ),
    page: '/another',
  },
  {
    dataRouteRegex: normalizeRegEx(
      `^\\/_next\\/data\\/${escapeRegex(buildId)}\\/blog.json$`
    ),
    page: '/blog',
  },
  {
    namedDataRouteRegex: `^/_next/data/${escapeRegex(
      buildId
    )}/blog/(?<post>[^/]+?)\\.json$`,
    dataRouteRegex: normalizeRegEx(
      `^\\/_next\\/data\\/${escapeRegex(buildId)}\\/blog\\/([^\\/]+?)\\.json$`
    ),
    page: '/blog/[post]',
    routeKeys: {
      post: 'post',
    },
  },
  {
    namedDataRouteRegex: `^/_next/data/${escapeRegex(
      buildId
    )}/blog/(?<post>[^/]+?)/(?<comment>[^/]+?)\\.json$`,
    dataRouteRegex: normalizeRegEx(
      `^\\/_next\\/data\\/${escapeRegex(
        buildId
      )}\\/blog\\/([^\\/]+?)\\/([^\\/]+?)\\.json$`
    ),
    page: '/blog/[post]/[comment]',
    routeKeys: {
      post: 'post',
      comment: 'comment',
    },
  },
  {
    namedDataRouteRegex: `^/_next/data/${escapeRegex(
      buildId
    )}/catchall/(?<path>.+?)\\.json$`,
    dataRouteRegex: normalizeRegEx(
      `^\\/_next\\/data\\/${escapeRegex(buildId)}\\/catchall\\/(.+?)\\.json$`
    ),
    page: '/catchall/[...path]',
    routeKeys: {
      path: 'path',
    },
  },
  {
    dataRouteRegex: normalizeRegEx(
      `^\\/_next\\/data\\/${escapeRegex(buildId)}\\/custom-cache.json$`
    ),
    page: '/custom-cache',
  },
  {
    dataRouteRegex: normalizeRegEx(
      `^\\/_next\\/data\\/${escapeRegex(buildId)}\\/default-revalidate.json$`
    ),
    page: '/default-revalidate',
  },
  {
    dataRouteRegex: normalizeRegEx(
      `^\\/_next\\/data\\/${escapeRegex(buildId)}\\/enoent.json$`
    ),
    page: '/enoent',
  },
  {
    dataRouteRegex: normalizeRegEx(
      `^\\/_next\\/data\\/${escapeRegex(buildId)}\\/invalid-keys.json$`
    ),
    page: '/invalid-keys',
  },
  {
    dataRouteRegex: normalizeRegEx(
      `^\\/_next\\/data\\/${escapeRegex(buildId)}\\/non-json.json$`
    ),
    page: '/non-json',
  },
  {
    dataRouteRegex: `^\\/_next\\/data\\/${escapeRegex(
      buildId
    )}\\/not-found.json$`,
    page: '/not-found',
  },
  {
    dataRouteRegex: `^\\/_next\\/data\\/${escapeRegex(
      buildId
    )}\\/not\\-found\\/([^\\/]+?)\\.json$`,
    namedDataRouteRegex: `^/_next/data/${escapeRegex(
      buildId
    )}/not\\-found/(?<slug>[^/]+?)\\.json$`,
    page: '/not-found/[slug]',
    routeKeys: {
      slug: 'slug',
    },
  },
  {
    dataRouteRegex: normalizeRegEx(
      `^\\/_next\\/data\\/${escapeRegex(buildId)}\\/refresh.json$`
    ),
    page: '/refresh',
  },
  {
    dataRouteRegex: normalizeRegEx(
      `^\\/_next\\/data\\/${escapeRegex(buildId)}\\/something.json$`
    ),
    page: '/something',
  },
  {
    namedDataRouteRegex: `^/_next/data/${escapeRegex(
      buildId
    )}/user/(?<user>[^/]+?)/profile\\.json$`,
    dataRouteRegex: normalizeRegEx(
      `^\\/_next\\/data\\/${escapeRegex(
        buildId
      )}\\/user\\/([^\\/]+?)\\/profile\\.json$`
    ),
    page: '/user/[user]/profile',
    routeKeys: {
      user: 'user',
    },
  },
]

const navigateTest = (dev = false) => {
  it('should navigate between pages successfully', async () => {
    const toBuild = [
      '/',
      '/another',
      '/something',
      '/normal',
      '/blog/post-1',
      '/blog/post-1/comment-1',
    ]

    await Promise.all(toBuild.map((pg) => renderViaHTTP(appPort, pg)))

    const browser = await webdriver(appPort, '/')
    let text = await browser.elementByCss('p').text()
    expect(text).toMatch(/hello.*?world/)

    // hydration
    await waitFor(2500)

    // go to /another
    async function goFromHomeToAnother() {
      await browser.elementByCss('#another').click()
      await browser.waitForElementByCss('#home')
      text = await browser.elementByCss('p').text()
      expect(text).toMatch(/hello.*?world/)
    }
    await goFromHomeToAnother()

    // go to /
    async function goFromAnotherToHome() {
      await browser.eval('window.didTransition = 1')
      await browser.elementByCss('#home').click()
      await browser.waitForElementByCss('#another')
      text = await browser.elementByCss('p').text()
      expect(text).toMatch(/hello.*?world/)
      expect(await browser.eval('window.didTransition')).toBe(1)
    }
    await goFromAnotherToHome()

    await goFromHomeToAnother()
    const snapTime = await browser.elementByCss('#anotherTime').text()

    // Re-visit page
    await goFromAnotherToHome()
    await goFromHomeToAnother()

    const nextTime = await browser.elementByCss('#anotherTime').text()
    expect(snapTime).not.toMatch(nextTime)

    // Reset to Home for next test
    await goFromAnotherToHome()

    // go to /something
    await browser.elementByCss('#something').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('p').text()
    expect(text).toMatch(/hello.*?world/)
    expect(await browser.eval('window.didTransition')).toBe(1)

    // go to /
    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#post-1')

    // go to /blog/post-1
    await browser.elementByCss('#post-1').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('p').text()
    expect(text).toMatch(/Post:.*?post-1/)
    expect(await browser.eval('window.didTransition')).toBe(1)

    // go to /
    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#comment-1')

    // go to /blog/post-1/comment-1
    await browser.elementByCss('#comment-1').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('p:nth-child(2)').text()
    expect(text).toMatch(/Comment:.*?comment-1/)
    expect(await browser.eval('window.didTransition')).toBe(1)

    await browser.close()
  })
}

const runTests = (dev = false) => {
  navigateTest(dev)

  it('should render 404 correctly when notFound is returned (non-dynamic)', async () => {
    const res = await fetchViaHTTP(appPort, '/not-found', { hiding: true })

    expect(res.status).toBe(404)
    expect(await res.text()).toContain('This page could not be found')
  })

  it('should render 404 correctly when notFound is returned client-transition (non-dynamic)', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.eval(`(function() {
      window.beforeNav = 1
      window.next.router.push('/not-found?hiding=true')
    })()`)

    await browser.waitForElementByCss('h1')
    expect(await browser.elementByCss('html').text()).toContain(
      'This page could not be found'
    )
    expect(await browser.eval('window.beforeNav')).toBe(null)
  })

  it('should render 404 correctly when notFound is returned (dynamic)', async () => {
    const res = await fetchViaHTTP(appPort, '/not-found/first', {
      hiding: true,
    })

    expect(res.status).toBe(404)
    expect(await res.text()).toContain('This page could not be found')
  })

  it('should render 404 correctly when notFound is returned client-transition (dynamic)', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.eval(`(function() {
      window.beforeNav = 1
      window.next.router.push('/not-found/first?hiding=true')
    })()`)

    await browser.waitForElementByCss('h1')
    expect(await browser.elementByCss('html').text()).toContain(
      'This page could not be found'
    )
    expect(await browser.eval('window.beforeNav')).toBe(null)
  })

  it('should SSR normal page correctly', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/hello.*?world/)
  })

  it('should SSR getServerSideProps page correctly', async () => {
    const html = await renderViaHTTP(appPort, '/blog/post-1')
    expect(html).toMatch(/Post:.*?post-1/)
  })

  it('should handle throw ENOENT correctly', async () => {
    const res = await fetchViaHTTP(appPort, '/enoent')
    const html = await res.text()

    if (dev) {
      expect(html).toContain('oof')
    } else {
      expect(res.status).toBe(500)
      expect(html).toContain('Internal Server Error')
      expect(html).not.toContain('This page could not be found')
    }
  })

  it('should have gssp in __NEXT_DATA__', async () => {
    const html = await renderViaHTTP(appPort, '/')
    const $ = cheerio.load(html)
    expect(JSON.parse($('#__NEXT_DATA__').text()).gssp).toBe(true)
  })

  it('should not have gssp in __NEXT_DATA__ for non-GSSP page', async () => {
    const html = await renderViaHTTP(appPort, '/normal')
    const $ = cheerio.load(html)
    expect('gssp' in JSON.parse($('#__NEXT_DATA__').text())).toBe(false)
  })

  it('should supply query values SSR', async () => {
    const html = await renderViaHTTP(appPort, '/blog/post-1?hello=world')
    const $ = cheerio.load(html)
    const params = $('#params').text()
    expect(JSON.parse(params)).toEqual({ post: 'post-1' })
    const query = $('#query').text()
    expect(JSON.parse(query)).toEqual({ hello: 'world', post: 'post-1' })
  })

  it('should supply params values for catchall correctly', async () => {
    const html = await renderViaHTTP(appPort, '/catchall/first')
    const $ = cheerio.load(html)
    const params = $('#params').text()
    expect(JSON.parse(params)).toEqual({ path: ['first'] })
    const query = $('#query').text()
    expect(JSON.parse(query)).toEqual({ path: ['first'] })

    const data = JSON.parse(
      await renderViaHTTP(appPort, `/_next/data/${buildId}/catchall/first.json`)
    )

    expect(data.pageProps.params).toEqual({ path: ['first'] })
  })

  it('should have original req.url for /_next/data request dynamic page', async () => {
    const curUrl = `/_next/data/${buildId}/blog/post-1.json`
    const data = await renderViaHTTP(appPort, curUrl)
    const { appProps, pageProps } = JSON.parse(data)

    expect(pageProps.resolvedUrl).toEqual('/blog/post-1')

    expect(appProps).toEqual({
      url: curUrl,
      query: { post: 'post-1' },
      asPath: '/blog/post-1',
      pathname: '/blog/[post]',
    })
  })

  it('should have original req.url for /_next/data request dynamic page with query', async () => {
    const curUrl = `/_next/data/${buildId}/blog/post-1.json`
    const data = await renderViaHTTP(appPort, curUrl, { hello: 'world' })
    const { appProps, pageProps } = JSON.parse(data)

    expect(pageProps.resolvedUrl).toEqual('/blog/post-1?hello=world')

    expect(appProps).toEqual({
      url: curUrl + '?hello=world',
      query: { post: 'post-1', hello: 'world' },
      asPath: '/blog/post-1?hello=world',
      pathname: '/blog/[post]',
    })
  })

  it('should have original req.url for /_next/data request', async () => {
    const curUrl = `/_next/data/${buildId}/something.json`
    const data = await renderViaHTTP(appPort, curUrl)
    const { appProps, pageProps } = JSON.parse(data)

    expect(pageProps.resolvedUrl).toEqual('/something')

    expect(appProps).toEqual({
      url: curUrl,
      query: {},
      asPath: '/something',
      pathname: '/something',
    })
  })

  it('should have original req.url for /_next/data request with query', async () => {
    const curUrl = `/_next/data/${buildId}/something.json`
    const data = await renderViaHTTP(appPort, curUrl, { hello: 'world' })
    const { appProps, pageProps } = JSON.parse(data)

    expect(pageProps.resolvedUrl).toEqual('/something?hello=world')

    expect(appProps).toEqual({
      url: curUrl + '?hello=world',
      query: { hello: 'world' },
      asPath: '/something?hello=world',
      pathname: '/something',
    })
  })

  it('should have correct req.url and query for direct visit dynamic page', async () => {
    const html = await renderViaHTTP(appPort, '/blog/post-1')
    const $ = cheerio.load(html)
    expect($('#app-url').text()).toContain('/blog/post-1')
    expect(JSON.parse($('#app-query').text())).toEqual({ post: 'post-1' })
    expect($('#resolved-url').text()).toBe('/blog/post-1')
    expect($('#as-path').text()).toBe('/blog/post-1')
  })

  it('should have correct req.url and query for direct visit dynamic page rewrite direct', async () => {
    const html = await renderViaHTTP(appPort, '/blog-post-1')
    const $ = cheerio.load(html)
    expect($('#app-url').text()).toContain('/blog-post-1')
    expect(JSON.parse($('#app-query').text())).toEqual({ post: 'post-1' })
    expect($('#resolved-url').text()).toBe('/blog/post-1')
    expect($('#as-path').text()).toBe('/blog-post-1')
  })

  it('should have correct req.url and query for direct visit dynamic page rewrite direct with internal query', async () => {
    const html = await renderViaHTTP(appPort, '/blog-post-2')
    const $ = cheerio.load(html)
    expect($('#app-url').text()).toContain('/blog-post-2')
    expect(JSON.parse($('#app-query').text())).toEqual({
      post: 'post-2',
      hello: 'world',
    })
    expect($('#resolved-url').text()).toBe('/blog/post-2')
    expect($('#as-path').text()).toBe('/blog-post-2')
  })

  it('should have correct req.url and query for direct visit dynamic page rewrite param', async () => {
    const html = await renderViaHTTP(appPort, '/blog-post-3')
    const $ = cheerio.load(html)
    expect($('#app-url').text()).toContain('/blog-post-3')
    expect(JSON.parse($('#app-query').text())).toEqual({
      post: 'post-3',
      param: 'post-3',
    })
    expect($('#resolved-url').text()).toBe('/blog/post-3')
    expect($('#as-path').text()).toBe('/blog-post-3')
  })

  it('should have correct req.url and query for direct visit dynamic page with query', async () => {
    const html = await renderViaHTTP(appPort, '/blog/post-1', {
      hello: 'world',
    })
    const $ = cheerio.load(html)
    expect($('#app-url').text()).toContain('/blog/post-1?hello=world')
    expect(JSON.parse($('#app-query').text())).toEqual({
      post: 'post-1',
      hello: 'world',
    })
    expect($('#resolved-url').text()).toBe('/blog/post-1?hello=world')
    expect($('#as-path').text()).toBe('/blog/post-1?hello=world')
  })

  it('should have correct req.url and query for direct visit', async () => {
    const html = await renderViaHTTP(appPort, '/something')
    const $ = cheerio.load(html)
    expect($('#app-url').text()).toContain('/something')
    expect(JSON.parse($('#app-query').text())).toEqual({})
    expect($('#resolved-url').text()).toBe('/something')
    expect($('#as-path').text()).toBe('/something')
  })

  it('should return data correctly', async () => {
    const data = JSON.parse(
      await renderViaHTTP(appPort, `/_next/data/${buildId}/something.json`)
    )
    expect(data.pageProps.world).toBe('world')
  })

  it('should pass query for data request', async () => {
    const data = JSON.parse(
      await renderViaHTTP(
        appPort,
        `/_next/data/${buildId}/something.json?another=thing`
      )
    )
    expect(data.pageProps.query.another).toBe('thing')
  })

  it('should return data correctly for dynamic page', async () => {
    const data = JSON.parse(
      await renderViaHTTP(appPort, `/_next/data/${buildId}/blog/post-1.json`)
    )
    expect(data.pageProps.post).toBe('post-1')
  })

  it('should navigate to a normal page and back', async () => {
    const browser = await webdriver(appPort, '/')
    let text = await browser.elementByCss('p').text()
    expect(text).toMatch(/hello.*?world/)

    await browser.elementByCss('#normal').click()
    await browser.waitForElementByCss('#normal-text')
    text = await browser.elementByCss('#normal-text').text()
    expect(text).toMatch(/a normal page/)
  })

  it('should load a fast refresh page', async () => {
    const browser = await webdriver(appPort, '/refresh')
    expect(
      await check(
        () => browser.elementByCss('p').text(),
        /client loaded/,
        false
      )
    ).toBe(true)
  })

  it('should provide correct query value for dynamic page', async () => {
    const html = await renderViaHTTP(
      appPort,
      '/blog/post-1?post=something-else'
    )
    const $ = cheerio.load(html)
    const query = JSON.parse($('#query').text())
    expect(query.post).toBe('post-1')
  })

  it('should parse query values on mount correctly', async () => {
    const browser = await webdriver(appPort, '/blog/post-1?another=value')
    await waitFor(2000)
    const text = await browser.elementByCss('#query').text()
    expect(text).toMatch(/another.*?value/)
    expect(text).toMatch(/post.*?post-1/)
  })

  it('should pass query for data request on navigation', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.eval('window.beforeNav = true')
    await browser.elementByCss('#something-query').click()
    await browser.waitForElementByCss('#initial-query')
    const query = JSON.parse(
      await browser.elementByCss('#initial-query').text()
    )
    expect(await browser.eval('window.beforeNav')).toBe(true)
    expect(query.another).toBe('thing')
  })

  it('should reload page on failed data request', async () => {
    const browser = await webdriver(appPort, '/')
    await waitFor(500)
    await browser.eval('window.beforeClick = "abc"')
    await browser.elementByCss('#broken-post').click()
    expect(
      await check(() => browser.eval('window.beforeClick'), {
        test(v) {
          return v !== 'abc'
        },
      })
    ).toBe(true)
  })

  it('should always call getServerSideProps without caching', async () => {
    const initialRes = await fetchViaHTTP(appPort, '/something')
    const initialHtml = await initialRes.text()
    expect(initialHtml).toMatch(/hello.*?world/)

    const newRes = await fetchViaHTTP(appPort, '/something')
    const newHtml = await newRes.text()
    expect(newHtml).toMatch(/hello.*?world/)
    expect(initialHtml !== newHtml).toBe(true)

    const newerRes = await fetchViaHTTP(appPort, '/something')
    const newerHtml = await newerRes.text()
    expect(newerHtml).toMatch(/hello.*?world/)
    expect(newHtml !== newerHtml).toBe(true)
  })

  it('should not re-call getServerSideProps when updating query', async () => {
    const browser = await webdriver(appPort, '/something?hello=world')
    await waitFor(2000)

    const query = await browser.elementByCss('#query').text()
    expect(JSON.parse(query)).toEqual({ hello: 'world' })

    const {
      props: {
        pageProps: { random: initialRandom },
      },
    } = await browser.eval('window.__NEXT_DATA__')

    const curRandom = await browser.elementByCss('#random').text()
    expect(curRandom).toBe(initialRandom + '')
  })

  if (dev) {
    it('should not show warning from url prop being returned', async () => {
      const urlPropPage = join(appDir, 'pages/url-prop.js')
      await fs.writeFile(
        urlPropPage,
        `
        export async function getServerSideProps() {
          return {
            props: {
              url: 'something'
            }
          }
        }

        export default ({ url }) => <p>url: {url}</p>
      `
      )

      const html = await renderViaHTTP(appPort, '/url-prop')
      await fs.remove(urlPropPage)
      expect(stderr).not.toMatch(
        /The prop `url` is a reserved prop in Next.js for legacy reasons and will be overridden on page \/url-prop/
      )
      expect(html).toMatch(/url:.*?something/)
    })

    it('should show error for extra keys returned from getServerSideProps', async () => {
      const html = await renderViaHTTP(appPort, '/invalid-keys')
      expect(html).toContain(
        `Additional keys were returned from \`getServerSideProps\`. Properties intended for your component must be nested under the \`props\` key, e.g.:`
      )
      expect(html).toContain(
        `Keys that need to be moved: world, query, params, time, random`
      )
    })

    it('should show error for invalid JSON returned from getServerSideProps', async () => {
      const html = await renderViaHTTP(appPort, '/non-json')
      expect(html).toContain(
        'Error serializing `.time` returned from `getServerSideProps`'
      )
    })

    it('should show error for invalid JSON returned from getStaticProps on CST', async () => {
      const browser = await webdriver(appPort, '/')
      await browser.elementByCss('#non-json').click()

      await check(
        () => getRedboxHeader(browser),
        /Error serializing `.time` returned from `getServerSideProps`/
      )
    })
  } else {
    it('should not fetch data on mount', async () => {
      const browser = await webdriver(appPort, '/blog/post-100')
      await browser.eval('window.thisShouldStay = true')
      await waitFor(2 * 1000)
      const val = await browser.eval('window.thisShouldStay')
      expect(val).toBe(true)
    })

    it('should output routes-manifest correctly', async () => {
      const { dataRoutes } = await fs.readJSON(
        join(appDir, '.next/routes-manifest.json')
      )
      for (const route of dataRoutes) {
        route.dataRouteRegex = normalizeRegEx(route.dataRouteRegex)
      }

      expect(dataRoutes).toEqual(expectedManifestRoutes())
    })

    it('should set default caching header', async () => {
      const resPage = await fetchViaHTTP(appPort, `/something`)
      expect(resPage.headers.get('cache-control')).toBe(
        'private, no-cache, no-store, max-age=0, must-revalidate'
      )

      const resData = await fetchViaHTTP(
        appPort,
        `/_next/data/${buildId}/something.json`
      )
      expect(resData.headers.get('cache-control')).toBe(
        'private, no-cache, no-store, max-age=0, must-revalidate'
      )
    })

    it('should respect custom caching header', async () => {
      const resPage = await fetchViaHTTP(appPort, `/custom-cache`)
      expect(resPage.headers.get('cache-control')).toBe('public, max-age=3600')

      const resData = await fetchViaHTTP(
        appPort,
        `/_next/data/${buildId}/custom-cache.json`
      )
      expect(resData.headers.get('cache-control')).toBe('public, max-age=3600')
    })

    it('should not show error for invalid JSON returned from getServerSideProps', async () => {
      const html = await renderViaHTTP(appPort, '/non-json')
      expect(html).not.toContain('Error serializing')
      expect(html).toContain('hello ')
    })

    it('should not show error for invalid JSON returned from getStaticProps on CST', async () => {
      const browser = await webdriver(appPort, '/')
      await browser.elementByCss('#non-json').click()
      await check(() => getBrowserBodyText(browser), /hello /)
    })
  }
}

describe('getServerSideProps', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      stderr = ''
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        env: { __NEXT_TEST_WITH_DEVTOOL: 1 },
        onStderr(msg) {
          stderr += msg
        },
      })
      buildId = 'development'
    })
    afterAll(() => killApp(app))

    runTests(true)
  })

  describe('serverless mode', () => {
    beforeAll(async () => {
      await nextConfig.replace(
        '// replace me',
        `target: 'experimental-serverless-trace', `
      )
      await nextBuild(appDir)
      stderr = ''
      appPort = await findPort()
      app = await nextStart(appDir, appPort, {
        onStderr(msg) {
          stderr += msg
        },
      })
      buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
    })
    afterAll(async () => {
      await killApp(app)
      nextConfig.restore()
    })

    runTests()
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir, [], { stdout: true })

      appPort = await findPort()
      app = await nextStart(appDir, appPort)
      buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
    })
    afterAll(() => killApp(app))

    runTests()
  })
})
