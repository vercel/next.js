/* eslint-env jest */
import {
  check,
  findPort,
  killApp,
  launchApp,
  nextStart,
  nextBuild,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

const appDir = join(__dirname, '../')

let appPort
let app

const runTests = () => {
  it('should pass on both client and worker', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
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
}

describe('Web Workers with webpack 5', () => {
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
