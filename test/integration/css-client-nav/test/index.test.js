/* eslint-env jest */

import cheerio from 'cheerio'
import { remove } from 'fs-extra'
import {
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

jest.setTimeout(1000 * 60 * 1)

const fixturesDir = join(__dirname, '../../css-fixtures')
const appDir = join(fixturesDir, 'multi-module')

let appPort
let app

function runTests(dev) {
  it('should be able to client-side navigate from red to blue', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/red')

      await browser.eval(`window.__did_not_ssr = 'make sure this is set'`)

      const redColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('#verify-red')).color`
      )
      expect(redColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)

      await browser.elementByCss('#link-blue').click()

      await browser.waitForElementByCss('#verify-blue')

      const blueColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('#verify-blue')).color`
      )
      expect(blueColor).toMatchInlineSnapshot(`"rgb(0, 0, 255)"`)

      expect(await browser.eval(`window.__did_not_ssr`)).toMatchInlineSnapshot(
        `"make sure this is set"`
      )
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should be able to client-side navigate from blue to red', async () => {
    const content = await renderViaHTTP(appPort, '/blue')
    const $ = cheerio.load(content)

    if (!dev) {
      // Ensure only `/blue` page's CSS is preloaded
      const serverCssPreloads = $('link[rel="preload"][as="style"]')
      expect(serverCssPreloads.length).toBe(1)

      const serverCssPrefetches = $('link[rel="prefetch"][as="style"]')
      expect(serverCssPrefetches.length).toBe(0)
    }

    let browser
    try {
      browser = await webdriver(appPort, '/blue')

      await browser.eval(`window.__did_not_ssr = 'make sure this is set'`)

      const redColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('#verify-blue')).color`
      )
      expect(redColor).toMatchInlineSnapshot(`"rgb(0, 0, 255)"`)

      await browser.elementByCss('#link-red').click()

      await browser.waitForElementByCss('#verify-red')

      const blueColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('#verify-red')).color`
      )
      expect(blueColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)

      expect(await browser.eval(`window.__did_not_ssr`)).toMatchInlineSnapshot(
        `"make sure this is set"`
      )
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should be able to client-side navigate from none to red', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/none')

      await browser.eval(`window.__did_not_ssr = 'make sure this is set'`)

      await browser.elementByCss('#link-red').click()
      await browser.waitForElementByCss('#verify-red')

      const blueColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('#verify-red')).color`
      )
      expect(blueColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)

      expect(await browser.eval(`window.__did_not_ssr`)).toMatchInlineSnapshot(
        `"make sure this is set"`
      )
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should be able to client-side navigate from none to blue', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/none')

      await browser.eval(`window.__did_not_ssr = 'make sure this is set'`)

      await browser.elementByCss('#link-blue').click()
      await browser.waitForElementByCss('#verify-blue')

      const blueColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('#verify-blue')).color`
      )
      expect(blueColor).toMatchInlineSnapshot(`"rgb(0, 0, 255)"`)

      expect(await browser.eval(`window.__did_not_ssr`)).toMatchInlineSnapshot(
        `"make sure this is set"`
      )
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })
}

describe('CSS Module client-side navigation', () => {
  describe('production', () => {
    beforeAll(async () => {
      await remove(join(appDir, '.next'))
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
    })
    runTests()
  })

  describe('dev', () => {
    beforeAll(async () => {
      await remove(join(appDir, '.next'))
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
    })
    runTests(true)
  })
})
