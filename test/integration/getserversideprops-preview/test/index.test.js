/* eslint-env jest */

import cheerio from 'cheerio'
import cookie from 'cookie'
import fs from 'fs-extra'
import {
  fetchViaHTTP,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'
import qs from 'querystring'

const appDir = join(__dirname, '..')

async function getBuildId() {
  return fs.readFile(join(appDir, '.next', 'BUILD_ID'), 'utf8')
}

function getData(html) {
  const $ = cheerio.load(html)
  const nextData = $('#__NEXT_DATA__')
  const preEl = $('#props-pre')
  const routerData = JSON.parse($('#router').text())
  return {
    nextData: JSON.parse(nextData.html()),
    pre: preEl.text(),
    routerData,
  }
}

function runTests(startServer = nextStart) {
  it('should compile successfully', async () => {
    await fs.remove(join(appDir, '.next'))
    const { code, stdout } = await nextBuild(appDir, [], {
      stdout: true,
    })
    expect(code).toBe(0)
    expect(stdout).toMatch(/Compiled successfully/)
  })

  let appPort, app
  it('should start production application', async () => {
    appPort = await findPort()
    app = await startServer(appDir, appPort)
  })

  it('should return page on first request', async () => {
    const html = await renderViaHTTP(appPort, '/')
    const { nextData, pre, routerData } = getData(html)
    expect(nextData).toMatchObject({ isFallback: false })
    expect(nextData.isPreview).toBeUndefined()
    expect(pre).toBe('false and null')
    expect(routerData.isPreview).toBe(false)
  })

  it('should return page on second request', async () => {
    const html = await renderViaHTTP(appPort, '/')
    const { nextData, pre, routerData } = getData(html)
    expect(nextData).toMatchObject({ isFallback: false })
    expect(nextData.isPreview).toBeUndefined()
    expect(pre).toBe('false and null')
    expect(routerData.isPreview).toBe(false)
  })

  let previewCookieString
  it('should enable preview mode', async () => {
    const res = await fetchViaHTTP(appPort, '/api/preview', { lets: 'goooo' })
    expect(res.status).toBe(200)

    const originalCookies = res.headers.get('set-cookie').split(',')
    const cookies = originalCookies.map(cookie.parse)

    expect(originalCookies.every((c) => c.includes('; Secure;'))).toBe(true)

    expect(cookies.length).toBe(2)
    expect(cookies[0]).toMatchObject({ Path: '/', SameSite: 'None' })
    expect(cookies[0]).toHaveProperty('__prerender_bypass')
    expect(cookies[0]).not.toHaveProperty('Max-Age')
    expect(cookies[1]).toMatchObject({ Path: '/', SameSite: 'None' })
    expect(cookies[1]).toHaveProperty('__next_preview_data')
    expect(cookies[1]).not.toHaveProperty('Max-Age')

    previewCookieString =
      cookie.serialize('__prerender_bypass', cookies[0].__prerender_bypass) +
      '; ' +
      cookie.serialize('__next_preview_data', cookies[1].__next_preview_data)
  })

  it('should not return fallback page on preview request', async () => {
    const res = await fetchViaHTTP(
      appPort,
      '/',
      {},
      { headers: { Cookie: previewCookieString } }
    )
    const html = await res.text()

    const { nextData, pre, routerData } = getData(html)
    expect(res.headers.get('cache-control')).toBe(
      'private, no-cache, no-store, max-age=0, must-revalidate'
    )
    expect(nextData).toMatchObject({ isFallback: false, isPreview: true })
    expect(pre).toBe('true and {"lets":"goooo"}')
    expect(routerData.isPreview).toBe(true)
  })

  it('should return correct caching headers for data preview request', async () => {
    const res = await fetchViaHTTP(
      appPort,
      `/_next/data/${encodeURI(await getBuildId())}/index.json`,
      {},
      { headers: { Cookie: previewCookieString } }
    )
    const json = await res.json()

    expect(res.headers.get('cache-control')).toBe(
      'private, no-cache, no-store, max-age=0, must-revalidate'
    )
    expect(json).toMatchObject({
      pageProps: {
        preview: true,
        previewData: { lets: 'goooo' },
      },
    })
  })

  it('should return cookies to be expired on reset request', async () => {
    const res = await fetchViaHTTP(
      appPort,
      '/api/reset',
      {},
      { headers: { Cookie: previewCookieString } }
    )
    expect(res.status).toBe(200)

    const cookies = res.headers
      .get('set-cookie')
      .replace(/(=(?!Lax)\w{3}),/g, '$1')
      .split(',')
      .map(cookie.parse)

    expect(cookies.length).toBe(2)
    expect(cookies[0]).toMatchObject({
      Path: '/',
      SameSite: 'None',
      Expires: 'Thu 01 Jan 1970 00:00:00 GMT',
    })
    expect(cookies[0]).toHaveProperty('__prerender_bypass')
    expect(cookies[0]).not.toHaveProperty('Max-Age')
    expect(cookies[1]).toMatchObject({
      Path: '/',
      SameSite: 'None',
      Expires: 'Thu 01 Jan 1970 00:00:00 GMT',
    })
    expect(cookies[1]).toHaveProperty('__next_preview_data')
    expect(cookies[1]).not.toHaveProperty('Max-Age')
  })

  it('should throw error when setting too large of preview data', async () => {
    const res = await fetchViaHTTP(appPort, '/api/preview?tooBig=true')
    expect(res.status).toBe(500)
    expect(await res.text()).toBe('too big')
  })

  afterAll(async () => {
    await killApp(app)
  })
}

describe('ServerSide Props Preview Mode', () => {
  describe('Development Mode', () => {
    let appPort, app
    it('should start development application', async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })

    let previewCookieString
    it('should enable preview mode', async () => {
      const res = await fetchViaHTTP(appPort, '/api/preview', { lets: 'goooo' })
      expect(res.status).toBe(200)

      const cookies = res.headers.get('set-cookie').split(',').map(cookie.parse)

      expect(cookies.length).toBe(2)
      previewCookieString =
        cookie.serialize('__prerender_bypass', cookies[0].__prerender_bypass) +
        '; ' +
        cookie.serialize('__next_preview_data', cookies[1].__next_preview_data)
    })

    it('should return cookies to be expired after dev server reboot', async () => {
      await killApp(app)
      appPort = await findPort()
      app = await launchApp(appDir, appPort)

      const res = await fetchViaHTTP(
        appPort,
        '/',
        {},
        { headers: { Cookie: previewCookieString } }
      )
      expect(res.status).toBe(200)

      const body = await res.text()
      // "err":{"name":"TypeError","message":"Cannot read property 'previewModeId' of undefined"
      expect(body).not.toContain('"err"')
      expect(body).not.toContain('TypeError')
      expect(body).not.toContain('previewModeId')

      const cookies = res.headers
        .get('set-cookie')
        .replace(/(=(?!Lax)\w{3}),/g, '$1')
        .split(',')
        .map(cookie.parse)

      expect(cookies.length).toBe(2)
    })

    /** @type {import('next-webdriver').Chain} */
    let browser
    it('should start the client-side browser', async () => {
      browser = await webdriver(
        appPort,
        '/api/preview?' + qs.stringify({ client: 'mode' })
      )
    })

    it('should fetch preview data on SSR', async () => {
      await browser.get(`http://localhost:${appPort}/`)
      await browser.waitForElementByCss('#props-pre')
      // expect(await browser.elementById('props-pre').text()).toBe('Has No Props')
      // await new Promise(resolve => setTimeout(resolve, 2000))
      expect(await browser.elementById('props-pre').text()).toBe(
        'true and {"client":"mode"}'
      )
    })

    it('should fetch preview data on CST', async () => {
      await browser.get(`http://localhost:${appPort}/to-index`)
      await browser.waitForElementByCss('#to-index')
      await browser.eval('window.itdidnotrefresh = "hello"')
      await browser.elementById('to-index').click()
      await browser.waitForElementByCss('#props-pre')
      expect(await browser.eval('window.itdidnotrefresh')).toBe('hello')
      expect(await browser.elementById('props-pre').text()).toBe(
        'true and {"client":"mode"}'
      )
    })

    it('should fetch prerendered data', async () => {
      await browser.get(`http://localhost:${appPort}/api/reset`)

      await browser.get(`http://localhost:${appPort}/`)
      await browser.waitForElementByCss('#props-pre')
      expect(await browser.elementById('props-pre').text()).toBe(
        'false and null'
      )
    })

    afterAll(async () => {
      await browser.close()
      await killApp(app)
    })
  })
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    runTests()
  })
})
