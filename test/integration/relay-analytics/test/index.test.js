/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import webdriver from 'next-webdriver'
import { killApp, findPort, launchApp } from 'next-test-utils'

const appDir = join(__dirname, '../')
let appPort
let server
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

describe('Analytics relayer', () => {
  beforeAll(async () => {
    appPort = await findPort()
    server = await launchApp(appDir, appPort)
  })
  afterAll(() => killApp(server))

  it('Relays the data to user code', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.waitForElementByCss('h1')
    const h1Text = await browser.elementByCss('h1').text()
    const data = parseFloat(
      await browser.eval('localStorage.getItem("Next.js-hydration")')
    )
    const firstPaint = parseFloat(
      await browser.eval('localStorage.getItem("first-paint")')
    )
    const firstContentfulPaint = parseFloat(
      await browser.eval('localStorage.getItem("first-contentful-paint")')
    )
    expect(h1Text).toMatch(/Hello!/)
    expect(data).not.toBeNaN()
    expect(data).toBeGreaterThan(0)
    expect(firstPaint).not.toBeNaN()
    expect(firstPaint).toBeGreaterThan(0)
    expect(firstContentfulPaint).not.toBeNaN()
    expect(firstContentfulPaint).toBeGreaterThan(0)
    await browser.close()
  })
})
