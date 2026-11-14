import { FileRef, nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'
import path from 'path'

describe('app-dir HMR WebSocket reconnect', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
  })

  it('should not replace the socket when the page becomes visible while it is connecting', async () => {
    let hmrSocketCount = 0
    const browser = await next.browser('/', {
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
})
