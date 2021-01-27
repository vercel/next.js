/* eslint-env jest */

import url from 'url'
import http from 'http'
import { join } from 'path'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'
import {
  launchApp,
  killApp,
  findPort,
  nextBuild,
  nextStart,
  File,
  fetchViaHTTP,
  check,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '..')
const nextConfig = new File(join(appDir, 'next.config.js'))
let server
let externalPort
let appPort
let app

const runTests = () => {
  it('should respond to default locale redirects correctly', async () => {
    for (const [path, dest] of [
      ['/redirect-1', '/destination-1'],
      ['/en/redirect-1', '/destination-1'],
      ['/fr/redirect-1', '/fr/destination-1'],
      ['/nl-NL/redirect-2', '/destination-2'],
      ['/fr/redirect-2', false],
    ]) {
      const res = await fetchViaHTTP(appPort, path, undefined, {
        redirect: 'manual',
      })

      expect(res.status).toBe(dest ? 307 : 404)

      if (dest) {
        if (dest.startsWith('/')) {
          const parsed = url.parse(res.headers.get('location'))
          expect(parsed.pathname).toBe(dest)
          expect(parsed.query).toBe(null)
        } else {
          expect(res.headers.get('location')).toBe(dest)
        }
      }
    }
  })

  it('should rewrite index routes correctly', async () => {
    for (const path of ['/', '/fr', '/nl-NL']) {
      const res = await fetchViaHTTP(appPort, path, undefined, {
        redirect: 'manual',
      })
      expect(res.status).toBe(200)
      const $ = cheerio.load(await res.text())
      expect($('#links').text()).toBe('Links')
    }
  })

  it('should rewrite correctly', async () => {
    for (const [path, dest] of [
      ['/about', '/about'],
      ['/en/about', '/about'],
      ['/nl-NL/about', '/about'],
      ['/fr/about', '/fr/about'],
      ['/en/catch-all/hello', '/hello'],
      ['/catch-all/hello', '/hello'],
      ['/nl-NL/catch-all/hello', '/hello'],
      ['/fr/catch-all/hello', '/fr/hello'],
    ]) {
      const res = await fetchViaHTTP(appPort, path, undefined, {
        redirect: 'manual',
      })
      expect(res.status).toBe(200)
      const $ = cheerio.load(await res.text())
      expect(JSON.parse($('#data').text())).toEqual({
        url: dest,
      })
    }
  })

  it('should navigate on the client with rewrites correctly', async () => {
    for (const locale of ['', '/nl-NL', '/fr']) {
      const browser = await webdriver(appPort, `${locale}/links`)

      const expectedIndex = locale === '/fr' ? `fr` : ''

      await browser.elementByCss('#to-about').click()

      await check(async () => {
        const data = JSON.parse(
          cheerio
            .load(await browser.eval('document.documentElement.innerHTML'))(
              '#data'
            )
            .text()
        )
        console.log(data)
        return data.url === `${expectedIndex ? '/fr' : ''}/about`
          ? 'success'
          : 'fail'
      }, 'success')

      await browser
        .back()
        .waitForElementByCss('#links')
        .elementByCss('#to-catch-all')
        .click()

      await check(async () => {
        const data = JSON.parse(
          cheerio
            .load(await browser.eval('document.documentElement.innerHTML'))(
              '#data'
            )
            .text()
        )
        console.log(data)
        return data.url === `${expectedIndex ? '/fr' : ''}/hello`
          ? 'success'
          : 'fail'
      }, 'success')

      await browser.back().waitForElementByCss('#links')

      await browser.eval('window.beforeNav = 1')

      await browser.elementByCss('#to-index').click()

      await check(() => browser.eval('window.location.pathname'), locale || '/')
      expect(await browser.eval('window.beforeNav')).toBe(1)

      await browser.elementByCss('#to-links').click()

      await check(
        () => browser.eval('window.location.pathname'),
        `${locale}/links`
      )
      expect(await browser.eval('window.beforeNav')).toBe(1)
    }
  })
}

describe('Custom routes i18n', () => {
  beforeAll(async () => {
    externalPort = await findPort()
    server = http.createServer((req, res) => {
      res.statusCode = 200
      res.end(
        `<p id='data'>${JSON.stringify({
          url: req.url,
        })}</p>`
      )
    })
    await new Promise((res, rej) => {
      server.listen(externalPort, (err) => (err ? rej(err) : res()))
    })
    nextConfig.replace(/__EXTERNAL_PORT__/g, '' + externalPort)
  })
  afterAll(async () => {
    server.close()
    nextConfig.restore()
  })

  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))
    runTests(true)
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))
    runTests()
  })
})
