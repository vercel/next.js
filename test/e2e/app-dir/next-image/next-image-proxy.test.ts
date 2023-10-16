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

      const image = browser.elementByCss('#app-page')
      const src = await image.getAttribute('src')

      expect(src).toContain(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=90'
      )

      await check(() => {
        // we expect 3 images to load and for none of them to have errors
        if (fulfilledCount === 3 && failCount === 0) {
          return 'success'
        }
      }, 'success')
    })

    afterAll(() => {
      proxyServer.close()
    })
  }
)
