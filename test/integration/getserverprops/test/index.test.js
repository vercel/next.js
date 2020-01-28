/* eslint-env jest */
/* global jasmine */
import fs from 'fs-extra'
import { join } from 'path'
import webdriver from 'next-webdriver'
import cheerio from 'cheerio'
import escapeRegex from 'escape-string-regexp'
import {
  renderViaHTTP,
  fetchViaHTTP,
  findPort,
  launchApp,
  killApp,
  waitFor,
  nextBuild,
  nextStart,
  normalizeRegEx,
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2
const appDir = join(__dirname, '..')
const nextConfig = join(appDir, 'next.config.js')
let app
let appPort
let buildId

const expectedManifestRoutes = () => ({
  '/something': {
    page: '/something',
    dataRouteRegex: normalizeRegEx(
      `^\\/_next\\/data\\/${escapeRegex(buildId)}\\/something.json$`
    ),
  },
  '/blog/[post]': {
    page: '/blog/[post]',
    dataRouteRegex: normalizeRegEx(
      `^\\/_next\\/data\\/${escapeRegex(buildId)}\\/blog\\/([^/]+?)\\.json$`
    ),
  },
  '/': {
    page: '/',
    dataRouteRegex: normalizeRegEx(
      `^\\/_next\\/data\\/${escapeRegex(buildId)}\\/index.json$`
    ),
  },
  '/default-revalidate': {
    page: '/default-revalidate',
    dataRouteRegex: normalizeRegEx(
      `^\\/_next\\/data\\/${escapeRegex(buildId)}\\/default-revalidate.json$`
    ),
  },
  '/catchall/[...path]': {
    page: '/catchall/[...path]',
    dataRouteRegex: normalizeRegEx(
      `^\\/_next\\/data\\/${escapeRegex(buildId)}\\/catchall\\/(.+?)\\.json$`
    ),
  },
  '/blog': {
    page: '/blog',
    dataRouteRegex: normalizeRegEx(
      `^\\/_next\\/data\\/${escapeRegex(buildId)}\\/blog.json$`
    ),
  },
  '/blog/[post]/[comment]': {
    page: '/blog/[post]/[comment]',
    dataRouteRegex: normalizeRegEx(
      `^\\/_next\\/data\\/${escapeRegex(
        buildId
      )}\\/blog\\/([^/]+?)\\/([^/]+?)\\.json$`
    ),
  },
  '/user/[user]/profile': {
    page: '/user/[user]/profile',
    dataRouteRegex: normalizeRegEx(
      `^\\/_next\\/data\\/${escapeRegex(
        buildId
      )}\\/user\\/([^/]+?)\\/profile\\.json$`
    ),
  },
  '/another': {
    page: '/another',
    dataRouteRegex: normalizeRegEx(
      `^\\/_next\\/data\\/${escapeRegex(buildId)}\\/another.json$`
    ),
  },
  '/invalid-keys': {
    dataRouteRegex: normalizeRegEx(
      `^\\/_next\\/data\\/${escapeRegex(buildId)}\\/invalid-keys.json$`
    ),
    page: '/invalid-keys',
  },
})

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

    await Promise.all(toBuild.map(pg => renderViaHTTP(appPort, pg)))

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

  it('should SSR normal page correctly', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/hello.*?world/)
  })

  it('should SSR getServerProps page correctly', async () => {
    const html = await renderViaHTTP(appPort, '/blog/post-1')
    expect(html).toMatch(/Post:.*?post-1/)
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
    await browser.eval('window.beforeClick = true')
    await browser.elementByCss('#broken-post').click()
    await waitFor(1000)
    expect(await browser.eval('window.beforeClick')).not.toBe('true')
  })

  it('should always call getServerProps without caching', async () => {
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

  it('should not re-call getServerProps when updating query', async () => {
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
    it('should show error for extra keys returned from getServerProps', async () => {
      const html = await renderViaHTTP(appPort, '/invalid-keys')
      expect(html).toContain(
        `Additional keys were returned from \`getServerProps\`. Properties intended for your component must be nested under the \`props\` key, e.g.:`
      )
      expect(html).toContain(
        `Keys that need to be moved: world, query, params, time, random`
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
      const { serverPropsRoutes } = await fs.readJSON(
        join(appDir, '.next/routes-manifest.json')
      )
      for (const key of Object.keys(serverPropsRoutes)) {
        const val = serverPropsRoutes[key].dataRouteRegex
        serverPropsRoutes[key].dataRouteRegex = normalizeRegEx(val)
      }

      expect(serverPropsRoutes).toEqual(expectedManifestRoutes())
    })

    it('should set no-cache, no-store, must-revalidate header', async () => {
      const res = await fetchViaHTTP(
        appPort,
        `/_next/data/${escapeRegex(buildId)}/something.json`
      )
      expect(res.headers.get('cache-control')).toContain('no-cache')
    })
  }
}

describe('unstable_getServerProps', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
      buildId = 'development'
    })
    afterAll(() => killApp(app))

    runTests(true)
  })

  describe('serverless mode', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfig,
        `module.exports = { target: 'serverless' }`,
        'utf8'
      )
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
      buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await fs.remove(nextConfig)
      await nextBuild(appDir, [], { stdout: true })

      appPort = await findPort()
      app = await nextStart(appDir, appPort)
      buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
    })
    afterAll(() => killApp(app))

    runTests()
  })
})
