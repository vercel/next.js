/* eslint-env jest */

import webdriver from 'next-webdriver'

import cheerio from 'cheerio'
import fs from 'fs-extra'
import {
  fetchViaHTTP,
  renderViaHTTP,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'
import { join } from 'path'

jest.setTimeout(1000 * 60 * 2)

let app
let appPort
const appDir = join(__dirname, '../')
const nextConfig = join(appDir, 'next.config.js')

function runTests() {
  describe.each([
    // page route => page file
    ['/', '/index.js'],
    ['/about/', '/about.js'],
    ['/user/', '/user/index.js'],
    ['/project/', '/project/index.js'],
    ['/project/my-project/', '/project/my-project.js'],
    ['/catch-all/hello/', '/catch-all/[...slug].js'],
    ['/catch-all/hello/world/', '/catch-all/[...slug].js'],
    // TODO: /index handling doesn't work properly in dev
    // ['/project/index/', '/project/index/index.js'],
  ])('route %s should resolve to page %s', (route, expectedPage) => {
    it('handles serverside render correctly', async () => {
      const res = await fetchViaHTTP(appPort, route)
      expect(res.status).toBe(200)
      const $ = cheerio.load(await res.text())
      expect($('#page-marker').text()).toBe(expectedPage)
    })

    it('handles client side render correctly', async () => {
      let browser
      try {
        browser = await webdriver(appPort, route)

        await browser.waitForElementByCss('#hydration-marker')
        const text = await browser.elementByCss('#page-marker').text()
        expect(text).toBe(expectedPage)
      } finally {
        if (browser) await browser.close()
      }
    })

    it('handles client side navigation correctly', async () => {
      let browser
      try {
        browser = await webdriver(appPort, `/linker?href=${route}`)
        await browser.elementByCss('#link').click()

        await browser.waitForElementByCss('#hydration-marker')
        const text = await browser.elementByCss('#page-marker').text()
        expect(text).toBe(expectedPage)
      } finally {
        if (browser) await browser.close()
      }
    })
  })

  describe.each([
    // non-resolving page route
    ['/non-existing/'],
    ['/catch-all/'],
    // TODO: /index handling doesn't work yet
    // ['/index/'],
    // ['/user/index/'],
  ])('route %s should not resolve', (route) => {
    it('returns 404 when navigated directly', async () => {
      const res = await fetchViaHTTP(appPort, route)
      expect(res.status).toBe(404)
    })

    it('shows 404 page on client side navigation', async () => {
      let browser
      try {
        browser = await webdriver(appPort, `/linker?href=${route}`)
        await browser.elementByCss('#link').click()

        await browser.waitForElementByCss('#page-404')
      } finally {
        if (browser) await browser.close()
      }
    })
  })

  it('includes the bundle correctly', async () => {
    const content = await renderViaHTTP(appPort, '/about/')
    expect(content).not.toMatch('/about/.js')
    expect(content).toMatch('/about.js')
  })
}

describe('Trailing slashes', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('production mode', () => {
    beforeAll(async () => {
      const curConfig = await fs.readFile(nextConfig, 'utf8')

      if (curConfig.includes('target')) {
        await fs.writeFile(
          nextConfig,
          `module.exports = { experimental: { optionalCatchAll: true } }`
        )
      }
      await nextBuild(appDir)

      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('serverless mode', () => {
    let origNextConfig

    beforeAll(async () => {
      origNextConfig = await fs.readFile(nextConfig, 'utf8')
      await fs.writeFile(
        nextConfig,
        `module.exports = { target: 'serverless', experimental: { optionalCatchAll: true } }`
      )

      await nextBuild(appDir)

      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await fs.writeFile(nextConfig, origNextConfig)
      await killApp(app)
    })
    runTests()
  })
})
