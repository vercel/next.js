/* eslint-env jest */

import webdriver from 'next-webdriver'

import {
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'
import { join } from 'path'

jest.setTimeout(1000 * 60 * 2)

let app
let appPort
const appDir = join(__dirname, '../')

function runTests() {
  it('should have loaded next.config.mjs', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.waitForElementByCss('#custom-var')
      const text = await browser.elementByCss('#custom-var').text()
      expect(text).toBe('hello')
    } finally {
      if (browser) await browser.close()
    }
  })
}

const nodeVersion = Number(process.versions.node.split('.')[0])
const skipTests = nodeVersion < 12

;(skipTests ? describe.skip : describe)('next.config.mjs', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
    })

    runTests()
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
    })

    runTests()
  })
})
