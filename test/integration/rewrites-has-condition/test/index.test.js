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
  it('should load page rewrite without browser errors', async () => {
    const browser = await webdriver(appPort, '/rewrite-simple')

    expect(await browser.waitForElementByCss('#another').text()).toBe(
      'another page'
    )

    const browserLogs = await browser.log('browser')
    const errorLogs = browserLogs.filter((log) => {
      return log.level.name === 'SEVERE' && log.message.includes('Error:')
    })
    expect(errorLogs).toEqual([])
  })

  // Regression test for https://github.com/vercel/next.js/issues/25207
  it('should load page rewrite, with "has" condition, without browser errors', async () => {
    const browser = await webdriver(appPort, '/rewrite-with-has?hasQuery=123')

    expect(await browser.waitForElementByCss('#another').text()).toBe(
      'another page'
    )

    const browserLogs = await browser.log('browser')
    const errorLogs = browserLogs.filter((log) => {
      return log.level.name === 'SEVERE' && log.message.includes('Error:')
    })
    expect(errorLogs).toEqual([])
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
