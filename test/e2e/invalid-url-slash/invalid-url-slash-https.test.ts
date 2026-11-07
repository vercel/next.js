import fs from 'node:fs'
import https from 'node:https'
import { join } from 'node:path'
import httpProxy from 'http-proxy'
import { findPort } from 'next-test-utils'
import webdriver from 'next-webdriver'
import { FileRef, nextTestSetup } from 'e2e-utils'

// Pattern that may cause error
describe('invalid HTTPS URL slash', () => {
  let proxyPort: number
  let proxyServer: https.Server

  const { next, skipped } = nextTestSetup({
    files: {
      pages: new FileRef(join(__dirname, 'pages')),
    },
    // This test is skipped when deployed because it relies on a proxy server
    skipDeployment: true,
  })

  if (skipped) return

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
      throw new Error(`Failed to proxy: ${err.message}`)
    })

    await new Promise<void>((resolve) => {
      proxyServer.listen(proxyPort, () => resolve())
    })
  })

  afterAll(() => {
    proxyServer.close()
  })

  it('should navigate "//" correctly client-side', async () => {
    const browser = await webdriver(`https://localhost:${proxyPort}`, '/', {
      ignoreHTTPSErrors: true,
    })
    // Change to "//"
    await browser.elementByCss('button').click().waitForIdleNetwork()
    const text = await browser.waitForElementByCss('h1', 100).text()
    expect(text).toBe('index page')
  })
})
