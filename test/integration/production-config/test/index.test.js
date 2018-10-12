/* eslint-env jest */
/* global jasmine */

import { join } from 'path'
import {
  nextServer,
  nextBuild,
  startApp,
  stopApp
} from 'next-test-utils'
import webdriver from 'next-webdriver'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

let server

describe('Production Config Usage', () => {
  beforeAll(async () => {
    const appDir = join(__dirname, '../')
    await nextBuild(appDir)
    const app = nextServer({
      dir: join(__dirname, '../'),
      dev: false,
      quiet: true
    })
    server = await startApp(app)
  })
  afterAll(() => stopApp(server))

  describe('with next-css', () => {
    it('should load styles', async () => {
      // Try 3 times as the breaking happens intermittently
      await testBrowser()
      await testBrowser()
      await testBrowser()
    })
  })
})

async function testBrowser () {
  const browser = await webdriver(server.address().port, '/')
  const element = await browser.elementByCss('#mounted')
  const text = await element.text()
  expect(text).toMatch(/ComponentDidMount executed on client\./)
  expect(await element.getComputedCss('font-size')).toBe('40px')
  expect(await element.getComputedCss('color')).toBe('rgba(255, 0, 0, 1)')
  return browser.close()
}
