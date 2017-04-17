/* global jasmine, describe, it, expect, beforeAll, afterAll */

import { join } from 'path'
import {
  nextServer,
  nextBuild,
  startApp,
  stopApp,
  renderViaHTTP
} from 'next-test-utils'
import webdriver from 'next-webdriver'

const appDir = join(__dirname, '../')
let appPort
let server
let app
jasmine.DEFAULT_TIMEOUT_INTERVAL = 40000

describe('Production Usage', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    app = nextServer({
      dir: join(__dirname, '../'),
      dev: false,
      quiet: true
    })

    server = await startApp(app)
    appPort = server.address().port
  })
  afterAll(() => stopApp(server))

  describe('With basic usage', () => {
    it('should render the page', async () => {
      const html = await renderViaHTTP(appPort, '/')
      expect(html).toMatch(/Hello World/)
    })
  })

  describe('With navigation', () => {
    it('should navigate via client side', async () => {
      const browser = await webdriver(appPort, '/')
      const text = await browser
          .elementByCss('a').click()
          .waitForElementByCss('.about-page')
          .elementByCss('div').text()

      expect(text).toBe('About Page')
      browser.close()
    })
  })
})
