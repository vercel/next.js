import { nextTestSetup } from 'e2e-utils'
import { retry, waitForStaticIndicator } from 'next-test-utils'

describe('pages-hmr-isr-manifest-before-router', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should handle the ISR manifest arriving before the router is created', async () => {
    // Compile the page up front so the browser load below is not dominated by
    // on-demand compilation.
    await next.render('/')

    const warnings: string[] = []
    let pageChunkHeldUntilManifest = false

    const browser = await next.browser('/', {
      async beforePageLoad(page) {
        page.on('console', (msg) => {
          if (msg.type() === 'warning') {
            warnings.push(msg.text())
          }
        })

        // The server sends the ISR manifest as soon as the HMR socket connects.
        let manifestReceived = false
        page.on('websocket', (ws) => {
          ws.on('framereceived', ({ payload }) => {
            if (String(payload).includes('"type":"isrManifest"')) {
              manifestReceived = true
            }
          })
        })

        // Hold back the page entry chunk until the ISR manifest has been
        // received. The router is only created once the page entry has loaded,
        // so this deterministically delivers the manifest before the router
        // exists.
        await page.route(
          (url) =>
            url.pathname.includes('/_next/static/chunks/') &&
            // webpack: pages/index.js, Turbopack: pages_index_<hash>.js
            /pages[/_]index[._]/.test(url.pathname),
          async (route) => {
            try {
              await retry(async () => {
                expect(manifestReceived).toBe(true)
              })
              pageChunkHeldUntilManifest = true
            } catch {
              // Reported by the `pageChunkHeldUntilManifest` assertion below.
            } finally {
              // Always let the page load, even if the manifest wasn't observed.
              await route.continue()
            }
          }
        )
      },
    })

    expect(await browser.elementByCss('p').text()).toBe('hello world')
    expect(pageChunkHeldUntilManifest).toBe(true)
    expect(
      warnings.filter((warning) => warning.includes('[HMR] Invalid message'))
    ).toEqual([])
    // The static indicator still reflects the page once the router exists.
    await waitForStaticIndicator(browser, 'Dynamic')
  })
})
