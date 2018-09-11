/* global jasmine, describe, it, expect, beforeAll, afterAll */

import { join } from 'path'
import {
  nextServer,
  nextBuild,
  startApp,
  stopApp
} from 'next-test-utils'
import webdriver from 'next-webdriver'

const appDir = join(__dirname, '../')
let server
let app
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

const context = {}

describe('Production Config Usage', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    app = nextServer({
      dir: join(__dirname, '../'),
      dev: false,
      quiet: true
    })

    server = await startApp(app)
    context.appPort = server.address().port
  })
  afterAll(() => stopApp(server))

  const openBrowser = (args) => webdriver(context.appPort, ...args)

  describe('with next-css', () => {
    it('should load styles', async () => {
      let browser

      async function testBrowser () {
        browser = await openBrowser('/')
        const element = await browser.elementByCss('#mounted')
        const text = await element.text()
        expect(text).toMatch(/ComponentDidMount executed on client\./)
        expect(await element.getComputedCss('font-size')).toBe('40px')
        expect(await element.getComputedCss('color')).toBe('rgba(255, 0, 0, 1)')
      }
      try {
        // Try 3 times as the breaking happens intermittently
        await testBrowser()
        await testBrowser()
        await testBrowser()
      } finally {
        if (browser) {
          browser.close()
        }
      }
    })
  })
})
