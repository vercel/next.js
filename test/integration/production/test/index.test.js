/* global jasmine, describe, it, expect, beforeAll, afterAll */

import { readFileSync } from 'fs'
import { join } from 'path'
import {
  pkg,
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
import security from './security'

const appDir = join(__dirname, '../')
let appPort
let server
let app
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

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

    it('should set Cache-Control header', async () => {
      const buildId = readFileSync(join(__dirname, '../.next/BUILD_ID'), 'utf8')
      const buildManifest = require('../.next/build-manifest.json')
      const url = `http://localhost:${appPort}/_next/`

      const resources = []

      // test a regular page
      resources.push(`${url}${buildId}/page/index.js`)

      // test dynamic chunk
      const chunkKey = Object.keys(buildManifest).find((x) => x.includes('chunks/'))
      resources.push(url + 'webpack/' + buildManifest[chunkKey])

      const responses = await Promise.all(resources.map((resource) => fetch(resource)))

      responses.forEach((res) => {
        expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
      })
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

  describe('Runtime errors', () => {
    it('should render a server side error on the client side', async () => {
      const browser = await webdriver(appPort, '/error-in-ssr-render')
      await waitFor(2000)
      const text = await browser.elementByCss('body').text()
      // this makes sure we don't leak the actual error to the client side in production
      expect(text).toMatch(/Internal Server Error\./)
      const headingText = await browser.elementByCss('h1').text()
      // This makes sure we render statusCode on the client side correctly
      expect(headingText).toBe('500')
    })

    it('should render a client side component error', async () => {
      const browser = await webdriver(appPort, '/error-in-browser-render')
      await waitFor(2000)
      const text = await browser.elementByCss('body').text()
      expect(text).toMatch(/An unexpected error has occurred\./)
    })
  })

  describe('Misc', () => {
    it('should handle already finished responses', async () => {
      const res = {
        finished: false,
        end () {
          this.finished = true
        }
      }
      const html = await app.renderToHTML({}, res, '/finish-response', {})
      expect(html).toBeFalsy()
    })

    it('should allow to access /static/ and /_next/', async () => {
      // This is a test case which prevent the following issue happening again.
      // See: https://github.com/zeit/next.js/issues/2617
      await renderViaHTTP(appPort, '/_next/')
      await renderViaHTTP(appPort, '/static/')
      const data = await renderViaHTTP(appPort, '/static/data/item.txt')
      expect(data).toBe('item')
    })

    it('should reload the page on page script error', async () => {
      const browser = await webdriver(appPort, '/counter')
      const counter = await browser
        .elementByCss('#increase').click().click()
        .elementByCss('#counter').text()
      expect(counter).toBe('Counter: 2')

      // When we go to the 404 page, it'll do a hard reload.
      // So, it's possible for the front proxy to load a page from another zone.
      // Since the page is reloaded, when we go back to the counter page again,
      // previous counter value should be gone.
      const counterAfter404Page = await browser
        .elementByCss('#no-such-page').click()
        .waitForElementByCss('h1')
        .back()
        .waitForElementByCss('#counter-page')
        .elementByCss('#counter').text()
      expect(counterAfter404Page).toBe('Counter: 0')

      browser.close()
    })

    it('should reload the page on page script error with prefetch', async () => {
      const browser = await webdriver(appPort, '/counter')
      const counter = await browser
        .elementByCss('#increase').click().click()
        .elementByCss('#counter').text()
      expect(counter).toBe('Counter: 2')

      // Let the browser to prefetch the page and error it on the console.
      await waitFor(3000)
      const browserLogs = await browser.log('browser')
      expect(browserLogs[0].message).toMatch(/\/no-such-page.js - Failed to load resource/)

      // When we go to the 404 page, it'll do a hard reload.
      // So, it's possible for the front proxy to load a page from another zone.
      // Since the page is reloaded, when we go back to the counter page again,
      // previous counter value should be gone.
      const counterAfter404Page = await browser
        .elementByCss('#no-such-page-prefetch').click()
        .waitForElementByCss('h1')
        .back()
        .waitForElementByCss('#counter-page')
        .elementByCss('#counter').text()
      expect(counterAfter404Page).toBe('Counter: 0')

      browser.close()
    })
  })

  describe('X-Powered-By header', () => {
    it('should set it by default', async () => {
      const req = { url: '/stateless', headers: {} }
      const headers = {}
      const res = {
        getHeader (key) {
          return headers[key]
        },
        setHeader (key, value) {
          headers[key] = value
        },
        end () {}
      }

      await app.render(req, res, req.url)
      expect(headers['X-Powered-By']).toEqual(`Next.js ${pkg.version}`)
    })

    it('should not set it when poweredByHeader==false', async () => {
      const req = { url: '/stateless', headers: {} }
      const originalConfigValue = app.nextConfig.poweredByHeader
      app.nextConfig.poweredByHeader = false
      const res = {
        getHeader () {
          return false
        },
        setHeader (key, value) {
          if (key === 'XPoweredBy') {
            throw new Error('Should not set the XPoweredBy header')
          }
        },
        end () {}
      }

      await app.render(req, res, req.url)
      app.nextConfig.poweredByHeader = originalConfigValue
    })
  })

  dynamicImportTests(context, (p, q) => renderViaHTTP(context.appPort, p, q))

  security(context)
})
