/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  killApp,
  fsTimeMachine
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { asserters } from 'wd'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

let port
let server

describe('Page Extensions', () => {
  beforeAll(async () => {
    port = await findPort()
    server = await launchApp(join(__dirname, '../'), port)

    // pre-build all pages at the start
    await Promise.all([
      renderViaHTTP(port, '/hmr/some-page')
    ])
  })
  afterAll(() => killApp(server))

  describe('Hot Module Reloading', () => {
    it('should reload typescript file without refresh', async () => {
      const somePage = await fsTimeMachine(join(__dirname, '../pages/hmr/some-page.tsx'))
      const browser = await webdriver(port, '/hmr/some-page')

      const randomNumber = await browser.eval('window.HMR_RANDOM_NUMBER')
      const originalButtonText = await browser.elementByCss('button').text()
      expect(originalButtonText).toBe('Increment')

      await somePage.replace('Increment', 'INCREMENT')
      await browser.waitForElementByCss('button', asserters.textInclude('INCREMENT'), 5000)

      const randomNumberAfterEdit = await browser.eval('window.HMR_RANDOM_NUMBER')
      expect(randomNumberAfterEdit).toBe(randomNumber)

      await Promise.all([
        somePage.restore(),
        browser.close()
      ])
    })
  })
})
