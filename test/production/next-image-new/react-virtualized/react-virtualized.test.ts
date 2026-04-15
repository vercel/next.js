import { nextTestSetup } from 'e2e-utils'
import { findPort, waitFor } from 'next-test-utils'
import webdriver from 'next-webdriver'
import httpProxy from 'http-proxy'
import http from 'http'

describe('react-virtualized wrapping next/image', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  let proxyServer: http.Server
  let proxyPort: number
  let cancelCount = 0

  beforeAll(async () => {
    await next.build()
    await next.start()

    proxyPort = await findPort()
    const proxy = httpProxy.createProxyServer({
      target: next.url,
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
      proxyServer.listen(proxyPort, () => resolve())
    })
  })

  afterAll(() => {
    proxyServer?.close()
  })

  it('should not cancel requests for images', async () => {
    // TODO: this test doesnt work unless we can set `disableCache: true`
    let browser = await webdriver(proxyPort, '/', {
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
})
