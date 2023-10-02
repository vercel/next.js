/* eslint-env jest */

import { join } from 'path'
import webdriver from 'next-webdriver'
import { nextBuild, nextStart, findPort, killApp, check } from 'next-test-utils'

const appDir = join(__dirname, '..')
const nodeArgs = ['-r', join(appDir, '../../lib/react-channel-require-hook.js')]
let appPort
let app

// TODO: re-enable with React 18
describe.skip('Custom error page exception', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir, undefined, {
        nodeArgs,
      })
      appPort = await findPort()
      app = await nextStart(appDir, appPort, {
        nodeArgs,
      })
    })
    afterAll(() => killApp(app))
    it('should handle errors from _error render', async () => {
      const navSel = '#nav'
      const browser = await webdriver(appPort, '/')
      await browser.waitForElementByCss(navSel).elementByCss(navSel).click()

      await check(
        () => browser.eval('document.documentElement.innerHTML'),
        /Application error: a client-side exception has occurred/
      )
    })
  })
})
