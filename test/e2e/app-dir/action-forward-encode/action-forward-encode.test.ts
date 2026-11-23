/* eslint-disable jest/no-standalone-expect */
import http from 'http'
import httpProxy from 'http-proxy'
import { findPort, retry } from 'next-test-utils'
import { nextTestSetup, isNextDeploy } from 'e2e-utils'
import type { Playwright } from 'e2e-utils'

async function runForwardedAction(browser: Playwright) {
  await retry(async () => {
    expect(await browser.elementById('editor').text()).toBe('ready')
  })
  await browser.elementById('back').click()
  await browser.waitForElementByCss('#call-action')
  await browser.elementById('call-action').click()
  await retry(async () => {
    expect(await browser.elementById('call-action').text()).toBe('saved')
  })
}

describe('action-forward-encode', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('runs an action forwarded from a page that does not bundle it', async () => {
    // Kept active in deploy mode: the forwarded request crosses the real
    // deployment ingress instead of the local strict proxy below.
    const browser = await next.browser('/items/1/edit')
    await runForwardedAction(browser)
  })

  // The strict ingress simulation needs a local proxy in front of the Next.js
  // server, which deploy mode cannot provide. The assertion above stays active
  // in deploy mode to cover the real ingress.
  if (!isNextDeploy) {
    let proxyServer: http.Server
    let proxyPort: number
    const seenPaths: string[] = []

    beforeAll(async () => {
      const proxy = httpProxy.createProxyServer({
        target: next.url,
      })
      proxy.on('error', (err) => {
        console.warn('Failed to proxy', err)
      })

      // A strict front end such as an AWS Lambda function URL answers 400 to
      // request paths that still contain literal brackets.
      const rejectBrackets = (url: string | undefined) =>
        /[[\]]/.test(url || '')

      proxyServer = http.createServer((req, res) => {
        if (rejectBrackets(req.url)) {
          res.statusCode = 400
          res.end('bad path')
          return
        }
        seenPaths.push(req.url || '')
        proxy.web(req, res)
      })

      proxyPort = await findPort()
      await new Promise<void>((resolve) => {
        proxyServer.listen(proxyPort, () => resolve())
      })
    })

    afterAll(async () => {
      await new Promise<void>((resolve) => {
        if (!proxyServer) {
          resolve()
          return
        }
        proxyServer.close(() => resolve())
      })
    })

    it('encodes the forwarded worker route pattern', async () => {
      const browser = await next.browser('/items/1/edit', {
        baseUrl: `http://localhost:${proxyPort}`,
      })
      await runForwardedAction(browser)

      expect(seenPaths).toContain('/items/%5Bid%5D/edit')
      expect(seenPaths.filter((path) => /[[\]]/.test(path))).toEqual([])
    })
  }
})
