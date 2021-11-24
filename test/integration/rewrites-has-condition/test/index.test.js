/* eslint-env jest */

import { join } from 'path'
import {
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'
import webdriver from 'next-webdriver'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../')

let appPort
let app

const runTests = () => {
  it('should navigate to a simple rewrite without error', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.eval('window.beforeNav = 1')

    await browser
      .elementByCss('#to-simple')
      .click()
      .waitForElementByCss('#another')
    expect(await browser.elementByCss('#pathname').text()).toBe('/another')
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({})
    expect(await browser.eval('window.beforeNav')).toBe(1)
  })

  it('should navigate to a has rewrite without error', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.eval('window.beforeNav = 1')

    await browser
      .elementByCss('#to-has-rewrite')
      .click()
      .waitForElementByCss('#another')
    expect(await browser.elementByCss('#pathname').text()).toBe('/another')
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
      hasQuery: 'true',
    })
    expect(await browser.eval('window.beforeNav')).toBe(1)
  })
}

describe('rewrites has condition', () => {
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
