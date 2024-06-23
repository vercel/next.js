/* eslint-env jest */

import { join } from 'path'
import http from 'http'
import httpProxy from 'http-proxy'
import webdriver from 'next-webdriver'
import {
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'

const appDir = join(__dirname, '..')

let app
let appPort
let proxyServer
let proxyPort
let should404Data = false

const runTests = () => {
  it('should hard navigate when a new deployment occurs', async () => {
    const browser = await webdriver(proxyPort, '/')

    await browser.eval('window.beforeNav = 1')
    expect(await browser.elementByCss('#index').text()).toBe('Index page')

    should404Data = true

    await browser.eval(`(function() {
      window.next.router.push('/gsp')
    })()`)
    await browser.waitForElementByCss('#gsp')

    expect(await browser.eval('window.beforeNav')).toBeFalsy()

    await browser.eval('window.beforeNav = 1')
    await browser.eval(`(function() {
      window.next.router.push('/gssp')
    })()`)
    await browser.waitForElementByCss('#gssp')

    expect(await browser.eval('window.beforeNav')).toBeFalsy()
  })
}

describe('SSG data 404', () => {
  if (process.platform === 'win32') {
    it('should skip this suite on Windows', () => {})
    return
  }

  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort)

        const proxy = httpProxy.createProxyServer({
          target: `http://localhost:${appPort}`,
        })
        proxyPort = await findPort()

        proxyServer = http.createServer((req, res) => {
          req.on('error', (e) => {
            require('console').error(e)
          })
          res.on('error', (e) => {
            require('console').error(e)
          })
          if (should404Data && req.url.match(/\/_next\/data/)) {
            res.statusCode = 404
            return res.end('not found')
          }
          proxy.web(req, res)
        })

        await new Promise((resolve) => {
          proxyServer.listen(proxyPort, () => resolve())
        })
      })
      afterAll(async () => {
        await killApp(app)
        proxyServer.close()
      })

      runTests()
    }
  )
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        await nextBuild(appDir)

        appPort = await findPort()
        app = await nextStart(appDir, appPort)

        const proxy = httpProxy.createProxyServer({
          target: `http://localhost:${appPort}`,
        })
        proxyPort = await findPort()

        proxyServer = http.createServer((req, res) => {
          req.on('error', (e) => {
            require('console').error(e)
          })
          res.on('error', (e) => {
            require('console').error(e)
          })
          if (should404Data && req.url.match(/\/_next\/data/)) {
            res.statusCode = 404
            return res.end('not found')
          }
          proxy.web(req, res, undefined, (e) => {
            require('console').error(e)
          })
        })

        await new Promise((resolve) => {
          proxyServer.listen(proxyPort, () => resolve())
        })
      })
      afterAll(async () => {
        await killApp(app)
        proxyServer.close()
      })

      runTests()
    }
  )
})
