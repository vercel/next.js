/* eslint-disable jest/no-standalone-expect */
import http from 'http'
import httpProxy from 'http-proxy'
import cheerio from 'cheerio'
import { findPort } from 'next-test-utils'
import { nextTestSetup, isNextDev, isNextStart } from 'e2e-utils'

describe('CSS Module client-side navigation', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    // Calls `next.build()` and uses an in-test proxy in front of the Next
    // server; both rely on the local-process model and are not applicable to
    // deploy mode.
    skipDeployment: true,
  })
  if (skipped) return

  let proxyServer: http.Server
  let proxyPort: number
  let stallCss = false

  beforeAll(async () => {
    if (!isNextDev) {
      await next.build()
    }
    await next.start()

    if (!isNextDev) {
      proxyPort = await findPort()

      const proxy = httpProxy.createProxyServer({
        target: next.url,
      })

      proxyServer = http.createServer(async (req, res) => {
        if (
          stallCss &&
          req.url &&
          new URL(req.url, next.url).pathname.endsWith('.css')
        ) {
          console.log('stalling request for', req.url)
          await new Promise((resolve) => setTimeout(resolve, 5 * 1000))
        }
        proxy.web(req, res)
      })

      proxy.on('error', (err) => {
        console.warn('Failed to proxy', err)
      })

      await new Promise<void>((resolve) => {
        proxyServer.listen(proxyPort, () => resolve())
      })
    }
  })

  beforeEach(() => {
    stallCss = false
  })

  afterAll(async () => {
    if (proxyServer) {
      proxyServer.close()
    }
  })

  beforeEach(() => {
    stallCss = false
  })
  const openBrowser = (url: string) =>
    isNextDev ? next.browser(url) : next.browser(url, { baseUrl: proxyPort })

  ;(isNextStart ? it : it.skip)(
    'should time out and hard navigate for stalled CSS request',
    async () => {
      stallCss = true

      const browser = await next.browser('/red', { baseUrl: proxyPort })
      try {
        await browser.eval('window.beforeNav = "hello"')

        const redColor = await browser.eval(
          `window.getComputedStyle(document.querySelector('#verify-red')).color`
        )
        expect(redColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)
        expect(await browser.eval('window.beforeNav')).toBe('hello')

        await browser.elementByCss('#link-blue').click()

        await browser.waitForElementByCss('#verify-blue')

        const blueColor = await browser.eval(
          `window.getComputedStyle(document.querySelector('#verify-blue')).color`
        )
        expect(blueColor).toMatchInlineSnapshot(`"rgb(0, 0, 255)"`)

        expect(await browser.eval('window.beforeNav')).toBeFalsy()
      } finally {
        stallCss = false
        await browser.close()
      }
    },
    20000
  )

  it('should be able to client-side navigate from red to blue', async () => {
    const browser = await openBrowser('/red')

    try {
      await browser.eval(`window.__did_not_ssr = 'make sure this is set'`)

      const redColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('#verify-red')).color`
      )
      expect(redColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)

      await browser.elementByCss('#link-blue').click()

      await browser.waitForElementByCss('#verify-blue')

      const blueColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('#verify-blue')).color`
      )
      expect(blueColor).toMatchInlineSnapshot(`"rgb(0, 0, 255)"`)

      expect(await browser.eval(`window.__did_not_ssr`)).toMatchInlineSnapshot(
        `"make sure this is set"`
      )
    } finally {
      await browser.close()
    }
  })

  it('should be able to client-side navigate from blue to red', async () => {
    if (!isNextDev) {
      const content = await next.render('/blue')
      const $ = cheerio.load(content)

      const serverCssPreloads = $('link[rel="preload"][as="style"]')
      expect(serverCssPreloads.length).toBe(2)

      const serverCssPrefetches = $('link[rel="prefetch"][as="style"]')
      expect(serverCssPrefetches.length).toBe(0)
    }

    const browser = await openBrowser('/blue')

    try {
      await browser.eval(`window.__did_not_ssr = 'make sure this is set'`)

      const blueColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('#verify-blue')).color`
      )
      expect(blueColor).toMatchInlineSnapshot(`"rgb(0, 0, 255)"`)

      await browser.elementByCss('#link-red').click()

      await browser.waitForElementByCss('#verify-red')

      const redColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('#verify-red')).color`
      )
      expect(redColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)

      expect(await browser.eval(`window.__did_not_ssr`)).toMatchInlineSnapshot(
        `"make sure this is set"`
      )
    } finally {
      await browser.close()
    }
  })

  it('should be able to client-side navigate from none to red', async () => {
    const browser = await openBrowser('/none')

    try {
      await browser.eval(`window.__did_not_ssr = 'make sure this is set'`)

      await browser.elementByCss('#link-red').click()
      await browser.waitForElementByCss('#verify-red')

      const redColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('#verify-red')).color`
      )
      expect(redColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)

      expect(await browser.eval(`window.__did_not_ssr`)).toMatchInlineSnapshot(
        `"make sure this is set"`
      )
    } finally {
      await browser.close()
    }
  })

  it('should be able to client-side navigate from none to blue', async () => {
    const browser = await openBrowser('/none')

    try {
      await browser.eval(`window.__did_not_ssr = 'make sure this is set'`)

      await browser.elementByCss('#link-blue').click()
      await browser.waitForElementByCss('#verify-blue')

      const blueColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('#verify-blue')).color`
      )
      expect(blueColor).toMatchInlineSnapshot(`"rgb(0, 0, 255)"`)

      expect(await browser.eval(`window.__did_not_ssr`)).toMatchInlineSnapshot(
        `"make sure this is set"`
      )
    } finally {
      await browser.close()
    }
  })
})
