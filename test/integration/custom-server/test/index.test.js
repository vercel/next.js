/* global jasmine, describe, it, expect, beforeAll, afterAll */

import { join } from 'path'
import getPort from 'get-port'
import clone from 'clone'
import cheerio from 'cheerio'
import {
  initNextServerScript,
  killApp,
  renderViaHTTP,
  fetchViaHTTP
} from 'next-test-utils'
import webdriver from 'next-webdriver'

const appDir = join(__dirname, '../')
let appPort
let server
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

const context = {}

const startServer = async (optEnv = {}) => {
  const scriptPath = join(appDir, 'server.js')
  context.appPort = appPort = await getPort()
  const env = Object.assign(
    {},
    clone(process.env),
    { PORT: `${appPort}` },
    optEnv
  )

  server = await initNextServerScript(scriptPath, /Ready on/, env)
}

describe('Custom Server', () => {
  describe('with dynamic assetPrefix', () => {
    beforeAll(() => startServer())
    afterAll(() => killApp(server))

    it('should set the assetPrefix dynamically', async () => {
      const normalUsage = await renderViaHTTP(appPort, '/asset')
      expect(normalUsage).not.toMatch(/127\.0\.0\.1/)

      const dynamicUsage = await renderViaHTTP(appPort, '/asset?setAssetPrefix=1')
      expect(dynamicUsage).toMatch(/127\.0\.0\.1/)
    })

    it('should handle null assetPrefix accordingly', async () => {
      const $normal = cheerio.load(await renderViaHTTP(appPort, '/asset?setEmptyAssetPrefix=1'))
      expect($normal('img').attr('src')).toBe('/static/myimage.png')
    })

    it('should set the assetPrefix to a given request', async () => {
      for (let lc = 0; lc < 1000; lc++) {
        const [normalUsage, dynamicUsage] = await Promise.all([
          await renderViaHTTP(appPort, '/asset'),
          await renderViaHTTP(appPort, '/asset?setAssetPrefix=1')
        ])

        expect(normalUsage).not.toMatch(/127\.0\.0\.1/)
        expect(dynamicUsage).toMatch(/127\.0\.0\.1/)
      }
    })

    it('should support next/asset in server side', async () => {
      const $normal = cheerio.load(await renderViaHTTP(appPort, '/asset'))
      expect($normal('img').attr('src')).toBe('/static/myimage.png')

      const $dynamic = cheerio.load(await renderViaHTTP(appPort, '/asset?setAssetPrefix=1'))
      expect($dynamic('img').attr('src')).toBe(`http://127.0.0.1:${context.appPort}/static/myimage.png`)
    })

    it('should support next/asset in client side', async() => {
      const browser = await webdriver(context.appPort, '/')
      await browser
        .elementByCss('#go-asset').click()
        .waitForElementByCss('#asset-page')

      expect(await browser.elementByCss('img').getAttribute('src'))
        .toBe(`http://localhost:${context.appPort}/static/myimage.png`)
      browser.close()

      const browser2 = await webdriver(context.appPort, '/?setAssetPrefix=1')
      await browser2
        .elementByCss('#go-asset').click()
        .waitForElementByCss('#asset-page')

      expect(await browser2.elementByCss('img').getAttribute('src'))
        .toBe(`http://127.0.0.1:${context.appPort}/static/myimage.png`)
      browser2.close()
    })
  })

  describe('with generateEtags enabled', () => {
    beforeAll(() => startServer({ GENERATE_ETAGS: 'true' }))
    afterAll(() => killApp(server))

    it('response includes etag header', async () => {
      const response = await fetchViaHTTP(appPort, '/')
      expect(response.headers.get('etag')).toBeTruthy()
    })
  })

  describe('with generateEtags disabled', () => {
    beforeAll(() => startServer({ GENERATE_ETAGS: 'false' }))
    afterAll(() => killApp(server))

    it('response does not include etag header', async () => {
      const response = await fetchViaHTTP(appPort, '/')
      expect(response.headers.get('etag')).toBeNull()
    })
  })
})
