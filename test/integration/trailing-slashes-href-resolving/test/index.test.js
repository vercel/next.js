/* eslint-env jest */

import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

let app
let appPort
const appDir = join(__dirname, '../')

const runTests = () => {
  it('should route to /blog/another/ correctly', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.elementByCss('#to-blog-another').click()

    await browser.waitForElementByCss('#another')
    expect(await browser.elementByCss('#another').text()).toBe('blog another')
  })

  it('should route to /blog/first-post/ correctly', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.elementByCss('#to-blog-post').click()

    await browser.waitForElementByCss('#slug')
    expect(await browser.elementByCss('#slug').text()).toBe(
      'blog slug first-post'
    )
  })

  it('should route to /catch-all/hello/world/ correctly', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.elementByCss('#to-catch-all-item').click()

    await browser.waitForElementByCss('#slug')
    expect(await browser.elementByCss('#slug').text()).toBe(
      'catch-all slug hello/world'
    )
  })

  it('should route to /catch-all/first/ correctly', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.elementByCss('#to-catch-all-first').click()

    await browser.waitForElementByCss('#first')
    expect(await browser.elementByCss('#first').text()).toBe('catch-all first')
  })

  it('should route to /another/ correctly', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.elementByCss('#to-another').click()

    await browser.waitForElementByCss('#another')
    expect(await browser.elementByCss('#another').text()).toBe(
      'top level another'
    )
  })

  it('should route to /top-level-slug/ correctly', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.elementByCss('#to-slug').click()

    await browser.waitForElementByCss('#slug')
    expect(await browser.elementByCss('#slug').text()).toBe(
      'top level slug top-level-slug'
    )
  })
}

describe('href resolving trailing-slash', () => {
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
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })
})
