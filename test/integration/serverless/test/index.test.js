/* eslint-env jest */
/* global jasmine */
import webdriver from 'next-webdriver'
import { join } from 'path'
import cheerio from 'cheerio'
import { existsSync, readdirSync, readFileSync } from 'fs'
import {
  killApp,
  waitFor,
  findPort,
  nextBuild,
  nextStart,
  fetchViaHTTP,
  renderViaHTTP,
} from 'next-test-utils'
import qs from 'querystring'
import path from 'path'
import fetch from 'node-fetch'

const appDir = join(__dirname, '../')
const serverlessDir = join(appDir, '.next/serverless/pages')
const chunksDir = join(appDir, '.next/static/chunks')
const buildIdFile = join(appDir, '.next/BUILD_ID')
let stderr = ''
let appPort
let app
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

describe('Serverless', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort, {
      onStderr: msg => {
        stderr += msg || ''
      },
    })
  })
  afterAll(() => killApp(app))

  it('should render the page', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/Hello World/)
  })

  it('should add autoExport for auto pre-rendered pages', async () => {
    for (const page of ['/', '/abc']) {
      const html = await renderViaHTTP(appPort, page)
      const $ = cheerio.load(html)
      const data = JSON.parse($('#__NEXT_DATA__').html())
      expect(data.autoExport).toBe(true)
    }
  })

  it('should not add autoExport for non pre-rendered pages', async () => {
    for (const page of ['/fetch']) {
      const html = await renderViaHTTP(appPort, page)
      const $ = cheerio.load(html)
      const data = JSON.parse($('#__NEXT_DATA__').html())
      expect(!!data.autoExport).toBe(false)
    }
  })

  it('should serve file from public folder', async () => {
    const content = await renderViaHTTP(appPort, '/hello.txt')
    expect(content.trim()).toBe('hello world')

    const legacy = await renderViaHTTP(appPort, '/static/legacy.txt')
    expect(legacy).toMatch(`new static folder`)
  })

  it('should not infinity loop on a 404 static file', async () => {
    expect.assertions(2)

    // ensure top-level static does not exist (important for test)
    // we expect /public/static, though.
    expect(existsSync(path.join(appDir, 'static'))).toBe(false)

    const res = await fetchViaHTTP(appPort, '/static/404')
    expect(res.status).toBe(404)
  })

  it('should render the page with dynamic import', async () => {
    const html = await renderViaHTTP(appPort, '/dynamic')
    expect(html).toMatch(/Hello!/)
  })

  it('should render the page with same dynamic import', async () => {
    const html = await renderViaHTTP(appPort, '/dynamic-two')
    expect(html).toMatch(/Hello!/)
  })

  it('should render 404', async () => {
    const html = await renderViaHTTP(appPort, '/404')
    expect(html).toMatch(/This page could not be found/)
  })

  it('should render 404 for /_next/static', async () => {
    const html = await renderViaHTTP(appPort, '/_next/static')
    expect(html).toMatch(/This page could not be found/)
  })

  it('should render an AMP page', async () => {
    const html = await renderViaHTTP(appPort, '/some-amp?amp=1')
    expect(html).toMatch(/Hi Im an AMP page/)
    expect(html).toMatch(/ampproject\.org/)
  })

  it('should have correct amphtml rel link', async () => {
    const html = await renderViaHTTP(appPort, '/some-amp')
    expect(html).toMatch(/Hi Im an AMP page/)
    expect(html).toMatch(/rel="amphtml" href="\/some-amp\?amp=1"/)
  })

  it('should have correct canonical link', async () => {
    const html = await renderViaHTTP(appPort, '/some-amp?amp=1')
    expect(html).toMatch(/rel="canonical" href="\/some-amp"/)
  })

  it('should render correctly when importing isomorphic-unfetch', async () => {
    const url = `http://localhost:${appPort}/fetch`
    const res = await fetch(url)
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text.includes('failed')).toBe(false)
  })

  it('should render correctly when importing isomorphic-unfetch on the client side', async () => {
    const browser = await webdriver(appPort, '/')
    try {
      const text = await browser
        .elementByCss('#fetchlink')
        .click()
        .waitForElementByCss('.fetch-page')
        .elementByCss('#text')
        .text()

      expect(text).toMatch(/fetch page/)
    } finally {
      await browser.close()
    }
  })

  it('should render correctly when importing isomorphic-unfetch CJS', async () => {
    const url = `http://localhost:${appPort}/fetch-cjs`
    const res = await fetch(url)
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text.includes('failed')).toBe(false)
  })

  it('should render correctly when importing isomorphic-unfetch CJS on the client side', async () => {
    const browser = await webdriver(appPort, '/')
    try {
      const text = await browser
        .elementByCss('#fetchcjslink')
        .click()
        .waitForElementByCss('.fetch-cjs-page')
        .elementByCss('#text')
        .text()

      expect(text).toMatch(/fetch page/)
    } finally {
      await browser.close()
    }
  })

  it('should not have combined client-side chunks', () => {
    expect(readdirSync(chunksDir).length).toBeGreaterThanOrEqual(2)
    const buildId = readFileSync(buildIdFile, 'utf8').trim()

    const pageContent = join(
      appDir,
      '.next/static',
      buildId,
      'pages/dynamic.js'
    )
    expect(readFileSync(pageContent, 'utf8')).not.toContain('Hello!')
  })

  it('should not output _app.js and _document.js to serverless build', () => {
    expect(existsSync(join(serverlessDir, '_app.js'))).toBeFalsy()
    expect(existsSync(join(serverlessDir, '_document.js'))).toBeFalsy()
  })

  it('should replace static pages with HTML files', async () => {
    const staticFiles = ['abc', 'dynamic', 'dynamic-two', 'some-amp']
    for (const file of staticFiles) {
      expect(existsSync(join(serverlessDir, file + '.html'))).toBe(true)
      expect(existsSync(join(serverlessDir, file + '.js'))).toBe(false)
    }
  })

  it('should not replace non-static pages with HTML files', async () => {
    const nonStaticFiles = ['fetch', '_error']
    for (const file of nonStaticFiles) {
      expect(existsSync(join(serverlessDir, file + '.js'))).toBe(true)
      expect(existsSync(join(serverlessDir, file + '.html'))).toBe(false)
    }
  })

  it('should reply on API request successfully', async () => {
    const content = await renderViaHTTP(appPort, '/api/hello')
    expect(content).toMatch(/hello world/)
  })

  it('should reply on dynamic API request successfully', async () => {
    const result = await renderViaHTTP(appPort, '/api/posts/post-1')
    const { id } = JSON.parse(result)
    expect(id).toBe('post-1')
  })

  it('should reply on dynamic API request successfully with query parameters', async () => {
    const result = await renderViaHTTP(appPort, '/api/posts/post-1?param=val')
    const { id, param } = JSON.parse(result)
    expect(id).toBe('post-1')
    expect(param).toBe('val')
  })

  it('should reply on dynamic API index request successfully', async () => {
    const result = await renderViaHTTP(appPort, '/api/dynamic/post-1')
    const { path } = JSON.parse(result)
    expect(path).toBe('post-1')
  })

  it('should reply on dynamic API index request successfully with query parameters', async () => {
    const result = await renderViaHTTP(appPort, '/api/dynamic/post-1?param=val')
    const { path, param } = JSON.parse(result)
    expect(path).toBe('post-1')
    expect(param).toBe('val')
  })

  it('should 404 on API request with trailing slash', async () => {
    const res = await fetchViaHTTP(appPort, '/api/hello/')
    expect(res.status).toBe(404)
  })

  it('should have the correct query string for a dynamic route', async () => {
    const paramRaw = 'test % 123'
    const param = encodeURIComponent(paramRaw)

    const html = await renderViaHTTP(appPort, `/dr/${param}`)
    const $ = cheerio.load(html)
    const data = JSON.parse($('#__NEXT_DATA__').html())

    expect(data.query).toEqual({ slug: paramRaw })
  })

  it('should have the correct query string for a spr route', async () => {
    const paramRaw = 'test % 123'
    const html = await fetchViaHTTP(appPort, `/dr/[slug]`, '', {
      headers: { 'x-now-route-matches': qs.stringify({ 1: paramRaw }) },
    }).then(res => res.text())
    const $ = cheerio.load(html)
    const data = JSON.parse($('#__NEXT_DATA__').html())

    expect(data.query).toEqual({ slug: paramRaw })
  })

  it('should log error in API route correctly', async () => {
    await renderViaHTTP(appPort, '/api/top-level-error')
    await waitFor(1000)
    expect(stderr).toContain('top-level-oops')
  })

  describe('With basic usage', () => {
    it('should allow etag header support', async () => {
      const url = `http://localhost:${appPort}/`
      const etag = (await fetch(url)).headers.get('ETag')

      const headers = { 'If-None-Match': etag }
      const res2 = await fetch(url, { headers })
      expect(res2.status).toBe(304)
    })

    it('should set Content-Length header', async () => {
      const url = `http://localhost:${appPort}`
      const res = await fetch(url)
      expect(res.headers.get('Content-Length')).toBeDefined()
    })
  })
})
