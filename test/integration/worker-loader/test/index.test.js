/* eslint-env jest */

import { check, findPort, killApp, launchApp } from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

const appDir = join(__dirname, '../')
const context = {}

jest.setTimeout(1000 * 60 * 2)

// TODO: Upgrade worker-loader when it's published with webpack 5 support
describe.skip('Web Workers with Fast Refresh', () => {
  beforeAll(async () => {
    context.appPort = await findPort()
    context.server = await launchApp(appDir, context.appPort)
  })
  afterAll(() => {
    killApp(context.server)
  })

  it('should pass on both client and worker', async () => {
    let browser
    try {
      browser = await webdriver(context.appPort, '/')
      await browser.waitForElementByCss('#web-status')
      await check(() => browser.elementByCss('#web-status').text(), /PASS/i)
      await browser.waitForElementByCss('#worker-status')
      await check(() => browser.elementByCss('#worker-status').text(), /PASS/i)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })
})
