/* eslint-env jest */

import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  findPort,
  launchApp,
  killApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../')
let app
let appPort

const runTests = () => {
  it('should shallowly navigate back in history', async () => {
    const browser = await webdriver(appPort, '/first')
    const now = await browser.waitForElementByCss('#now').text()

    await browser.waitForElementByCss('#to-another').click()
    const text = await browser.waitForElementByCss('#text').text()
    expect(text).toBe('another')

    await browser.back()
    const now3 = await browser.waitForElementByCss('#now').text()
    expect(now3).toBe(now)
  })

  it('should shallowly navigate forwards in history', async () => {
    const browser = await webdriver(appPort, '/another')
    const text = await browser.waitForElementByCss('#text').text()
    expect(text).toBe('another')

    await browser.waitForElementByCss('#to-first').click()
    const now = await browser.waitForElementByCss('#now').text()

    await browser.back()
    const text2 = await browser.waitForElementByCss('#text').text()
    expect(text2).toBe('another')

    await browser.forward()
    const now3 = await browser.waitForElementByCss('#now').text()
    expect(now3).toBe(now)
  })

  it('should NOT shallowly navigate when clicking the link', async () => {
    const browser = await webdriver(appPort, '/first')
    const now = await browser.waitForElementByCss('#now').text()

    await browser.waitForElementByCss('#to-another').click()
    const text = await browser.waitForElementByCss('#text').text()
    expect(text).toBe('another')

    await browser.waitForElementByCss('#to-first').click()
    const now2 = await browser.waitForElementByCss('#now').text()
    expect(now2).not.toBe(now)
  })

  it('should NOT shallowly navigate in dynamic route', async () => {
    const browser = await webdriver(appPort, '/2/dynamic')
    const now = await browser.waitForElementByCss('#now').text()

    await browser.waitForElementByCss('#to-another').click()
    const text = await browser.waitForElementByCss('#text').text()
    expect(text).toBe('another')

    await browser.back()
    const now3 = await browser.waitForElementByCss('#now').text()
    expect(now3).not.toBe(now)
  })
}

describe('Client Shallow Routing when history changes', () => {
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
