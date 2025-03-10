/* eslint-env jest */

import webdriver from 'next-webdriver'
import { createServer, request } from 'http'
import { join, resolve } from 'path'
import {
  findPort,
  launchApp,
  killApp,
  nextBuild,
  nextStart,
  File,
} from 'next-test-utils'

const appDir = join(__dirname, '..')
const nextConfig = new File(resolve(__dirname, '../next.config.js'))

let appPort
let cdnPort
let app
let cdn

function runTests() {
  it('should load a Pages Router page correctly', async () => {
    const browser = await webdriver(appPort, '/')

    expect(
      await browser
        .elementByCss('#__next div:nth-child(2)')
        .getComputedCss('background-color')
    ).toContain('221, 221, 221')

    expect(await browser.eval('document.documentElement.innerHTML')).toContain(
      'Where does it come from?'
    )
  })

  it('should load a App Router page correctly', async () => {
    const browser = await webdriver(appPort, '/test-app')

    expect(
      await browser
        .elementByCss('body div:nth-child(3)')
        .getComputedCss('background-color')
    ).toContain('221, 221, 221')

    expect(await browser.eval('document.documentElement.innerHTML')).toContain(
      'Where does it come from?'
    )
  })
}

describe('next/dynamic with assetPrefix', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        cdnPort = await findPort()
        // lightweight http proxy
        cdn = createServer((clientReq, clientRes) => {
          const proxyPath = clientReq.url.slice('/path-prefix'.length)
          const proxyReq = request(
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
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
      })

      afterAll(() => killApp(app))
      afterAll(() => cdn.close())
      afterAll(() => nextConfig.restore())

      runTests(true)
    }
  )
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        cdnPort = await findPort()
        // lightweight http proxy
        cdn = createServer((clientReq, clientRes) => {
          const proxyPath = clientReq.url.slice('/path-prefix'.length)
          const proxyReq = request(
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
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })

      afterAll(() => killApp(app))
      afterAll(() => cdn.close())
      afterAll(() => nextConfig.restore())

      runTests()
    }
  )
})
