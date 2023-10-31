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

const appDir = join(__dirname, '../')

let appPort
let app

const runTests = () => {
  it('back-button should go back to rewritten path successfully', async () => {
    const browser = await webdriver(appPort, '/rewrite-me/path')

    expect(await browser.elementByCss('#another').text()).toBe('another page')

    await browser.eval('window.beforeNav = 1')

    await browser
      .elementByCss('#to-index')
      .click()
      .waitForElementByCss('#index')

    await browser.back().waitForElementByCss('#another')

    expect(await browser.waitForElementByCss('#another').text()).toBe(
      'another page'
    )

    expect(await browser.eval('window.beforeNav')).toBe(1)
  })
}

describe('rewrites persist with browser history actions', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })
})
