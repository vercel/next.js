/* global jasmine, describe, it, expect, beforeAll, afterAll */

import { join } from 'path'
import {
  nextServer,
  nextBuild,
  startApp,
  stopApp,
  renderViaHTTP,
  waitFor
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import fetch from 'node-fetch'
import dynamicImportTests from '../../basic/test/dynamic'

const appDir = join(__dirname, '../')
let appPort
let server
let app
jasmine.DEFAULT_TIMEOUT_INTERVAL = 40000

const context = {}

describe('Production Usage', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    app = nextServer({
      dir: join(__dirname, '../'),
      dev: false,
      quiet: true
    })

    server = await startApp(app)
    context.appPort = appPort = server.address().port
  })
  afterAll(() => stopApp(server))

  describe('With basic usage', () => {
    it('should render the page', async () => {
      const html = await renderViaHTTP(appPort, '/')
      expect(html).toMatch(/Hello World/)
    })

    it('should allow etag header support', async () => {
      const url = `http://localhost:${appPort}/`
      const etag = (await fetch(url)).headers.get('ETag')

      const headers = { 'If-None-Match': etag }
      const res2 = await fetch(url, { headers })
      expect(res2.status).toBe(304)
    })

    it('should block special pages', async () => {
      const urls = ['/_document', '/_error']
      for (const url of urls) {
        const html = await renderViaHTTP(appPort, url)
        expect(html).toMatch(/404/)
      }
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

  describe('With XSS Attacks', () => {
    it('should prevent URI based attaks', async () => {
      const browser = await webdriver(appPort, '/\',document.body.innerHTML="HACKED",\'')
      // Wait 5 secs to make sure we load all the client side JS code
      await waitFor(5000)

      const bodyText = await browser
        .elementByCss('body').text()

      if (/HACKED/.test(bodyText)) {
        throw new Error('Vulnerable to XSS attacks')
      }

      browser.close()
    })
  })

  dynamicImportTests(context, (p, q) => renderViaHTTP(context.appPort, p, q))
})
