import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type * as Playwright from 'playwright'

// Must match the marker rendered by `app/global-error.tsx`.
const GATE_MARKER = '__hmr_refresh_before_hydration_gate__'

// The HMR WebSocket connects before the App Router is initialized (see
// `client/app-index.tsx`). A server component change reported in that window
// must still be applied once the router is up, instead of being dropped.
//
// To hold the page in that window deterministically, the test stalls the
// script chunk of `app/global-error.tsx`. The initial Flight payload
// references the global error component as a value, which blocks the payload
// until its chunk loads, so the App Router can't render (and install its
// dispatch) until the chunk is released. (A client component rendered as an
// element wouldn't do: element references are lazy and don't block the
// payload.) The main app runtime, which opens the WebSocket, is not stalled.
describe('hmr-refresh-before-hydration', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Records the HMR socket's state and text messages so the test can tell
  // when the server's change notification has reached the browser. Kept as a
  // source string so it runs in the page exactly as written (not transpiled).
  const observeHmrSocket = `
    (() => {
      const NativeWebSocket = window.WebSocket
      window.__hmrOpen = false
      window.__hmrMessages = []
      window.WebSocket = class extends NativeWebSocket {
        constructor(url, protocols) {
          super(url, protocols)
          if (String(url).includes('/_next/hmr')) {
            this.addEventListener('open', () => {
              window.__hmrOpen = true
            })
            this.addEventListener('message', (event) => {
              if (typeof event.data === 'string') {
                window.__hmrMessages.push(event.data)
              }
            })
          }
        }
      }
    })()
  `

  async function stallGatedChunk(page: Playwright.Page) {
    let release!: () => void
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    const state = { stalled: false }
    const handler = async (route: Playwright.Route) => {
      if (route.request().resourceType() !== 'script') {
        return route.continue()
      }
      const response = await route.fetch()
      const body = await response.text()
      if (body.includes(GATE_MARKER)) {
        state.stalled = true
        await released
      }
      await route.fulfill({ response, body })
    }
    await page.route('**/_next/static/**', handler)
    return {
      state,
      release,
      async dispose() {
        release()
        await page.unroute('**/_next/static/**', handler)
      },
    }
  }

  function countServerComponentChanges(page: Playwright.Page) {
    return page.evaluate(
      () =>
        (window as any).__hmrMessages.filter((data: string) =>
          data.includes('"serverComponentChanges"')
        ).length as number
    )
  }

  it('applies server component changes reported before the router is initialized', async () => {
    let page: Playwright.Page | undefined
    let gate: Awaited<ReturnType<typeof stallGatedChunk>> | undefined
    const consoleMessages: string[] = []
    const originalPage = await next.readFile('app/page.tsx')

    try {
      const browser = await next.browser('/', {
        waitUntil: 'commit',
        waitHydration: false,
        async beforePageLoad(p: Playwright.Page) {
          page = p
          page.on('console', (msg) => consoleMessages.push(msg.text()))
          page.on('pageerror', (err) => consoleMessages.push(String(err)))
          await page.addInitScript({ content: observeHmrSocket })
          gate = await stallGatedChunk(page)
        },
      })
      const p = page!
      const g = gate!

      await p.waitForFunction(() => (window as any).__hmrOpen === true)
      await retry(() => expect(g.state.stalled).toBe(true))
      // Detects a full reload, which would also show the new content.
      await p.evaluate(() => {
        ;(window as any).__stayed = true
      })

      // Report two changes while the router is still blocked, so the early
      // refresh requests have to be coalesced.
      for (const [index, text] of ['after-1', 'after-2'].entries()) {
        await next.patchFile('app/page.tsx', (content) =>
          content!.replace(/>[^<]*</, `>${text}<`)
        )
        await retry(async () => {
          expect(await countServerComponentChanges(p)).toBeGreaterThan(index)
        }, 10_000)
      }

      g.release()

      await retry(async () => {
        expect(await browser.elementByCss('#content').text()).toBe('after-2')
      }, 10_000)
      expect(await browser.eval('window.__stayed')).toBe(true)

      expect(consoleMessages).not.toContainEqual(
        expect.stringContaining(
          'Router action dispatched before initialization'
        )
      )
      expect(consoleMessages).not.toContainEqual(
        expect.stringContaining('deferred HMR refresh')
      )
    } finally {
      await gate?.dispose()
      await next.patchFile('app/page.tsx', originalPage)
    }
  })
})
