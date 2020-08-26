/* eslint-env jest */

import cheerio from 'cheerio'
import cookie from 'cookie'
import fs from 'fs-extra'
import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  fetchViaHTTP,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  File,
  renderViaHTTP,
  check,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '..')
const nextConfig = new File(join(appDir, 'next.config.js'))

let app
let appPort
let previewCookie

const getCacheFile = (path = '', serverless) => {
  return join(
    appDir,
    '.next',
    serverless ? 'serverless' : 'server',
    'pages',
    path
  )
}

function runTests(isDev, serverless) {
  it('should get preview cookie correctly', async () => {
    const res = await fetchViaHTTP(appPort, '/api/enable')
    previewCookie = ''

    expect(res.headers.get('set-cookie')).toMatch(
      /(__prerender_bypass|__next_preview_data)/
    )

    res.headers
      .get('set-cookie')
      .split(',')
      .forEach((c) => {
        c = cookie.parse(c)
        const isBypass = c.__prerender_bypass

        if (isBypass || c.__next_preview_data) {
          if (previewCookie) previewCookie += '; '

          previewCookie += `${
            isBypass ? '__prerender_bypass' : '__next_preview_data'
          }=${c[isBypass ? '__prerender_bypass' : '__next_preview_data']}`
        }
      })
  })

  it('should not write preview index SSG page to cache', async () => {
    const html = await renderViaHTTP(appPort, '/')
    const props = JSON.parse(cheerio.load(html)('#props').text())

    expect(props).toEqual({
      preview: false,
      previewData: null,
    })

    const res = await fetchViaHTTP(appPort, '/', undefined, {
      headers: {
        cookie: previewCookie,
      },
    })

    const previewHtml = await res.text()
    const previewProps = JSON.parse(cheerio.load(previewHtml)('#props').text())
    expect(previewProps).toEqual({
      preview: true,
      previewData: {},
    })

    if (!isDev) {
      const fsHtml = await fs.readFile(getCacheFile('index.html', serverless))
      const fsProps = JSON.parse(cheerio.load(fsHtml)('#props').text())

      expect(fsProps).toEqual({
        preview: false,
        previewData: null,
      })
    }
    const html2 = await renderViaHTTP(appPort, '/')
    const props2 = JSON.parse(cheerio.load(html2)('#props').text())

    expect(props2).toEqual({
      preview: false,
      previewData: null,
    })
  })

  it('should not write preview dynamic prerendered SSG page to cache no fallback', async () => {
    const html = await renderViaHTTP(appPort, '/no-fallback/first')
    const props = JSON.parse(cheerio.load(html)('#props').text())

    expect(props).toEqual({
      preview: false,
      previewData: null,
      params: { post: 'first' },
    })

    const res = await fetchViaHTTP(appPort, '/no-fallback/first', undefined, {
      headers: {
        cookie: previewCookie,
      },
    })

    const previewHtml = await res.text()
    const previewProps = JSON.parse(cheerio.load(previewHtml)('#props').text())
    expect(previewProps).toEqual({
      preview: true,
      previewData: {},
      params: { post: 'first' },
    })

    if (!isDev) {
      const fsHtml = await fs.readFile(
        getCacheFile('no-fallback/first.html', serverless)
      )
      const fsProps = JSON.parse(cheerio.load(fsHtml)('#props').text())

      expect(fsProps).toEqual({
        preview: false,
        previewData: null,
        params: { post: 'first' },
      })
    }
    const html2 = await renderViaHTTP(appPort, '/no-fallback/first')
    const props2 = JSON.parse(cheerio.load(html2)('#props').text())

    expect(props2).toEqual({
      preview: false,
      previewData: null,
      params: { post: 'first' },
    })
  })

  it('should not write preview dynamic SSG page to cache no fallback', async () => {
    const res1 = await fetchViaHTTP(appPort, '/no-fallback/second')
    expect(res1.status).toBe(404)

    const res = await fetchViaHTTP(appPort, '/no-fallback/second', undefined, {
      headers: {
        cookie: previewCookie,
      },
    })

    const previewHtml = await res.text()
    const previewProps = JSON.parse(cheerio.load(previewHtml)('#props').text())
    expect(previewProps).toEqual({
      preview: true,
      previewData: {},
      params: { post: 'second' },
    })

    if (!isDev) {
      expect(
        await fs.exists(getCacheFile('no-fallback/second.html', serverless))
      ).toBe(false)
    }

    const res2 = await fetchViaHTTP(appPort, '/no-fallback/second')
    expect(res2.status).toBe(404)
  })

  it('should not write preview dynamic prerendered SSG page to cache with fallback', async () => {
    const html = await renderViaHTTP(appPort, '/fallback/first')
    const props = JSON.parse(cheerio.load(html)('#props').text())

    expect(props).toEqual({
      preview: false,
      previewData: null,
      params: { post: 'first' },
    })

    const res = await fetchViaHTTP(appPort, '/fallback/first', undefined, {
      headers: {
        cookie: previewCookie,
      },
    })

    const previewHtml = await res.text()
    const previewProps = JSON.parse(cheerio.load(previewHtml)('#props').text())
    expect(previewProps).toEqual({
      preview: true,
      previewData: {},
      params: { post: 'first' },
    })

    if (!isDev) {
      const fsHtml = await fs.readFile(
        getCacheFile('fallback/first.html', serverless)
      )
      const fsProps = JSON.parse(cheerio.load(fsHtml)('#props').text())

      expect(fsProps).toEqual({
        preview: false,
        previewData: null,
        params: { post: 'first' },
      })
    }
    const html2 = await renderViaHTTP(appPort, '/fallback/first')
    const props2 = JSON.parse(cheerio.load(html2)('#props').text())

    expect(props2).toEqual({
      preview: false,
      previewData: null,
      params: { post: 'first' },
    })
  })

  it('should not write preview dynamic non-prerendered SSG page to cache with fallback', async () => {
    let browser = await webdriver(appPort, '/fallback/second')

    await check(async () => {
      const props = JSON.parse(await browser.elementByCss('#props').text())
      return props.params ? 'pass' : 'fail'
    }, 'pass')

    const props = JSON.parse(await browser.elementByCss('#props').text())

    expect(props).toEqual({
      preview: false,
      previewData: null,
      params: { post: 'second' },
    })

    const res = await fetchViaHTTP(appPort, '/fallback/second', undefined, {
      headers: {
        cookie: previewCookie,
      },
    })

    const previewHtml = await res.text()
    const previewProps = JSON.parse(cheerio.load(previewHtml)('#props').text())
    expect(previewProps).toEqual({
      preview: true,
      previewData: {},
      params: { post: 'second' },
    })

    if (!isDev) {
      const fsHtml = await fs.readFile(
        getCacheFile('fallback/second.html', serverless)
      )
      const fsProps = JSON.parse(cheerio.load(fsHtml)('#props').text())

      expect(fsProps).toEqual({
        preview: false,
        previewData: null,
        params: { post: 'second' },
      })
    }

    browser = await webdriver(appPort, '/fallback/second')

    await check(async () => {
      const props = JSON.parse(await browser.elementByCss('#props').text())
      return props.params ? 'pass' : 'fail'
    }, 'pass')

    const props2 = JSON.parse(await browser.elementByCss('#props').text())

    expect(props2).toEqual({
      preview: false,
      previewData: null,
      params: { post: 'second' },
    })
  })
}

describe('Preview mode with fallback pages', () => {
  describe('dev Mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests(true)
  })

  describe('server mode', () => {
    beforeAll(async () => {
      await fs.remove(join(appDir, '.next'))
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('serverless mode', () => {
    beforeAll(async () => {
      nextConfig.write(`
        module.exports = {
          target: 'experimental-serverless-trace'
        }
      `)
      await fs.remove(join(appDir, '.next'))
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      nextConfig.delete()
      await killApp(app)
    })

    runTests(true, true)
  })
})
