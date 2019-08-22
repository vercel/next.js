/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import webdriver from 'next-webdriver'
import { killApp, findPort, launchApp } from 'next-test-utils'

const appDir = join(__dirname, '../')
let appPort
let server
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

describe('AMP Bind Initial Data', () => {
  beforeAll(async () => {
    appPort = await findPort()
    server = await launchApp(appDir, appPort)
  })
  afterAll(() => killApp(server))

  it('relays the data to analytics', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.waitForElementByCss('h1')
    const h1Text = await browser.elementByCss('h1').text()
    const data = parseFloat(
      await browser.eval('localStorage.getItem("Next.js-hydration")')
    )
    expect(h1Text).toMatch(/Hello!/)
    expect(data).not.toBeNaN()
    expect(data).toBeGreaterThan(0)
    await browser.close()
  })
})
