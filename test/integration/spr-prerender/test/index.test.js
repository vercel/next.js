/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  renderViaHTTP,
  fetchViaHTTP,
  findPort,
  launchApp,
  killApp,
  nextBuild,
  nextStart
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5
const appDir = join(__dirname, '..')
let app
let appPort

const runTests = () => {
  it('should navigate between pages successfully', async () => {
    const browser = await webdriver(appPort, '/')
    let text = await browser.elementByCss('p').text()
    expect(text).toMatch(/hello.*?world/)

    await browser.elementByCss('#another').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('p').text()
    expect(text).toMatch(/hello.*?world/)

    await browser.elementByCss('#home').click()
    await browser.waitForElementByCss('#another')
    text = await browser.elementByCss('p').text()
    expect(text).toMatch(/hello.*?world/)

    await browser.elementByCss('#something').click()
    await browser.waitForElementByCss('#home')
    text = await browser.elementByCss('p').text()
    expect(text).toMatch(/hello.*?world/)
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

  it('should return JSON when content-type is set', async () => {
    const data = await fetchViaHTTP(appPort, '/', undefined, {
      headers: {
        'content-type': 'application/json'
      }
    }).then(res => res.ok && res.text())

    expect(JSON.parse(data).world).toMatch('world')
  })
}

describe('SPR Prerender', () => {
  describe('development mode', () => {
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
      const pages = manifest.prerenderRoutes.map(route => route.path)

      expect(JSON.stringify(pages.sort())).toBe(
        JSON.stringify(['/', '/another', '/something'])
      )
    })
  })
})
