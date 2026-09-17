import { nextTestSetup, Playwright } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'

describe('pages-hmr-reconnect', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    patchFileDelay: 500,
  })

  it('does not reconnect in a loop when the page becomes visible while the HMR socket is still connecting', async () => {
    const componentPath = 'pages/index.tsx'
    const originalComponent = await next.readFile(componentPath)
    let hmrConnections = 0
    let releaseFirstConnection = () => {}
    const firstConnectionReleased = new Promise<void>((resolve) => {
      releaseFirstConnection = resolve
    })

    const getHmrValue = (browser: Playwright<unknown>) =>
      browser.eval(`document.querySelector('#hmr-value')?.textContent`)
    const hasConnectedLog = async (browser: Playwright<unknown>) =>
      (await browser.log()).some((entry) =>
        entry.message.includes('[HMR] connected')
      )

    try {
      const browser = await next.browser('/', {
        async beforePageLoad(page) {
          await page.routeWebSocket(/\/_next\/hmr/, async (clientSocket) => {
            hmrConnections++
            if (hmrConnections === 1) {
              await firstConnectionReleased
            }
            clientSocket.connectToServer()
          })
        },
      })

      await retry(async () => {
        expect(await getHmrValue(browser)).toBe('Initial')
      })
      expect(hmrConnections).toBe(1)
      expect(await hasConnectedLog(browser)).toBe(false)

      await browser.eval(() => {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => 'visible',
        })
        document.dispatchEvent(new Event('visibilitychange'))
      })

      await waitFor(2500)
      expect(hmrConnections).toBe(1)

      releaseFirstConnection()
      await retry(async () => {
        expect(await hasConnectedLog(browser)).toBe(true)
      })

      await next.patchFile(
        componentPath,
        originalComponent.replace('Initial', 'Visible edit')
      )
      await retry(async () => {
        expect(await getHmrValue(browser)).toBe('Visible edit')
      }, 10_000)
      expect(hmrConnections).toBe(1)
    } finally {
      await next.patchFile(componentPath, originalComponent)
    }
  })
})
