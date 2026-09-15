import {
  waitForRedbox,
  getBrowserBodyText,
  retry,
  waitFor,
} from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'

export function runBasicHmrTest(nextConfig: {
  basePath: string
  assetPrefix: string
}) {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    nextConfig,
    patchFileDelay: 500,
    forcedPort: 'random',
  })
  const { basePath } = nextConfig

  it('should have correct router.isReady for auto-export page', async () => {
    let browser = await next.browser(basePath + '/auto-export-is-ready')

    expect(await browser.elementByCss('#ready').text()).toBe('yes')
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({})

    browser = await next.browser(basePath + '/auto-export-is-ready?hello=world')

    await retry(async () => {
      expect(await browser.elementByCss('#ready').text()).toBe('yes')
    })
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
      hello: 'world',
    })
  })

  it('should have correct router.isReady for getStaticProps page', async () => {
    let browser = await next.browser(basePath + '/gsp-is-ready')

    expect(await browser.elementByCss('#ready').text()).toBe('yes')
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({})

    browser = await next.browser(basePath + '/gsp-is-ready?hello=world')

    await retry(async () => {
      expect(await browser.elementByCss('#ready').text()).toBe('yes')
    })
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
      hello: 'world',
    })
  })
  ;(isTurbopack ? it : it.skip)(
    'should have correct compile timing after fixing error',
    async () => {
      const browser = await next.browser(basePath + '/auto-export-is-ready')
      let outputLength
      await next.patchFile(
        'pages/auto-export-is-ready.js',
        (content) => `import hello from 'non-existent'\n` + content,
        async () => {
          await waitForRedbox(browser)
          await waitFor(3000)
          outputLength = next.cliOutput.length
        }
      )

      let compileTimeStr
      await retry(async () => {
        compileTimeStr = next.cliOutput.substring(outputLength)
        expect(compileTimeStr).toMatch(/Compiled.*?/i)
      })

      const matches = [
        ...compileTimeStr.match(/Compiled.*? in ([\d.]{1,})\s?(?:s|ms)/i),
      ]
      const [, compileTime, timeUnit] = matches

      let compileTimeMs = parseFloat(compileTime)
      if (timeUnit === 's') {
        compileTimeMs = compileTimeMs * 1000
      }
      expect(compileTimeMs).toBeLessThan(3000)
    }
  )

  it('should reload the page when the server restarts', async () => {
    const browser = await next.browser(basePath + '/hmr/about')
    await retry(async () => {
      expect(await getBrowserBodyText(browser)).toMatch(
        /This is the about page/
      )
    })

    await next.stop()

    let reloadPromise = new Promise((resolve) => {
      browser.on('request', (req) => {
        if (req.url().endsWith('/hmr/about')) {
          resolve(req.url())
        }
      })
    })

    await next.start()

    await reloadPromise
  })

  it('should not replace the HMR socket when the page becomes visible while it is connecting', async () => {
    let hmrSocketCount = 0
    const browser = await next.browser(basePath + '/hmr/about', {
      async beforePageLoad(page) {
        page.on('websocket', (webSocket) => {
          if (webSocket.url().includes('/_next/hmr')) {
            hmrSocketCount++
          }
        })
        // Fire `visibilitychange` while the HMR WebSocket is still connecting,
        // as happens when a prerendered page is activated.
        await page.addInitScript(`(() => {
          const OriginalWebSocket = window.WebSocket
          let fired = false
          window.WebSocket = class extends OriginalWebSocket {
            constructor(...args) {
              super(...args)
              if (!fired && String(args[0]).includes('/_next/hmr')) {
                fired = true
                queueMicrotask(() => {
                  document.dispatchEvent(new Event('visibilitychange'))
                })
              }
            }
          }
        })()`)
      },
    })

    await retry(async () => {
      expect(await browser.log()).toContainEqual({
        source: 'log',
        message: '[HMR] connected',
      })
    })
    // A faulty client would replace the socket right away, and again after the
    // one second reconnect delay.
    await waitFor(2000)
    expect(hmrSocketCount).toBe(1)
  })
}
