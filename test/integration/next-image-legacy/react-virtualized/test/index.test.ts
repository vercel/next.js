/* eslint-env jest */

import {
  findPort,
  killApp,
  nextBuild,
  nextStart,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import httpProxy from 'http-proxy'
import { join } from 'path'
import { remove } from 'fs-extra'
import http from 'http'

const appDir = join(__dirname, '../')
let appPort
let app
let proxyServer: http.Server
let cancelCount = 0
describe('react-virtualized wrapping next/legacy/image', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        await remove(join(appDir, '.next'))
        await nextBuild(appDir)
        const port = await findPort()
        app = await nextStart(appDir, port)
        appPort = await findPort()

        const proxy = httpProxy.createProxyServer({
          target: `http://localhost:${port}`,
        })

        proxyServer = http.createServer(async (req, res) => {
          let isComplete = false

          if (req.url.startsWith('/_next/image')) {
            req.on('close', () => {
              if (!isComplete) {
                cancelCount++
              }
            })
            console.log('stalling request for', req.url)
            await waitFor(3000)
            isComplete = true
          }
          proxy.web(req, res)
        })

        proxy.on('error', (err) => {
          console.warn('Failed to proxy', err)
        })

        await new Promise<void>((resolve) => {
          proxyServer.listen(appPort, () => resolve())
        })
      })
      afterAll(async () => {
        proxyServer.close()
        await killApp(app)
      })

      it('should not cancel requests for images', async () => {
        // TODO: this test doesnt work unless we can set `disableCache: true`
        let browser = await webdriver(appPort, '/', {
          disableCache: true,
        })
        expect(cancelCount).toBe(0)
        await browser.eval('window.scrollTo({ top: 100, behavior: "smooth" })')
        await waitFor(100)
        expect(cancelCount).toBe(0)
        await browser.eval('window.scrollTo({ top: 200, behavior: "smooth" })')
        await waitFor(200)
        expect(cancelCount).toBe(0)
        await browser.eval('window.scrollTo({ top: 300, behavior: "smooth" })')
        await waitFor(300)
        expect(cancelCount).toBe(0)
      })
    }
  )
})
