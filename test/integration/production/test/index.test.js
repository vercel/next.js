/* eslint-env jest */
/* global jasmine */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  pkg,
  nextServer,
  runNextCommand,
  startApp,
  stopApp,
  renderViaHTTP,
  waitFor
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import fetch from 'node-fetch'
import dynamicImportTests from './dynamic'
import processEnv from './process-env'
import security from './security'
import { BUILD_MANIFEST, REACT_LOADABLE_MANIFEST, PAGES_MANIFEST } from 'next-server/constants'
import cheerio from 'cheerio'
const appDir = join(__dirname, '../')
let appPort
let server
let app
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

const context = {}

describe('Production Usage', () => {
  beforeAll(async () => {
    await runNextCommand(['build', appDir], {
      spawnOptions: { env: { ...process.env, NODE_ENV: 'production' } }
    })
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

    it('should render 404 for routes that do not exist', async () => {
      const url = `http://localhost:${appPort}/abcdefghijklmno`
      const res = await fetch(url)
      const text = await res.text()
      const $html = cheerio.load(text)
      expect($html('html').text()).toMatch(/404/)
      expect(text).toMatch(/"statusCode":404/)
      expect(res.status).toBe(404)
    })

    it('should render 404 for _next routes that do not exist', async () => {
      const url = `http://localhost:${appPort}/_next/abcdef`
      const res = await fetch(url)
      expect(res.status).toBe(404)
    })

    it('should render 404 for dotfiles in /static', async () => {
      const url = `http://localhost:${appPort}/static/.env`
      const res = await fetch(url)
      expect(res.status).toBe(404)
    })

    it('should render 501 if the HTTP method is not GET or HEAD', async () => {
      const url = `http://localhost:${appPort}/_next/abcdef`
      const methods = ['POST', 'PUT', 'DELETE']
      for (const method of methods) {
        const res = await fetch(url, { method })
        expect(res.status).toBe(501)
      }
    })

    it('should set Content-Length header', async () => {
      const url = `http://localhost:${appPort}`
      const res = await fetch(url)
      expect(res.headers.get('Content-Length')).toBeDefined()
    })

    it('should set Cache-Control header', async () => {
      const buildId = readFileSync(join(__dirname, '../.next/BUILD_ID'), 'utf8')
      const buildManifest = require(join('../.next', BUILD_MANIFEST))
      const reactLoadableManifest = require(join('../.next', REACT_LOADABLE_MANIFEST))
      const url = `http://localhost:${appPort}/_next/`

      const resources = []

      // test a regular page
      resources.push(`${url}static/${buildId}/pages/index.js`)

      // test dynamic chunk
      resources.push(url + reactLoadableManifest['../../components/hello1'][0].publicPath)

      // test main.js runtime etc
      for (const item of buildManifest.pages['/']) {
        resources.push(url + item)
      }

      const responses = await Promise.all(resources.map((resource) => fetch(resource)))

      responses.forEach((res) => {
        try {
          expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
        } catch (err) {
          err.message = res.url + ' ' + err.message
          throw err
        }
      })
    })

    it('should set correct Cache-Control header for static 404s', async () => {
      // this is to fix where 404 headers are set to 'public, max-age=31536000, immutable'
      const res = await fetch(`http://localhost:${appPort}/_next//static/common/bad-static.js`)

      expect(res.status).toBe(404)
      expect(res.headers.get('Cache-Control')).toBe('no-cache, no-store, max-age=0, must-revalidate')
    })

    it('should block special pages', async () => {
      const urls = ['/_document', '/_app']
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

    it('should navigate to nested index via client side', async () => {
      const browser = await webdriver(appPort, '/another')
      const text = await browser
        .elementByCss('a').click()
        .waitForElementByCss('.index-page')
        .elementByCss('p').text()

      expect(text).toBe('Hello World')
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
      browser.close()
    })

    it('should render a client side component error', async () => {
      const browser = await webdriver(appPort, '/error-in-browser-render')
      await waitFor(2000)
      const text = await browser.elementByCss('body').text()
      expect(text).toMatch(/An unexpected error has occurred\./)
      browser.close()
    })

    it('should call getInitialProps on _error page during a client side component error', async () => {
      const browser = await webdriver(appPort, '/error-in-browser-render-status-code')
      await waitFor(2000)
      const text = await browser.elementByCss('body').text()
      expect(text).toMatch(/This page could not be found\./)
      browser.close()
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

    it('should add preload tags when Link prefetch prop is used', async () => {
      const browser = await webdriver(appPort, '/prefetch')
      const elements = await browser.elementsByCss('link[rel=preload]')
      expect(elements.length).toBe(9)
      await Promise.all(
        elements.map(async (element) => {
          const rel = await element.getAttribute('rel')
          const as = await element.getAttribute('as')
          expect(rel).toBe('preload')
          expect(as).toBe('script')
        })
      )
      browser.close()
    })

    // This is a workaround to fix https://github.com/zeit/next.js/issues/5860
    // TODO: remove this workaround when https://bugs.webkit.org/show_bug.cgi?id=187726 is fixed.
    it('It does not add a timestamp to link tags with preload attribute', async () => {
      const browser = await webdriver(appPort, '/prefetch')
      const links = await browser.elementsByCss('link[rel=preload]')
      await Promise.all(
        links.map(async (element) => {
          const href = await element.getAttribute('href')
          expect(href).not.toMatch(/\?ts=/)
        })
      )
      const scripts = await browser.elementsByCss('script[src]')
      await Promise.all(
        scripts.map(async (element) => {
          const src = await element.getAttribute('src')
          expect(src).not.toMatch(/\?ts=/)
        })
      )
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
      let foundLog = false
      browserLogs.forEach((log) => {
        if (log.message.match(/\/no-such-page\.js - Failed to load resource/)) {
          foundLog = true
        }
      })

      expect(foundLog).toBe(true)

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

  it('should not expose the compiled page file in development', async () => {
    const url = `http://localhost:${appPort}`
    await fetch(`${url}/stateless`) // make sure the stateless page is built
    const clientSideJsRes = await fetch(`${url}/_next/development/static/development/pages/stateless.js`)
    expect(clientSideJsRes.status).toBe(404)
    const clientSideJsBody = await clientSideJsRes.text()
    expect(clientSideJsBody).toMatch(/404/)

    const serverSideJsRes = await fetch(`${url}/_next/development/server/static/development/pages/stateless.js`)
    expect(serverSideJsRes.status).toBe(404)
    const serverSideJsBody = await serverSideJsRes.text()
    expect(serverSideJsBody).toMatch(/404/)
  })

  it('should not put backslashes in pages-manifest.json', () => {
    // Whatever platform you build on, pages-manifest.json should use forward slash (/)
    // See: https://github.com/zeit/next.js/issues/4920
    const pagesManifest = require(join('..', '.next', 'server', PAGES_MANIFEST))

    for (let key of Object.keys(pagesManifest)) {
      expect(key).not.toMatch(/\\/)
      expect(pagesManifest[key]).not.toMatch(/\\/)
    }
  })

  it('should handle failed param decoding', async () => {
    const html = await renderViaHTTP(appPort, '/%DE~%C7%1fY/')
    expect(html).toMatch(/400/)
    expect(html).toMatch(/Bad Request/)
  })

  dynamicImportTests(context, (p, q) => renderViaHTTP(context.appPort, p, q))

  processEnv(context)
  security(context)
})
