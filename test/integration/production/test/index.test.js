/* global fixture, test */
import { t } from 'testcafe'
import webdriver from 'next-webdriver'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import {
  nextServer,
  runNextCommand,
  startApp,
  stopApp,
  renderViaHTTP,
  waitFor
} from 'next-test-utils'
import fetch from 'node-fetch'
import dynamicImportTests from './dynamic'
import processEnv from './process-env'
import {
  BUILD_MANIFEST,
  REACT_LOADABLE_MANIFEST,
  PAGES_MANIFEST
} from 'next/constants'
import cheerio from 'cheerio'

const appDir = join(__dirname, '../')

fixture('Production Usage')
  .before(async ctx => {
    await runNextCommand(['build', appDir])

    ctx.app = nextServer({
      dir: join(__dirname, '../'),
      dev: false,
      quiet: true
    })

    ctx.server = await startApp(ctx.app)
    ctx.appPort = ctx.server.address().port

    const buildId = readFileSync(join(appDir, '.next/BUILD_ID'), 'utf8')
    ctx.serverDir = join(appDir, '.next/server/static/', buildId, 'pages')
  })
  .after(ctx => stopApp(ctx.server))

test('should render the page', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/')
  await t.expect(html).match(/Hello World/)
})

test('should allow etag header support', async t => {
  const url = `http://localhost:${t.fixtureCtx.appPort}/`
  const etag = (await fetch(url)).headers.get('ETag')

  const headers = { 'If-None-Match': etag }
  const res2 = await fetch(url, { headers })
  await t.expect(res2.status).eql(304)
})

test('should have X-Powered-By header support', async t => {
  const url = `http://localhost:${t.fixtureCtx.appPort}/`
  const header = (await fetch(url)).headers.get('X-Powered-By')

  await t.expect(header).eql('Next.js')
})

test('should render 404 for routes that do not exist', async t => {
  const url = `http://localhost:${t.fixtureCtx.appPort}/abcdefghijklmno`
  const res = await fetch(url)
  const text = await res.text()
  const $html = cheerio.load(text)
  await t.expect($html('html').text()).match(/404/)
  await t.expect(text).match(/"statusCode":404/)
  await t.expect(res.status).eql(404)
})

test('should render 404 for /_next/static route', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/_next/static')
  await t.expect(html).match(/This page could not be found/)
})

test('should render 200 for POST on page', async t => {
  const res = await fetch(`http://localhost:${t.fixtureCtx.appPort}/about`, {
    method: 'POST'
  })
  await t.expect(res.status).eql(200)
})

test('should render 404 for POST on missing page', async t => {
  const res = await fetch(
    `http://localhost:${t.fixtureCtx.appPort}/fake-page`,
    {
      method: 'POST'
    }
  )
  await t.expect(res.status).eql(404)
})

test('should render 404 for _next routes that do not exist', async t => {
  const url = `http://localhost:${t.fixtureCtx.appPort}/_next/abcdef`
  const res = await fetch(url)
  await t.expect(res.status).eql(404)
})

test('should render 404 even if the HTTP method is not GET or HEAD', async t => {
  const url = `http://localhost:${t.fixtureCtx.appPort}/_next/abcdef`
  const methods = ['POST', 'PUT', 'DELETE']
  for (const method of methods) {
    const res = await fetch(url, { method })
    await t.expect(res.status).eql(404)
  }
})

test('should render 404 for dotfiles in /static', async t => {
  const url = `http://localhost:${t.fixtureCtx.appPort}/static/.env`
  const res = await fetch(url)
  await t.expect(res.status).eql(404)
})

test('should return 405 method on static then GET and HEAD', async t => {
  const res = await fetch(
    `http://localhost:${t.fixtureCtx.appPort}/static/data/item.txt`,
    {
      method: 'POST'
    }
  )
  await t.expect(res.headers.get('allow').includes('GET')).eql(true)
  await t.expect(res.status).eql(405)
})

test('should return 412 on static file when If-Unmodified-Since is provided and file is modified', async t => {
  const buildId = readFileSync(join(__dirname, '../.next/BUILD_ID'), 'utf8')

  const res = await fetch(
    `http://localhost:${
      t.fixtureCtx.appPort
    }/_next/static/${buildId}/pages/index.js`,
    {
      method: 'GET',
      headers: { 'if-unmodified-since': 'Fri, 12 Jul 2019 20:00:13 GMT' }
    }
  )
  await t.expect(res.status).eql(412)
})

test('should return 200 on static file if If-Unmodified-Since is invalid date', async t => {
  const buildId = readFileSync(join(__dirname, '../.next/BUILD_ID'), 'utf8')

  const res = await fetch(
    `http://localhost:${
      t.fixtureCtx.appPort
    }/_next/static/${buildId}/pages/index.js`,
    {
      method: 'GET',
      headers: { 'if-unmodified-since': 'nextjs' }
    }
  )
  await t.expect(res.status).eql(200)
})

test('should set Content-Length header', async t => {
  const url = `http://localhost:${t.fixtureCtx.appPort}`
  const res = await fetch(url)
  await t.expect(typeof res.headers.get('Content-Length')).notEql('undefined')
})

test('should set Cache-Control header', async t => {
  const buildId = readFileSync(join(__dirname, '../.next/BUILD_ID'), 'utf8')
  const buildManifest = require(join('../.next', BUILD_MANIFEST))
  const reactLoadableManifest = require(join(
    '../.next',
    REACT_LOADABLE_MANIFEST
  ))
  const url = `http://localhost:${t.fixtureCtx.appPort}/_next/`

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

  await Promise.all(
    responses.map(async res => {
      try {
        await t
          .expect(res.headers.get('Cache-Control'))
          .eql('public, max-age=31536000, immutable')
      } catch (err) {
        err.message = res.url + ' ' + err.message
        throw err
      }
    })
  )
})

test('should set correct Cache-Control header for static 404s', async t => {
  // this is to fix where 404 headers are set to 'public, max-age=31536000, immutable'
  const res = await fetch(
    `http://localhost:${
      t.fixtureCtx.appPort
    }/_next//static/common/bad-static.js`
  )

  await t.expect(res.status).eql(404)
  await t
    .expect(res.headers.get('Cache-Control'))
    .eql('no-cache, no-store, max-age=0, must-revalidate')
})

test('should block special pages', async t => {
  const urls = ['/_document', '/_app']
  for (const url of urls) {
    const html = await renderViaHTTP(t.fixtureCtx.appPort, url)
    await t.expect(html).match(/404/)
  }
})

test('should work with pages/api/index.js', async t => {
  const url = `http://localhost:${t.fixtureCtx.appPort}/api`
  const res = await fetch(url)
  const body = await res.text()
  await t.expect(body).eql('API index works')
})

test('should work with pages/api/hello.js', async t => {
  const url = `http://localhost:${t.fixtureCtx.appPort}/api/hello`
  const res = await fetch(url)
  const body = await res.text()
  await t.expect(body).eql('API hello works')
})

test('should work with dynamic params and search string', async t => {
  const url = `http://localhost:${t.fixtureCtx.appPort}/api/post-1?val=1`
  const res = await fetch(url)
  const body = await res.json()

  await t.expect(body).eql({ val: '1', post: 'post-1' })
})

test('should navigate via client side', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/')
  await browser.elementByCss('a').click()

  await browser.waitForElementByCss('.about-page')

  const text = await browser.elementByCss('div').text()

  await t.expect(text).eql('About Page')
  await browser.close()
})

test('should navigate to nested index via client side', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/another')
  await browser.elementByCss('a').click()

  await browser.waitForElementByCss('.index-page')

  const text = await browser.elementByCss('p').text()

  await t.expect(text).eql('Hello World')
  await browser.close()
})

test('should navigate to external site and back', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/external-and-back')
  const initialText = await browser.elementByCss('p').text()
  await t.expect(initialText).eql('server')

  await browser.elementByCss('a').click()

  await browser.waitForElementByCss('input')
  await browser.back()
  await browser.waitForElementByCss('p')

  await waitFor(1000)
  const newText = await browser.elementByCss('p').text()
  await t.expect(newText).eql('server')
})

test('should change query correctly', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/query?id=0')
  let id = await browser.elementByCss('#q0').text()
  await t.expect(id).eql('0')

  await browser.elementByCss('#first').click()

  await browser.waitForElementByCss('#q1')

  id = await browser.elementByCss('#q1').text()
  await t.expect(id).eql('1')

  await browser.elementByCss('#second').click()

  await browser.waitForElementByCss('#q2')

  id = await browser.elementByCss('#q2').text()
  await t.expect(id).eql('2')
})

test('should render a server side error on the client side', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/error-in-ssr-render')
  await waitFor(2000)
  const text = await browser.elementByCss('body').text()
  // this makes sure we don't leak the actual error to the client side in production
  await t.expect(text).match(/Internal Server Error\./)
  const headingText = await browser.elementByCss('h1').text()
  // This makes sure we render statusCode on the client side correctly
  await t.expect(headingText).eql('500')
  await browser.close()
})

test('should render a client side component error', async t => {
  const browser = await webdriver(
    t.fixtureCtx.appPort,
    '/error-in-browser-render'
  )
  await waitFor(2000)
  const text = await browser.elementByCss('body').text()
  await t.expect(text).match(/An unexpected error has occurred\./)
  await browser.close()
})

test('should call getInitialProps on _error page during a client side component error', async t => {
  const browser = await webdriver(
    t.fixtureCtx.appPort,
    '/error-in-browser-render-status-code'
  )
  await waitFor(2000)
  const text = await browser.elementByCss('body').text()
  await t.expect(text).match(/This page could not be found\./)
  await browser.close()
})

test('should handle already finished responses', async t => {
  const res = {
    finished: false,
    end () {
      this.finished = true
    }
  }
  const html = await t.fixtureCtx.app.renderToHTML(
    { method: 'GET' },
    res,
    '/finish-response',
    {}
  )
  await t.expect(html).notOk()
})

test('should allow to access /static/ and /_next/', async t => {
  // This is a test case which prevent the following issue happening again.
  // See: https://github.com/zeit/next.js/issues/2617
  await renderViaHTTP(t.fixtureCtx.appPort, '/_next/')
  await renderViaHTTP(t.fixtureCtx.appPort, '/static/')
  const data = await renderViaHTTP(
    t.fixtureCtx.appPort,
    '/static/data/item.txt'
  )
  await t.expect(data).eql('item')
})

test('Should allow access to public files', async t => {
  const data = await renderViaHTTP(t.fixtureCtx.appPort, '/data/data.txt')
  const file = await renderViaHTTP(t.fixtureCtx.appPort, '/file')
  const legacy = await renderViaHTTP(t.fixtureCtx.appPort, '/static/legacy.txt')
  await t.expect(data).eql('data')
  await t.expect(file).eql('test')
  await t.expect(legacy).match(/new static folder/)
})

test('should reload the page on page script error', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/counter')
  await browser.elementByCss('#increase').click()
  await browser.elementByCss('#increase').click()

  const counter = await browser.elementByCss('#counter').text()
  await t.expect(counter).eql('Counter: 2')

  // When we go to the 404 page, it'll do a hard reload.
  // So, it's possible for the front proxy to load a page from another zone.
  // Since the page is reloaded, when we go back to the counter page again,
  // previous counter value should be gone.
  await browser.elementByCss('#no-such-page').click()

  await browser.waitForElementByCss('h1')
  await browser.back()
  await browser.waitForElementByCss('#counter-page')

  const counterAfter404Page = await browser.elementByCss('#counter').text()
  await t.expect(counterAfter404Page).eql('Counter: 0')

  await browser.close()
})

test('should have default runtime values when not defined', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/runtime-config')
  await t.expect(html).match(/found public config/)
  await t.expect(html).match(/found server config/)
})

test('should not have runtimeConfig in __NEXT_DATA__', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/runtime-config')
  const $ = cheerio.load(html)
  const script = $('#__NEXT_DATA__').html()
  await t.expect(script).notMatch(/runtimeConfig/)
})

test('should add autoExport for auto pre-rendered pages', async t => {
  for (const page of ['/', '/about']) {
    const html = await renderViaHTTP(t.fixtureCtx.appPort, page)
    const $ = cheerio.load(html)
    const data = JSON.parse($('#__NEXT_DATA__').html())
    await t.expect(data.autoExport).eql(true)
  }
})

test('should not add autoExport for non pre-rendered pages', async t => {
  for (const page of ['/query']) {
    const html = await renderViaHTTP(t.fixtureCtx.appPort, page)
    const $ = cheerio.load(html)
    const data = JSON.parse($('#__NEXT_DATA__').html())
    await t.expect(!!data.autoExport).eql(false)
  }
})

test('should add preload tags when Link prefetch prop is used', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/prefetch')
  await waitFor(2000)
  const elements = await browser.elementsByCss('link[rel=preload]')

  await t.expect(elements.length).eql(9)
  await Promise.all(
    elements.map(async element => {
      const rel = await element.getAttribute('rel')
      const as = await element.getAttribute('as')
      await t.expect(rel).eql('preload')
      await t.expect(as).eql('script')
    })
  )
  await browser.close()
})

// This is a workaround to fix https://github.com/zeit/next.js/issues/5860
// TODO: remove this workaround when https://bugs.webkit.org/show_bug.cgi?id=187726 is fixed.
test('It does not add a timestamp to link tags with preload attribute', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/prefetch')
  const links = await browser.elementsByCss('link[rel=preload]')
  await Promise.all(
    links.map(async element => {
      const href = await element.getAttribute('href')
      await t.expect(href).notMatch(/\?ts=/)
    })
  )
  const scripts = await browser.elementsByCss('script[src]')
  await Promise.all(
    scripts.map(async element => {
      const src = await element.getAttribute('src')
      await t.expect(src).notMatch(/\?ts=/)
    })
  )
  await browser.close()
})

test('should reload the page on page script error with prefetch', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/counter')
  if (global.browserName !== 'chrome') return
  await browser.elementByCss('#increase').click()

  await browser.elementByCss('#increase').click()

  const counter = await browser.elementByCss('#counter').text()
  await t.expect(counter).eql('Counter: 2')

  // Let the browser to prefetch the page and error it on the console.
  await waitFor(3000)
  const browserLogs = await browser.log('browser')
  let foundLog = false
  browserLogs.forEach(log => {
    if (log.match(/\/no-such-page\.js - Failed to load resource/)) {
      foundLog = true
    }
  })
  await t.expect(foundLog).eql(true)

  // When we go to the 404 page, it'll do a hard reload.
  // So, it's possible for the front proxy to load a page from another zone.
  // Since the page is reloaded, when we go back to the counter page again,
  // previous counter value should be gone.
  await browser.elementByCss('#no-such-page-prefetch').click()

  await browser.waitForElementByCss('h1')
  await browser.back()
  await browser.waitForElementByCss('#counter-page')

  const counterAfter404Page = await browser.elementByCss('#counter').text()
  await t.expect(counterAfter404Page).eql('Counter: 0')

  await browser.close()
})

test('should not expose the compiled page file in development', async t => {
  const url = `http://localhost:${t.fixtureCtx.appPort}`
  await fetch(`${url}/stateless`) // make sure the stateless page is built
  const clientSideJsRes = await fetch(
    `${url}/_next/development/static/development/pages/stateless.js`
  )
  await t.expect(clientSideJsRes.status).eql(404)
  const clientSideJsBody = await clientSideJsRes.text()
  await t.expect(clientSideJsBody).match(/404/)

  const serverSideJsRes = await fetch(
    `${url}/_next/development/server/static/development/pages/stateless.js`
  )
  await t.expect(serverSideJsRes.status).eql(404)
  const serverSideJsBody = await serverSideJsRes.text()
  await t.expect(serverSideJsBody).match(/404/)
})

test('should not put backslashes in pages-manifest.json', async t => {
  // Whatever platform you build on, pages-manifest.json should use forward slash (/)
  // See: https://github.com/zeit/next.js/issues/4920
  const pagesManifest = require(join('..', '.next', 'server', PAGES_MANIFEST))

  for (let key of Object.keys(pagesManifest)) {
    await t.expect(key).notMatch(/\\/)
    await t.expect(pagesManifest[key]).notMatch(/\\/)
  }
})

test('should handle failed param decoding', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/%DE~%C7%1fY/')
  await t.expect(html).match(/400/)
  await t.expect(html).match(/Bad Request/)
})

test('should replace static pages with HTML files', async t => {
  const staticFiles = ['about', 'another', 'counter', 'dynamic', 'prefetch']
  for (const file of staticFiles) {
    await t
      .expect(existsSync(join(t.fixtureCtx.serverDir, file + '.html')))
      .eql(true)
    await t
      .expect(existsSync(join(t.fixtureCtx.serverDir, file + '.js')))
      .eql(false)
  }
})

test('should not replace non-static pages with HTML files', async t => {
  const nonStaticFiles = ['api', 'external-and-back', 'finish-response']
  for (const file of nonStaticFiles) {
    await t
      .expect(existsSync(join(t.fixtureCtx.serverDir, file + '.js')))
      .eql(true)
    await t
      .expect(existsSync(join(t.fixtureCtx.serverDir, file + '.html')))
      .eql(false)
  }
})

test('should handle AMP correctly in IE', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/some-amp')
  await waitFor(1000)
  const text = await browser.elementByCss('p').text()
  await t.expect(text).eql('Not AMP')
})

test('should warn when prefetch is true', async t => {
  if (global.browserName !== 'chrome') return
  let browser
  try {
    browser = await webdriver(t.fixtureCtx.appPort, '/development-logs')
    const browserLogs = await browser.log('browser')
    let found = false
    browserLogs.forEach(log => {
      if (log.includes('Next.js auto-prefetches automatically')) {
        found = true
      }
    })
    await t.expect(found).eql(false)
  } finally {
    if (browser) {
      await browser.close()
    }
  }
})

test('should not emit profiling events', async t => {
  await t
    .expect(existsSync(join(appDir, '.next', 'profile-events.json')))
    .eql(false)
})

test('should contain the Next.js version in window export', async t => {
  let browser
  try {
    browser = await webdriver(t.fixtureCtx.appPort, '/about')
    await waitFor(500)
    const version = await browser.eval('window.next.version')
    await t.expect(version).ok()
    await t.expect(version).eql(require('next/package.json').version)
  } finally {
    if (browser) {
      await browser.close()
    }
  }
})

test('should clear all core performance marks', async t => {
  let browser
  try {
    browser = await webdriver(t.fixtureCtx.appPort, '/about')
    const currentPerfMarks = await browser.eval(
      `window.performance.getEntriesByType('mark')`
    )
    const allPerfMarks = [
      'beforeRender',
      'afterHydrate',
      'afterRender',
      'routeChange'
    ]

    await Promise.all(
      allPerfMarks.map(async name => {
        await t.expect(currentPerfMarks).notContains({ name })
      })
    )
  } finally {
    if (browser) {
      await browser.close()
    }
  }
})

test('should not clear custom performance marks', async t => {
  let browser
  try {
    browser = await webdriver(t.fixtureCtx.appPort, '/mark-in-head')

    const customMarkFound = await browser.eval(
      `window.performance.getEntriesByType('mark').filter(function(e) {
        return e.name === 'custom-mark'
      }).length === 1`
    )
    await t.expect(customMarkFound).eql(true)
  } finally {
    if (browser) {
      await browser.close()
    }
  }
})

test('should have async on all script tags', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/')
  const $ = cheerio.load(html)
  let missing = false

  for (const script of $('script').toArray()) {
    // application/json doesn't need defer
    if (script.attribs.type === 'application/json') {
      continue
    }

    if (script.attribs.async !== '') {
      missing = true
    }
  }
  await t.expect(missing).eql(false)
})

dynamicImportTests((p, q) => renderViaHTTP(t.fixtureCtx.appPort, p, q))
processEnv()
