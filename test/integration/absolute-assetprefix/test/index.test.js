/* eslint-env jest */

import { findPort, killApp, nextBuild, nextStart, File } from 'next-test-utils'
import * as http from 'http'
import * as path from 'path'
import webdriver from 'next-webdriver'
import { join } from 'path'
import { promises as fs } from 'fs'

const appDir = join(__dirname, '..')

let appPort
let cdnPort
let app
let cdn
let buildId
let cdnAccessLog = []

const nextConfig = new File(path.resolve(__dirname, '../next.config.js'))

describe('absolute assetPrefix with path prefix', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        cdnPort = await findPort()
        // lightweight http proxy
        cdn = http.createServer((clientReq, clientRes) => {
          const proxyPath = clientReq.url.slice('/path-prefix'.length)
          cdnAccessLog.push(proxyPath)
          const proxyReq = http.request(
            {
              hostname: 'localhost',
              port: appPort,
              path: proxyPath,
              method: clientReq.method,
              headers: clientReq.headers,
            },
            (proxyRes) => {
              // cdn must be configured to allow requests from this origin
              proxyRes.headers['Access-Control-Allow-Origin'] =
                `http://localhost:${appPort}`
              clientRes.writeHead(proxyRes.statusCode, proxyRes.headers)
              // [NOTE] if socket doesn't have a handler to error event and if error
              // event leaks, node.js ends its process with errored exit code.
              // However, there can be failing socket event while running test
              // as long as assertion is correct, do not care indiviual socket errors.
              proxyRes.on('error', (e) => {
                require('console').error(e)
              })
              clientRes.on('error', (e) => {
                require('console').error(e)
              })

              proxyRes.pipe(clientRes, { end: true })
            }
          )

          proxyReq.on('error', (e) => {
            require('console').error(e)
          })
          clientReq.on('error', (e) => {
            require('console').error(e)
          })
          clientReq.pipe(proxyReq, { end: true })
        })
        await new Promise((resolve) => cdn.listen(cdnPort, resolve))
        nextConfig.replace('__CDN_PORT__', cdnPort)
        await nextBuild(appDir)
        buildId = await fs.readFile(
          path.resolve(__dirname, '../.next/BUILD_ID'),
          'utf8'
        )
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })

      afterEach(() => {
        cdnAccessLog = []
      })

      afterAll(() => killApp(app))
      afterAll(() => cdn.close())
      afterAll(() => nextConfig.restore())

      it('should not fetch static data from a CDN', async () => {
        const browser = await webdriver(appPort, '/')
        await browser.waitForElementByCss('#about-link').click()
        const prop = await browser.waitForElementByCss('#prop').text()
        expect(prop).toBe('hello')
        expect(cdnAccessLog).not.toContain(`/_next/data/${buildId}/about.json`)
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
        expect(
          cdnAccessLog.filter(
            (path) => path === `/_next/data/${buildId}/about.json`
          )
        ).toHaveLength(0)
      })

      it('should work with getStaticPaths prerendered', async () => {
        const browser = await webdriver(appPort, '/')
        await browser.waitForElementByCss('#gsp-prerender-link').click()
        const prop = await browser.waitForElementByCss('#prop').text()
        expect(prop).toBe('prerendered')
        expect(cdnAccessLog).not.toContain(
          `/_next/data/${buildId}/gsp-fallback/prerendered.json`
        )
      })

      it('should work with getStaticPaths fallback', async () => {
        const browser = await webdriver(appPort, '/')
        await browser.waitForElementByCss('#gsp-fallback-link').click()
        const prop = await browser.waitForElementByCss('#prop').text()
        expect(prop).toBe('fallback')
        expect(cdnAccessLog).not.toContain(
          `/_next/data/${buildId}/gsp-fallback/fallback.json`
        )
      })

      it('should work with getServerSideProps', async () => {
        const browser = await webdriver(appPort, '/')
        await browser.waitForElementByCss('#gssp-link').click()
        const prop = await browser.waitForElementByCss('#prop').text()
        expect(prop).toBe('foo')
        expect(cdnAccessLog).not.toContain(
          `/_next/data/${buildId}/gssp.json?prop=foo`
        )
      })
    }
  )
})
