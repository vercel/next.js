/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  killApp,
  nextBuild,
  nextStart
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2
const appDir = join(__dirname, '..')
let app
let appPort

const runTests = () => {
  it('should navigate between pages successfully', async () => {
    const browser = await webdriver(appPort, '/')
    let text = await browser.elementByCss('p').text()
    expect(text).toMatch(/hello.*?world/)

    // go to /another
    await browser.elementByCss('#another').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('p').text()
    expect(text).toMatch(/hello.*?world/)

    // go to /
    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#another')
    text = await browser.elementByCss('p').text()
    expect(text).toMatch(/hello.*?world/)

    // go to /something
    await browser.elementByCss('#something').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('p').text()
    expect(text).toMatch(/hello.*?world/)

    // go to /
    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#post-1')

    // go to /blog/post-1
    await browser.elementByCss('#post-1').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('p').text()
    expect(text).toMatch(/Post:.*?post-1/)

    // go to /
    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#comment-1')

    // go to /blog/post-1/comment-1
    await browser.elementByCss('#comment-1').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('p:nth-child(2)').text()
    expect(text).toMatch(/Comment:.*?comment-1/)

    await browser.close()
  })

  it('should SSR content correctly', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/hello.*?world/)
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
}

describe('SPR Prerender', () => {
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

    it('outputs a prerender-manifest correctly', async () => {
      const manifest = require(join(appDir, '.next', 'prerender-manifest.json'))

      expect(manifest.version).toBe(1)
      expect(manifest.routes).toEqual({
        '/another': { revalidate: 0 },
        '/blog/post-1': { revalidate: 10 },
        '/blog/post-2': { revalidate: 10 },
        '/blog/post-1/comment-1': { revalidate: 5 },
        '/blog/post-2/comment-2': { revalidate: 5 },
        '/something': { revalidate: false }
      })
    })
  })
})
