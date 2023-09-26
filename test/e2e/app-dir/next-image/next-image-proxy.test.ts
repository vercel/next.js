import { join } from 'path'
import {
  findPort,
  killApp,
  nextBuild,
  nextStart,
} from '../../../lib/next-test-utils'
import https from 'https'
import httpProxy from 'http-proxy'
import fs from 'fs'
import webdriver from '../../../lib/next-webdriver'

const appDir = join(__dirname)
let proxyPort
let app
let proxyServer: https.Server

describe('next-image-proxy', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    const port = await findPort()
    app = await nextStart(appDir, port)
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
      target: `http://localhost:${port}`,
      ssl,
      secure: false,
    })

    proxyServer = https.createServer(ssl, async (req, res) => {
      proxy.web(req, res)
    })

    proxy.on('error', (err) => {
      console.warn('Failed to proxy', err)
    })

    await new Promise<void>((resolve) => {
      proxyServer.listen(proxyPort, () => resolve())
    })
  })

  it('loads images without any errors', async () => {
    let failCount = 0

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
        })
      },
    })

    const image = browser.elementByCss('#app-page')
    const src = await image.getAttribute('src')

    expect(src).toContain(
      '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=90'
    )

    expect(failCount).toBe(0)
  })
  afterAll(async () => {
    proxyServer.close()
    await killApp(app)
  })
})
