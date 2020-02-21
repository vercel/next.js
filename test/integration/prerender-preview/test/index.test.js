/* eslint-env jest */
/* global jasmine */
import cheerio from 'cheerio'
import cookie from 'cookie'
import fs from 'fs-extra'
import {
  fetchViaHTTP,
  findPort,
  killApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import os from 'os'
import { join } from 'path'
import qs from 'querystring'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2
const appDir = join(__dirname, '..')
const nextConfigPath = join(appDir, 'next.config.js')

function getData(html) {
  const $ = cheerio.load(html)
  const nextData = $('#__NEXT_DATA__')
  const preEl = $('#props-pre')
  return { nextData: JSON.parse(nextData.html()), pre: preEl.text() }
}

function runTests() {
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
    app = await nextStart(appDir, appPort)
  })

  it('should return prerendered page on first request', async () => {
    const html = await renderViaHTTP(appPort, '/')
    const { nextData, pre } = getData(html)
    expect(nextData).toMatchObject({ isFallback: false })
    expect(pre).toBe('undefined and undefined')
  })

  it('should return prerendered page on second request', async () => {
    const html = await renderViaHTTP(appPort, '/')
    const { nextData, pre } = getData(html)
    expect(nextData).toMatchObject({ isFallback: false })
    expect(pre).toBe('undefined and undefined')
  })

  let previewCookieString
  it('should enable preview mode', async () => {
    const res = await fetchViaHTTP(appPort, '/api/preview', { lets: 'goooo' })
    expect(res.status).toBe(200)

    const cookies = res.headers
      .get('set-cookie')
      .split(',')
      .map(cookie.parse)

    expect(cookies.length).toBe(2)
    expect(cookies[0]).toMatchObject({ Path: '/', SameSite: 'Strict' })
    expect(cookies[0]).toHaveProperty('__prerender_bypass')
    expect(cookies[0]).not.toHaveProperty('Max-Age')
    expect(cookies[1]).toMatchObject({ Path: '/', SameSite: 'Strict' })
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

    const { nextData, pre } = getData(html)
    expect(nextData).toMatchObject({ isFallback: false })
    expect(pre).toBe('true and {"lets":"goooo"}')
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
      .replace(/(=\w{3}),/g, '$1')
      .split(',')
      .map(cookie.parse)

    expect(cookies.length).toBe(2)
    expect(cookies[0]).toMatchObject({
      Path: '/',
      SameSite: 'Strict',
      Expires: 'Thu 01 Jan 1970 00:00:00 GMT',
    })
    expect(cookies[0]).toHaveProperty('__prerender_bypass')
    expect(cookies[0]).not.toHaveProperty('Max-Age')
    expect(cookies[1]).toMatchObject({
      Path: '/',
      SameSite: 'Strict',
      Expires: 'Thu 01 Jan 1970 00:00:00 GMT',
    })
    expect(cookies[1]).toHaveProperty('__next_preview_data')
    expect(cookies[1]).not.toHaveProperty('Max-Age')
  })

  /** @type import('next-webdriver').Chain */
  let browser
  it('should start the client-side browser', async () => {
    browser = await webdriver(
      appPort,
      '/api/preview?' + qs.stringify({ client: 'mode' })
    )
  })

  it('should fetch preview data', async () => {
    await browser.get(`http://localhost:${appPort}/`)
    await browser.waitForElementByCss('#props-pre')
    // expect(await browser.elementById('props-pre').text()).toBe('Has No Props')
    // await new Promise(resolve => setTimeout(resolve, 2000))
    expect(await browser.elementById('props-pre').text()).toBe(
      'true and {"client":"mode"}'
    )
  })

  it('should fetch prerendered data', async () => {
    await browser.get(`http://localhost:${appPort}/api/reset`)

    await browser.get(`http://localhost:${appPort}/`)
    await browser.waitForElementByCss('#props-pre')
    expect(await browser.elementById('props-pre').text()).toBe(
      'undefined and undefined'
    )
  })

  afterAll(async () => {
    await browser.close()
    await killApp(app)
  })
}

describe('Prerender Preview Mode', () => {
  describe('Server Mode', () => {
    beforeAll(async () => {
      await fs.remove(nextConfigPath)
    })

    runTests()
  })
  describe('Serverless Mode', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfigPath,
        `module.exports = { target: 'experimental-serverless-trace' }` + os.EOL
      )
    })
    afterAll(async () => {
      await fs.remove(nextConfigPath)
    })

    runTests()
  })
})
