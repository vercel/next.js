/* eslint-env jest */
/* global jasmine, browserName */
import webdriver from 'next-webdriver'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import {
  nextServer,
  runNextCommand,
  startApp,
  stopApp,
  renderViaHTTP,
  waitFor,
} from 'next-test-utils'
import fetch from 'node-fetch'
import dynamicImportTests from './dynamic'
import processEnv from './process-env'
import security from './security'
import {
  BUILD_MANIFEST,
  REACT_LOADABLE_MANIFEST,
  PAGES_MANIFEST,
} from 'next/constants'
import cheerio from 'cheerio'
const appDir = join(__dirname, '../')
let serverDir
let appPort
let server
let app
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

const context = {}

describe('Production Usage', () => {
  beforeAll(async () => {
    await runNextCommand(['build', appDir])

    app = nextServer({
      dir: join(__dirname, '../'),
      dev: false,
      quiet: true,
    })

    server = await startApp(app)
    context.appPort = appPort = server.address().port

    const buildId = readFileSync(join(appDir, '.next/BUILD_ID'), 'utf8')
    serverDir = join(appDir, '.next/server/static/', buildId, 'pages')
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

    it('should have X-Powered-By header support', async () => {
      const url = `http://localhost:${appPort}/`
      const header = (await fetch(url)).headers.get('X-Powered-By')

      expect(header).toBe('Next.js')
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

    it('should render 404 for /_next/static route', async () => {
      const html = await renderViaHTTP(appPort, '/_next/static')
      expect(html).toMatch(/This page could not be found/)
    })

    it('should render 200 for POST on page', async () => {
      const res = await fetch(`http://localhost:${appPort}/about`, {
        method: 'POST',
      })
      expect(res.status).toBe(200)
    })

    it('should render 404 for POST on missing page', async () => {
      const res = await fetch(`http://localhost:${appPort}/fake-page`, {
        method: 'POST',
      })
      expect(res.status).toBe(404)
    })

    it('should render 404 for _next routes that do not exist', async () => {
      const url = `http://localhost:${appPort}/_next/abcdef`
      const res = await fetch(url)
      expect(res.status).toBe(404)
    })

    it('should render 404 even if the HTTP method is not GET or HEAD', async () => {
      const url = `http://localhost:${appPort}/_next/abcdef`
      const methods = ['POST', 'PUT', 'DELETE']
      for (const method of methods) {
        const res = await fetch(url, { method })
        expect(res.status).toBe(404)
      }
    })

    it('should render 404 for dotfiles in /static', async () => {
      const url = `http://localhost:${appPort}/static/.env`
      const res = await fetch(url)
      expect(res.status).toBe(404)
    })

    it('should return 405 method on static then GET and HEAD', async () => {
      const res = await fetch(
        `http://localhost:${appPort}/static/data/item.txt`,
        {
          method: 'POST',
        }
      )
      expect(res.headers.get('allow').includes('GET')).toBe(true)
      expect(res.status).toBe(405)
    })

    it('should return 412 on static file when If-Unmodified-Since is provided and file is modified', async () => {
      const buildId = readFileSync(join(__dirname, '../.next/BUILD_ID'), 'utf8')

      const res = await fetch(
        `http://localhost:${appPort}/_next/static/${buildId}/pages/index.js`,
        {
          method: 'GET',
          headers: { 'if-unmodified-since': 'Fri, 12 Jul 2019 20:00:13 GMT' },
        }
      )
      expect(res.status).toBe(412)
    })

    it('should return 200 on static file if If-Unmodified-Since is invalid date', async () => {
      const buildId = readFileSync(join(__dirname, '../.next/BUILD_ID'), 'utf8')

      const res = await fetch(
        `http://localhost:${appPort}/_next/static/${buildId}/pages/index.js`,
        {
          method: 'GET',
          headers: { 'if-unmodified-since': 'nextjs' },
        }
      )
      expect(res.status).toBe(200)
    })

    it('should set Content-Length header', async () => {
      const url = `http://localhost:${appPort}`
      const res = await fetch(url)
      expect(res.headers.get('Content-Length')).toBeDefined()
    })

    it('should set Cache-Control header', async () => {
      const buildId = readFileSync(join(__dirname, '../.next/BUILD_ID'), 'utf8')
      const buildManifest = require(join('../.next', BUILD_MANIFEST))
      const reactLoadableManifest = require(join(
        '../.next',
        REACT_LOADABLE_MANIFEST
      ))
      const url = `http://localhost:${appPort}/_next/`

      const resources = []

      // test a regular page
      resources.push(`${url}static/${buildId}/pages/index.js`)

      // test dynamic chunk
      resources.push(
        url + reactLoadableManifest['../../components/hello1'][0].publicPath
      )

      // test main.js runtime etc
      for (const item of buildManifest.pages['/']) {
        resources.push(url + item)
      }

      const responses = await Promise.all(
        resources.map(resource => fetch(resource))
      )

      responses.forEach(res => {
        try {
          expect(res.headers.get('Cache-Control')).toBe(
            'public, max-age=31536000, immutable'
          )
        } catch (err) {
          err.message = res.url + ' ' + err.message
          throw err
        }
      })
    })

    it('should set correct Cache-Control header for static 404s', async () => {
      // this is to fix where 404 headers are set to 'public, max-age=31536000, immutable'
      const res = await fetch(
        `http://localhost:${appPort}/_next//static/common/bad-static.js`
      )

      expect(res.status).toBe(404)
      expect(res.headers.get('Cache-Control')).toBe(
        'no-cache, no-store, max-age=0, must-revalidate'
      )
    })

    it('should block special pages', async () => {
      const urls = ['/_document', '/_app']
      for (const url of urls) {
        const html = await renderViaHTTP(appPort, url)
        expect(html).toMatch(/404/)
      }
    })
  })

  describe('API routes', () => {
    it('should work with pages/api/index.js', async () => {
      const url = `http://localhost:${appPort}/api`
      const res = await fetch(url)
      const body = await res.text()
      expect(body).toEqual('API index works')
    })

    it('should work with pages/api/hello.js', async () => {
      const url = `http://localhost:${appPort}/api/hello`
      const res = await fetch(url)
      const body = await res.text()
      expect(body).toEqual('API hello works')
    })

    it('should work with dynamic params and search string', async () => {
      const url = `http://localhost:${appPort}/api/post-1?val=1`
      const res = await fetch(url)
      const body = await res.json()

      expect(body).toEqual({ val: '1', post: 'post-1' })
    })
  })

  describe('With navigation', () => {
    it('should navigate via client side', async () => {
      const browser = await webdriver(appPort, '/')
      const text = await browser
        .elementByCss('a')
        .click()
        .waitForElementByCss('.about-page')
        .elementByCss('div')
        .text()

      expect(text).toBe('About Page')
      await browser.close()
    })

    it('should navigate to nested index via client side', async () => {
      const browser = await webdriver(appPort, '/another')
      const text = await browser
        .elementByCss('a')
        .click()
        .waitForElementByCss('.index-page')
        .elementByCss('p')
        .text()

      expect(text).toBe('Hello World')
      await browser.close()
    })
  })

  it('should navigate to external site and back', async () => {
    const browser = await webdriver(appPort, '/external-and-back')
    const initialText = await browser.elementByCss('p').text()
    expect(initialText).toBe('server')

    await browser
      .elementByCss('a')
      .click()
      .waitForElementByCss('input')
      .back()
      .waitForElementByCss('p')

    await waitFor(1000)
    const newText = await browser.elementByCss('p').text()
    expect(newText).toBe('server')
  })

  it('should change query correctly', async () => {
    const browser = await webdriver(appPort, '/query?id=0')
    let id = await browser.elementByCss('#q0').text()
    expect(id).toBe('0')

    await browser
      .elementByCss('#first')
      .click()
      .waitForElementByCss('#q1')

    id = await browser.elementByCss('#q1').text()
    expect(id).toBe('1')

    await browser
      .elementByCss('#second')
      .click()
      .waitForElementByCss('#q2')

    id = await browser.elementByCss('#q2').text()
    expect(id).toBe('2')
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
      await browser.close()
    })

    it('should render a client side component error', async () => {
      const browser = await webdriver(appPort, '/error-in-browser-render')
      await waitFor(2000)
      const text = await browser.elementByCss('body').text()
      expect(text).toMatch(/An unexpected error has occurred\./)
      await browser.close()
    })

    it('should call getInitialProps on _error page during a client side component error', async () => {
      const browser = await webdriver(
        appPort,
        '/error-in-browser-render-status-code'
      )
      await waitFor(2000)
      const text = await browser.elementByCss('body').text()
      expect(text).toMatch(/This page could not be found\./)
      await browser.close()
    })
  })

  describe('Misc', () => {
    it('should handle already finished responses', async () => {
      const res = {
        finished: false,
        end() {
          this.finished = true
        },
      }
      const html = await app.renderToHTML(
        { method: 'GET' },
        res,
        '/finish-response',
        {}
      )
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

    it('Should allow access to public files', async () => {
      const data = await renderViaHTTP(appPort, '/data/data.txt')
      const file = await renderViaHTTP(appPort, '/file')
      const legacy = await renderViaHTTP(appPort, '/static/legacy.txt')
      expect(data).toBe('data')
      expect(file).toBe('test')
      expect(legacy).toMatch(`new static folder`)
    })

    it('should reload the page on page script error', async () => {
      const browser = await webdriver(appPort, '/counter')
      const counter = await browser
        .elementByCss('#increase')
        .click()
        .click()
        .elementByCss('#counter')
        .text()
      expect(counter).toBe('Counter: 2')

      // When we go to the 404 page, it'll do a hard reload.
      // So, it's possible for the front proxy to load a page from another zone.
      // Since the page is reloaded, when we go back to the counter page again,
      // previous counter value should be gone.
      const counterAfter404Page = await browser
        .elementByCss('#no-such-page')
        .click()
        .waitForElementByCss('h1')
        .back()
        .waitForElementByCss('#counter-page')
        .elementByCss('#counter')
        .text()
      expect(counterAfter404Page).toBe('Counter: 0')

      await browser.close()
    })

    it('should have default runtime values when not defined', async () => {
      const html = await renderViaHTTP(appPort, '/runtime-config')
      expect(html).toMatch(/found public config/)
      expect(html).toMatch(/found server config/)
    })

    it('should not have runtimeConfig in __NEXT_DATA__', async () => {
      const html = await renderViaHTTP(appPort, '/runtime-config')
      const $ = cheerio.load(html)
      const script = $('#__NEXT_DATA__').html()
      expect(script).not.toMatch(/runtimeConfig/)
    })

    it('should add autoExport for auto pre-rendered pages', async () => {
      for (const page of ['/', '/about']) {
        const html = await renderViaHTTP(appPort, page)
        const $ = cheerio.load(html)
        const data = JSON.parse($('#__NEXT_DATA__').html())
        expect(data.autoExport).toBe(true)
      }
    })

    it('should not add autoExport for non pre-rendered pages', async () => {
      for (const page of ['/query']) {
        const html = await renderViaHTTP(appPort, page)
        const $ = cheerio.load(html)
        const data = JSON.parse($('#__NEXT_DATA__').html())
        expect(!!data.autoExport).toBe(false)
      }
    })

    it('should add prefetch tags when Link prefetch prop is used', async () => {
      const browser = await webdriver(appPort, '/prefetch')
      await waitFor(2000)
      const elements = await browser.elementsByCss('link[rel=prefetch]')

      expect(elements.length).toBe(4)
      await Promise.all(
        elements.map(async element => {
          const rel = await element.getAttribute('rel')
          const as = await element.getAttribute('as')
          expect(rel).toBe('prefetch')
          expect(as).toBe('script')
        })
      )
      await browser.close()
    })

    // This is a workaround to fix https://github.com/zeit/next.js/issues/5860
    // TODO: remove this workaround when https://bugs.webkit.org/show_bug.cgi?id=187726 is fixed.
    it('It does not add a timestamp to link tags with prefetch attribute', async () => {
      const browser = await webdriver(appPort, '/prefetch')
      const links = await browser.elementsByCss('link[rel=prefetch]')
      await Promise.all(
        links.map(async element => {
          const href = await element.getAttribute('href')
          expect(href).not.toMatch(/\?ts=/)
        })
      )
      const scripts = await browser.elementsByCss('script[src]')
      await Promise.all(
        scripts.map(async element => {
          const src = await element.getAttribute('src')
          expect(src).not.toMatch(/\?ts=/)
        })
      )
      await browser.close()
    })

    it('should reload the page on page script error with prefetch', async () => {
      const browser = await webdriver(appPort, '/counter')
      if (global.browserName !== 'chrome') return
      const counter = await browser
        .elementByCss('#increase')
        .click()
        .click()
        .elementByCss('#counter')
        .text()
      expect(counter).toBe('Counter: 2')

      // Let the browser to prefetch the page and error it on the console.
      await waitFor(3000)
      const browserLogs = await browser.log('browser')
      let foundLog = false
      browserLogs.forEach(log => {
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
        .elementByCss('#no-such-page-prefetch')
        .click()
        .waitForElementByCss('h1')
        .back()
        .waitForElementByCss('#counter-page')
        .elementByCss('#counter')
        .text()
      expect(counterAfter404Page).toBe('Counter: 0')

      await browser.close()
    })
  })

  it('should not expose the compiled page file in development', async () => {
    const url = `http://localhost:${appPort}`
    await fetch(`${url}/stateless`) // make sure the stateless page is built
    const clientSideJsRes = await fetch(
      `${url}/_next/development/static/development/pages/stateless.js`
    )
    expect(clientSideJsRes.status).toBe(404)
    const clientSideJsBody = await clientSideJsRes.text()
    expect(clientSideJsBody).toMatch(/404/)

    const serverSideJsRes = await fetch(
      `${url}/_next/development/server/static/development/pages/stateless.js`
    )
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

  it('should replace static pages with HTML files', async () => {
    const staticFiles = ['about', 'another', 'counter', 'dynamic', 'prefetch']
    for (const file of staticFiles) {
      expect(existsSync(join(serverDir, file + '.html'))).toBe(true)
      expect(existsSync(join(serverDir, file + '.js'))).toBe(false)
    }
  })

  it('should not replace non-static pages with HTML files', async () => {
    const nonStaticFiles = ['api', 'external-and-back', 'finish-response']
    for (const file of nonStaticFiles) {
      expect(existsSync(join(serverDir, file + '.js'))).toBe(true)
      expect(existsSync(join(serverDir, file + '.html'))).toBe(false)
    }
  })

  it('should handle AMP correctly in IE', async () => {
    const browser = await webdriver(appPort, '/some-amp')
    await waitFor(1000)
    const text = await browser.elementByCss('p').text()
    expect(text).toBe('Not AMP')
  })

  it('should warn when prefetch is true', async () => {
    if (global.browserName !== 'chrome') return
    let browser
    try {
      browser = await webdriver(appPort, '/development-logs')
      const browserLogs = await browser.log('browser')
      let found = false
      browserLogs.forEach(log => {
        if (log.message.includes('Next.js auto-prefetches automatically')) {
          found = true
        }
      })
      expect(found).toBe(false)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should not emit profiling events', async () => {
    expect(existsSync(join(appDir, '.next', 'profile-events.json'))).toBe(false)
  })

  it('should contain the Next.js version in window export', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/about')
      const version = await browser.eval('window.next.version')
      expect(version).toBeTruthy()
      expect(version).toBe(require('next/package.json').version)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should clear all core performance marks', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/about')
      const currentPerfMarks = await browser.eval(
        `window.performance.getEntriesByType('mark')`
      )
      const allPerfMarks = [
        'beforeRender',
        'afterHydrate',
        'afterRender',
        'routeChange',
      ]

      allPerfMarks.forEach(name =>
        expect(currentPerfMarks).not.toContainEqual(
          expect.objectContaining({ name })
        )
      )
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should not clear custom performance marks', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/mark-in-head')

      const customMarkFound = await browser.eval(
        `window.performance.getEntriesByType('mark').filter(function(e) {
          return e.name === 'custom-mark'
        }).length === 1`
      )
      expect(customMarkFound).toBe(true)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should have async on all script tags', async () => {
    const html = await renderViaHTTP(appPort, '/')
    const $ = cheerio.load(html)
    let missing = false

    for (const script of $('script').toArray()) {
      // application/json doesn't need defer
      if (
        script.attribs.type === 'application/json' ||
        script.attribs.src.includes('polyfills')
      ) {
        continue
      }

      if (script.attribs.async !== '') {
        missing = true
      }
    }
    expect(missing).toBe(false)
  })

  dynamicImportTests(context, (p, q) => renderViaHTTP(context.appPort, p, q))

  processEnv(context)
  if (browserName === 'chrome') security(context)
})
