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
  it('back-button should go back to rewritten path successfully', async () => {
    const browser = await webdriver(appPort, '/rewrite-me')

    expect(await browser.elementByCss('#another').text()).toBe('another page')

    await browser
      .elementByCss('#to-index')
      .click()
      .waitForElementByCss('#index')

    await browser.back()

    expect(await browser.elementByCss('#another').text()).toBe('another page')
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
