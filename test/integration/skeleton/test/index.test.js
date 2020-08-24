/* eslint-env jest */

import fs from 'fs-extra'
import {
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

jest.setTimeout(1000 * 60 * 2)
const appDir = join(__dirname, '..')
const nextConfig = join(appDir, 'next.config.js')
let app
let appPort

const runTests = (dev = false) => {
  it('should ...', async () => {
    const browser = await webdriver(appPort, '/')
    let text = await browser.elementByCss('h1').text()
    expect(text).toMatch(/Skeleton-Loading/)

    // hydration
    await waitFor(2500)

    async function clickLink(selector) {
      await browser.waitForElementByCss(selector)
      await browser.elementByCss(selector).click()
      await browser.waitForElementByCss('#world')
      text = await browser.elementByCss('#world').text()
      expect(text).toMatch(/skeleton/)
      await browser.waitForElementByCss('#done')
      text = await browser.elementByCss('#world').text()
      expect(text).toMatch(/world/)
    }

    await clickLink('#skeleton-static')
    await browser.back()
    await clickLink('#skeleton-ssp')
    await browser.back()
    await clickLink('#skeleton-ip')
    await browser.back()
    await clickLink('#skeleton-push')
  })
}

describe('skeleton', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        env: { __NEXT_TEST_WITH_DEVTOOL: 1 },
      })
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
    })
    afterAll(() => killApp(app))

    runTests()
  })
})
