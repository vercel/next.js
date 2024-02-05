/* eslint-env jest */

import { nextBuild, nextStart, killApp, waitFor } from 'next-test-utils'
import getPort from 'get-port'
import webdriver from 'next-webdriver'
import { join } from 'path'

const appDir = join(__dirname, '../')
let appPort
let app

describe('Production Usage', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      // use compatible port: https://www.browserstack.com/question/664
      appPort = await getPort({
        port: [8080, 8081, 8888, 8899],
      })
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    it('should navigate forward and back correctly', async () => {
      const browser = await webdriver(appPort, '/')
      await browser.eval('window.beforeNav = true')
      await browser.elementByCss('#to-another').click()
      // waitForElement doesn't seem to work properly in safari 10
      await waitFor(2000)
      expect(await browser.eval('window.beforeNav')).toBe(true)
      await browser.elementByCss('#to-index').click()
      await waitFor(2000)
      expect(await browser.eval('window.beforeNav')).toBe(true)
    })
  })
})
