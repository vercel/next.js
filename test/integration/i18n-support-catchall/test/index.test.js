/* eslint-env jest */

import http from 'http'
import qs from 'querystring'
import fs from 'fs-extra'
import cheerio from 'cheerio'
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
  check,
  getPageFileFromPagesManifest,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../')
const nextConfig = new File(join(appDir, 'next.config.js'))
let app
let appPort

const locales = ['en-US', 'nl-NL', 'nl-BE', 'nl', 'fr-BE', 'fr', 'en']

function runTests(isDev) {
  it('should load the index route correctly SSR', async () => {
    const res = await fetchViaHTTP(appPort, '/', undefined, {
      redirect: 'manual',
    })
    expect(res.status).toBe(200)

    const html = await res.text()
    const $ = cheerio.load(html)

    expect($('#router-locale').text()).toBe('en-US')
    expect($('#router-default-locale').text()).toBe('en-US')
    expect($('#router-pathname').text()).toBe('/[[...slug]]')
    expect($('#router-as-path').text()).toBe('/')
    expect(JSON.parse($('#props').text())).toEqual({
      params: {},
      locale: 'en-US',
      locales,
      defaultLocale: 'en-US',
    })
    expect(JSON.parse($('#router-locales').text())).toEqual(locales)
  })

  it('should load the index route correctly CSR', async () => {
    const browser = await webdriver(appPort, '/')

    expect(await browser.elementByCss('#router-locale').text()).toBe('en-US')
    expect(await browser.elementByCss('#router-default-locale').text()).toBe(
      'en-US'
    )
    expect(await browser.elementByCss('#router-pathname').text()).toBe(
      '/[[...slug]]'
    )
    expect(await browser.elementByCss('#router-as-path').text()).toBe('/')
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      params: {},
      locale: 'en-US',
      locales,
      defaultLocale: 'en-US',
    })
  })

  it('should navigate to other locale index and back', async () => {
    const browser = await webdriver(appPort, '/')

    await browser.elementByCss('#to-locale-index').click()

    await check(() => browser.eval('window.location.pathname'), '/nl-NL')

    expect(await browser.elementByCss('#router-locale').text()).toBe('nl-NL')
    expect(await browser.elementByCss('#router-default-locale').text()).toBe(
      'en-US'
    )
    expect(await browser.elementByCss('#router-pathname').text()).toBe(
      '/[[...slug]]'
    )
    expect(await browser.elementByCss('#router-as-path').text()).toBe('/')
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      params: {},
      locale: 'nl-NL',
      locales,
      defaultLocale: 'en-US',
    })

    await browser.back()

    await check(() => browser.elementByCss('#router-locale').text(), 'en-US')

    expect(await browser.elementByCss('#router-locale').text()).toBe('en-US')
    expect(await browser.elementByCss('#router-default-locale').text()).toBe(
      'en-US'
    )
    expect(await browser.elementByCss('#router-pathname').text()).toBe(
      '/[[...slug]]'
    )
    expect(await browser.elementByCss('#router-as-path').text()).toBe('/')
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      params: {},
      locale: 'en-US',
      locales,
      defaultLocale: 'en-US',
    })
  })

  it('should navigate to other locale page and back', async () => {
    const browser = await webdriver(appPort, '/')

    await browser.elementByCss('#to-locale-another').click()

    await check(
      () => browser.eval('window.location.pathname'),
      '/nl-NL/another'
    )

    expect(await browser.elementByCss('#router-locale').text()).toBe('nl-NL')
    expect(await browser.elementByCss('#router-default-locale').text()).toBe(
      'en-US'
    )
    expect(await browser.elementByCss('#router-pathname').text()).toBe(
      '/[[...slug]]'
    )
    expect(await browser.elementByCss('#router-as-path').text()).toBe(
      '/another'
    )
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      params: {
        slug: ['another'],
      },
      locale: 'nl-NL',
      locales,
      defaultLocale: 'en-US',
    })

    await browser.back()

    await check(() => browser.elementByCss('#router-locale').text(), 'en-US')

    expect(await browser.elementByCss('#router-locale').text()).toBe('en-US')
    expect(await browser.elementByCss('#router-default-locale').text()).toBe(
      'en-US'
    )
    expect(await browser.elementByCss('#router-pathname').text()).toBe(
      '/[[...slug]]'
    )
    expect(await browser.elementByCss('#router-as-path').text()).toBe('/')
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      params: {},
      locale: 'en-US',
      locales,
      defaultLocale: 'en-US',
    })
  })
}

describe('i18n Support Root Catch-all', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      await fs.remove(join(appDir, '.next'))
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests(true)
  })

  describe('production mode', () => {
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
      await fs.remove(join(appDir, '.next'))
      nextConfig.replace('// target', 'target')

      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      nextConfig.restore()
      await killApp(app)
    })

    it('should normalize locale items in route-matches', async () => {
      const server = http.createServer(async (req, res) => {
        try {
          await require(join(
            appDir,
            '.next/serverless',
            getPageFileFromPagesManifest(appDir, '/[[...slug]]')
          )).render(req, res)
        } catch (err) {
          console.error(err)
          res.statusCode = 500
          res.end('internal server error')
        }
      })
      const port = await findPort()
      await new Promise((resolve, reject) => {
        server.listen(port, (err) => (err ? reject(err) : resolve()))
      })
      console.log(`Listening at ::${port}`)

      const res = await fetchViaHTTP(port, '/[[...slug]]', undefined, {
        headers: {
          'x-vercel-id': 'hi',
          'x-now-route-matches': qs.stringify({
            '1': 'nl-NL',
          }),
        },
        redirect: 'manual',
      })
      const res2 = await fetchViaHTTP(port, '/[[...slug]]', undefined, {
        headers: {
          'x-vercel-id': 'hi',
          'x-now-route-matches': qs.stringify({
            slug: 'eN',
          }),
        },
        redirect: 'manual',
      })
      const res3 = await fetchViaHTTP(port, '/fr/[[...slug]]', undefined, {
        headers: {
          'x-vercel-id': 'hi',
          'x-now-route-matches': qs.stringify({
            slug: 'hello',
          }),
        },
        redirect: 'manual',
      })

      server.close()

      expect(res.status).toBe(200)
      expect(res2.status).toBe(200)
      expect(res3.status).toBe(200)

      const $ = cheerio.load(await res.text())
      const $2 = cheerio.load(await res2.text())
      const $3 = cheerio.load(await res3.text())

      expect($('#router-locale').text()).toBe('nl-NL')
      expect($('#router-pathname').text()).toBe('/[[...slug]]')
      expect($('#router-as-path').text()).toBe('/')
      expect($('#router-default-locale').text()).toBe('en-US')
      expect(JSON.parse($('#router-query').text())).toEqual({})
      expect(JSON.parse($('#router-locales').text())).toEqual(locales)
      expect(JSON.parse($('#props').text())).toEqual({
        locale: 'nl-NL',
        defaultLocale: 'en-US',
        locales,
        params: {},
      })

      expect($2('#router-locale').text()).toBe('en')
      expect($2('#router-pathname').text()).toBe('/[[...slug]]')
      expect($2('#router-as-path').text()).toBe('/')
      expect($2('#router-default-locale').text()).toBe('en-US')
      expect(JSON.parse($2('#router-query').text())).toEqual({})
      expect(JSON.parse($2('#router-locales').text())).toEqual(locales)
      expect(JSON.parse($2('#props').text())).toEqual({
        locale: 'en',
        defaultLocale: 'en-US',
        locales,
        params: {},
      })

      expect($3('#router-locale').text()).toBe('fr')
      expect($3('#router-pathname').text()).toBe('/[[...slug]]')
      expect($3('#router-as-path').text()).toBe('/hello')
      expect($3('#router-default-locale').text()).toBe('en-US')
      expect(JSON.parse($3('#router-query').text())).toEqual({
        slug: ['hello'],
      })
      expect(JSON.parse($3('#router-locales').text())).toEqual(locales)
      expect(JSON.parse($3('#props').text())).toEqual({
        locale: 'fr',
        defaultLocale: 'en-US',
        locales,
        params: {
          slug: ['hello'],
        },
      })
    })

    runTests()
  })
})
