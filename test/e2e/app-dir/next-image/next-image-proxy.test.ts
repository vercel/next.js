import { join } from 'path'
import { findPort, check } from 'next-test-utils'
import https from 'https'
import httpProxy from 'http-proxy'
import fs from 'fs'
import webdriver from 'next-webdriver'
import { createNextDescribe } from 'e2e-utils'

let proxyPort
let proxyServer: https.Server

createNextDescribe(
  'next-image-proxy',
  {
    files: __dirname,
  },
  ({ next }) => {
    beforeAll(async () => {
      proxyPort = await findPort()

      const ssl = {
        key: fs.readFileSync(
          join(__dirname, 'certificates/localhost-key.pem'),
          'utf8'
        ),
        cert: fs.readFileSync(
          join(__dirname, 'certificates/localhost.pem'),
          'utf8'
        ),
      }

      const proxy = httpProxy.createProxyServer({
        target: `http://localhost:${next.appPort}`,
        ssl,
        secure: false,
      })

      proxyServer = https.createServer(ssl, async (req, res) => {
        proxy.web(req, res)
      })

      proxy.on('error', (err) => {
        throw new Error('Failed to proxy: ' + err.message)
      })

      await new Promise<void>((resolve) => {
        proxyServer.listen(proxyPort, () => resolve())
      })
    })

    it('loads images without any errors', async () => {
      let failCount = 0
      let fulfilledCount = 0

      const browser = await webdriver(`https://localhost:${proxyPort}`, '/', {
        ignoreHTTPSErrors: true,
        beforePageLoad(page) {
          page.on('response', (response) => {
            const url = response.url()
            if (!url.includes('/_next/image')) return

            const status = response.status()

            console.log(`URL: ${url} Status: ${status}`)

            if (!response.ok()) {
              console.log(`Request failed: ${url}`)
              failCount++
            }

            fulfilledCount++
          })
        },
      })

      const local = await browser.elementByCss('#app-page').getAttribute('src')

      if (process.env.TURBOPACK) {
        expect(local).toMatchInlineSnapshot(
          `"/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.308c602d.png&w=828&q=90"`
        )
      } else {
        expect(local).toMatchInlineSnapshot(
          `"/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=90"`
        )
      }

      const remote = await browser
        .elementByCss('#remote-app-page')
        .getAttribute('src')
      if (process.env.TURBOPACK) {
        expect(remote).toMatchInlineSnapshot(
          `"/_next/image?url=https%3A%2F%2Fimage-optimization-test.vercel.app%2Ftest.jpg&w=640&q=90"`
        )
      } else {
        expect(remote).toMatchInlineSnapshot(
          `"/_next/image?url=https%3A%2F%2Fimage-optimization-test.vercel.app%2Ftest.jpg&w=640&q=90"`
        )
      }

      const expected = JSON.stringify({ fulfilledCount: 4, failCount: 0 })
      await check(() => JSON.stringify({ fulfilledCount, failCount }), expected)
    })

    it('should work with connection upgrade by removing it via filterReqHeaders()', async () => {
      const $ = await next.render$('/')
      const url1 = $('#app-page').attr('src')
      const opts = { headers: { connection: 'upgrade' } }
      const res1 = await next.fetch(url1, opts)
      expect(res1.status).toBe(200)
      const url2 = $('#remote-app-page').attr('src')
      const res2 = await next.fetch(url2, opts)
      expect(res2.status).toBe(200)
    })

    afterAll(() => {
      proxyServer.close()
    })
  }
)
