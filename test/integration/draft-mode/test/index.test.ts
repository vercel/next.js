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

const appDir = join(__dirname, '..')

async function getBuildId() {
  return fs.readFile(join(appDir, '.next', 'BUILD_ID'), 'utf8')
}

function getData(html: string) {
  const $ = cheerio.load(html)
  return {
    nextData: JSON.parse($('#__NEXT_DATA__').html()),
    draft: $('#draft').text(),
    rand: $('#rand').text(),
    count: $('#count').text(),
  }
}

describe('Test Draft Mode', () => {
  describe('Development Mode', () => {
    let appPort, app, browser, cookieString
    it('should start development application', async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })

    it('should enable draft mode', async () => {
      const res = await fetchViaHTTP(appPort, '/api/enable')
      expect(res.status).toBe(200)

      const cookies = res.headers
        .get('set-cookie')
        .split(',')
        .map((c) => cookie.parse(c))

      expect(cookies[0]).toBeTruthy()
      expect(cookies[0].__prerender_bypass).toBeTruthy()
      cookieString = cookie.serialize(
        '__prerender_bypass',
        cookies[0].__prerender_bypass
      )
    })

    it('should return cookies to be expired after dev server reboot', async () => {
      await killApp(app)
      appPort = await findPort()
      app = await launchApp(appDir, appPort)

      const res = await fetchViaHTTP(
        appPort,
        '/',
        {},
        { headers: { Cookie: cookieString } }
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
        .map((c) => cookie.parse(c))

      expect(cookies[0]).toBeTruthy()
    })

    it('should start the client-side browser', async () => {
      browser = await webdriver(appPort, '/api/enable')
    })

    it('should fetch draft data on SSR', async () => {
      await browser.get(`http://localhost:${appPort}/`)
      await browser.waitForElementByCss('#draft')
      expect(await browser.elementById('draft').text()).toBe('true')
    })

    it('should fetch draft data on CST', async () => {
      await browser.get(`http://localhost:${appPort}/to-index`)
      await browser.waitForElementByCss('#to-index')
      await browser.eval('window.itdidnotrefresh = "yep"')
      await browser.elementById('to-index').click()
      await browser.waitForElementByCss('#draft')
      expect(await browser.eval('window.itdidnotrefresh')).toBe('yep')
      expect(await browser.elementById('draft').text()).toBe('true')
    })

    it('should disable draft mode', async () => {
      await browser.get(`http://localhost:${appPort}/api/disable`)

      await browser.get(`http://localhost:${appPort}/`)
      await browser.waitForElementByCss('#draft')
      expect(await browser.elementById('draft').text()).toBe('false')
    })

    afterAll(async () => {
      await browser.close()
      await killApp(app)
    })
  })
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    let appPort, app, cookieString, initialRand
    const getOpts = () => ({ headers: { Cookie: cookieString } })

    it('should compile successfully', async () => {
      await fs.remove(join(appDir, '.next'))
      const { code, stdout } = await nextBuild(appDir, [], {
        stdout: true,
      })
      expect(code).toBe(0)
      expect(stdout).toMatch(/Compiled successfully/)
    })

    it('should start production application', async () => {
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })

    it('should return prerendered page on first request', async () => {
      const html = await renderViaHTTP(appPort, '/')
      const { nextData, draft, rand } = getData(html)
      expect(nextData).toMatchObject({ isFallback: false })
      expect(draft).toBe('false')
      initialRand = rand
    })

    it('should return prerendered page on second request', async () => {
      const html = await renderViaHTTP(appPort, '/')
      const { nextData, draft, rand } = getData(html)
      expect(nextData).toMatchObject({ isFallback: false })
      expect(draft).toBe('false')
      expect(rand).toBe(initialRand)
    })

    it('should enable draft mode', async () => {
      const res = await fetchViaHTTP(appPort, '/api/enable')
      expect(res.status).toBe(200)

      const originalCookies = res.headers.get('set-cookie').split(',')
      const cookies = originalCookies.map((c) => cookie.parse(c))

      expect(cookies.length).toBe(1)
      expect(cookies[0]).toBeTruthy()
      expect(cookies[0]).toMatchObject({ Path: '/', SameSite: 'None' })
      expect(cookies[0]).toHaveProperty('__prerender_bypass')
      //expect(cookies[0]).toHaveProperty('Secure')
      expect(cookies[0]).not.toHaveProperty('Max-Age')

      cookieString = cookie.serialize(
        '__prerender_bypass',
        cookies[0].__prerender_bypass
      )
    })

    it('should return dynamic response when draft mode enabled', async () => {
      const html = await renderViaHTTP(appPort, '/', {}, getOpts())
      const { nextData, draft, rand } = getData(html)
      expect(nextData).toMatchObject({ isFallback: false })
      expect(draft).toBe('true')
      expect(rand).not.toBe(initialRand)
    })

    it('should not return fallback page on draft request', async () => {
      const res = await fetchViaHTTP(appPort, '/ssp', {}, getOpts())
      const html = await res.text()

      const { nextData, draft } = getData(html)
      expect(res.headers.get('cache-control')).toBe(
        'private, no-cache, no-store, max-age=0, must-revalidate'
      )
      expect(nextData).toMatchObject({ isFallback: false })
      expect(draft).toBe('true')
    })

    it('should return correct caching headers for draft mode request', async () => {
      const url = `/_next/data/${encodeURI(await getBuildId())}/index.json`
      const res = await fetchViaHTTP(appPort, url, {}, getOpts())
      const json = await res.json()

      expect(res.headers.get('cache-control')).toBe(
        'private, no-cache, no-store, max-age=0, must-revalidate'
      )
      expect(json).toMatchObject({
        pageProps: {
          draftMode: 'true',
        },
      })
    })

    it('should return cookies to be expired on disable request', async () => {
      const res = await fetchViaHTTP(appPort, '/api/disable', {}, getOpts())
      expect(res.status).toBe(200)

      const cookies = res.headers
        .get('set-cookie')
        .replace(/(=(?!Lax)\w{3}),/g, '$1')
        .split(',')
        .map((c) => cookie.parse(c))

      expect(cookies[0]).toBeTruthy()
      expect(cookies[0]).toMatchObject({
        Path: '/',
        SameSite: 'None',
        Expires: 'Thu 01 Jan 1970 00:00:00 GMT',
      })
      expect(cookies[0]).toHaveProperty('__prerender_bypass')
      expect(cookies[0]).not.toHaveProperty('Max-Age')
    })

    it('should pass undefined to API routes when not in draft mode', async () => {
      const res = await fetchViaHTTP(appPort, `/api/read`)
      const json = await res.json()

      expect(json).toMatchObject({})
    })
    it('should pass draft mode to API routes', async () => {
      const res = await fetchViaHTTP(appPort, '/api/read', {}, getOpts())
      const json = await res.json()

      expect(json).toMatchObject({
        draftMode: true,
      })
    })

    afterAll(async () => {
      await killApp(app)
    })
  })
})
