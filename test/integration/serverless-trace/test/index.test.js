/* eslint-env jest */

import webdriver from 'next-webdriver'
import { join } from 'path'
import { existsSync, readdirSync } from 'fs'
import {
  killApp,
  findPort,
  nextBuild,
  nextStart,
  renderViaHTTP,
  fetchViaHTTP,
  readNextBuildClientPageFile,
  getPageFileFromPagesManifest,
} from 'next-test-utils'
import fetch from 'node-fetch'

const appDir = join(__dirname, '../')
const serverlessDir = join(appDir, '.next/serverless/pages')
const chunksDir = join(appDir, '.next/static/chunks')
let appPort
let app
jest.setTimeout(1000 * 60 * 5)

describe('Serverless Trace', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })
  afterAll(() => killApp(app))

  it('should render the page', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/Hello World/)
  })

  it('should serve file from public folder', async () => {
    const content = await renderViaHTTP(appPort, '/hello.txt')
    expect(content.trim()).toBe('hello world')
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
    expect(html).toMatch(/rel="amphtml" href="\/some-amp\.amp"/)
  })

  it('should have correct canonical link', async () => {
    const html = await renderViaHTTP(appPort, '/some-amp?amp=1')
    expect(html).toMatch(/rel="canonical" href="\/some-amp"/)
  })

  it('should have correct canonical link (auto-export link)', async () => {
    const html = await renderViaHTTP(appPort, '/some-amp.amp')
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
        .elementByCss('a')
        .click()
        .waitForElementByCss('.fetch-page')
        .elementByCss('#text')
        .text()

      expect(text).toMatch(/fetch page/)
    } finally {
      await browser.close()
    }
  })

  it('should not have combined client-side chunks', () => {
    expect(readdirSync(chunksDir).length).toBeGreaterThanOrEqual(2)
    const contents = readNextBuildClientPageFile(appDir, '/dynamic')
    expect(contents).not.toContain('Hello!')
  })

  it('should not output _app.js and _document.js to serverless build', () => {
    expect(existsSync(join(serverlessDir, '_app.js'))).toBeFalsy()
    expect(existsSync(join(serverlessDir, '_document.js'))).toBeFalsy()
  })

  it('should replace static pages with HTML files', async () => {
    const pages = ['/abc', '/dynamic', '/dynamic-two', '/some-amp']
    for (const page of pages) {
      const file = getPageFileFromPagesManifest(appDir, page)

      expect(file.endsWith('.html')).toBe(true)
    }
  })

  it('should not replace non-static pages with HTML files', async () => {
    const pages = ['/fetch', '/_error']

    for (const page of pages) {
      const file = getPageFileFromPagesManifest(appDir, page)

      expect(file.endsWith('.js')).toBe(true)
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

  it('should reply with redirect on API request with trailing slash', async () => {
    const res = await fetchViaHTTP(
      appPort,
      '/api/hello/',
      {},
      { redirect: 'manual' }
    )
    expect(res.status).toBe(308)
    expect(res.headers.get('location')).toBe(
      `http://localhost:${appPort}/api/hello`
    )
  })

  it('should reply on API request with trailing slassh successfully', async () => {
    const content = await renderViaHTTP(appPort, '/api/hello/')
    expect(content).toMatch(/hello world/)
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
