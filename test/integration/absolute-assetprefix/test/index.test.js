/* eslint-env jest */

import { findPort, killApp, nextBuild, nextStart, File } from 'next-test-utils'
import * as http from 'http'
import * as path from 'path'
import webdriver from 'next-webdriver'
import { join } from 'path'

jest.setTimeout(1000 * 60 * 1)

const appDir = join(__dirname, '..')

let appPort
let cdnPort
let app
let cdn

const nextConfig = new File(path.resolve(__dirname, '../next.config.js'))

describe('absolute assetPrefix with path prefix', () => {
  beforeAll(async () => {
    cdnPort = await findPort()
    // lightweight http proxy
    cdn = http.createServer((clientReq, clientRes) => {
      const proxy = http.request(
        {
          hostname: 'localhost',
          port: appPort,
          path: clientReq.url.slice('/path-prefix'.length),
          method: clientReq.method,
          headers: clientReq.headers,
        },
        (res) => {
          // cdn must be configured to allow requests from this origin
          res.headers[
            'Access-Control-Allow-Origin'
          ] = `http://localhost:${appPort}`
          clientRes.writeHead(res.statusCode, res.headers)
          res.pipe(clientRes, { end: true })
        }
      )

      clientReq.pipe(proxy, { end: true })
    })
    await new Promise((resolve) => cdn.listen(cdnPort, resolve))
    nextConfig.replace('__CDN_PORT__', cdnPort)
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })

  afterAll(() => killApp(app))
  afterAll(() => cdn.close())
  afterAll(() => nextConfig.restore())

  it('should be able to fetch static data from a CDN', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.waitForElementByCss('#about-link').click()
    const prop = await browser.waitForElementByCss('#prop').text()
    expect(prop).toBe('hello')
  })

  it('should fetch from cache correctly', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.eval('window.clientSideNavigated = true')
    await browser.waitForElementByCss('#about-link').click()
    await browser.waitForElementByCss('#prop')
    await browser.back()
    await browser.waitForElementByCss('#about-link').click()
    const prop = await browser.waitForElementByCss('#prop').text()
    expect(prop).toBe('hello')
    expect(await browser.eval('window.clientSideNavigated')).toBe(true)
  })
})
