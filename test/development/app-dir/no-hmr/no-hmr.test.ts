import { nextTestSetup } from 'e2e-utils'
import { openRedbox, retry, waitFor, waitForRedbox } from 'next-test-utils'
import type * as Playwright from 'playwright'

describe('no-hmr', () => {
  const { next, isTurbopack, isNextDev } = nextTestSetup({
    files: __dirname,
    startArgs: ['--no-hmr'],
  })

  if (!isNextDev) {
    it('should be skipped in production', () => {})
    return
  }

  function trackHmrWebSocket(state: { opened: boolean }) {
    return {
      beforePageLoad(page: Playwright.Page) {
        page.on('websocket', (ws) => {
          if (ws.url().includes('/_next/hmr')) {
            state.opened = true
          }
        })
      },
    }
  }

  if (!isTurbopack) {
    it('warns that --no-hmr is Turbopack-only and keeps HMR enabled', async () => {
      const webSocketState = { opened: false }
      const browser = await next.browser('/', trackHmrWebSocket(webSocketState))

      expect(await browser.elementByCss('#content').text()).toBe(
        'app content v1'
      )
      expect(next.cliOutput).toContain(
        'The CLI flag "--no-hmr" is only supported with Turbopack and will be ignored.'
      )

      // HMR stays enabled, so the websocket is still connected.
      await retry(async () => {
        expect(webSocketState.opened).toBe(true)
      })
    })

    return
  }

  it('keeps the dev websocket connected', async () => {
    const webSocketState = { opened: false }
    const browser = await next.browser('/', trackHmrWebSocket(webSocketState))

    expect(await browser.elementByCss('#content').text()).toBe('app content v1')

    // The websocket stays connected (for the error overlay, log forwarding,
    // MCP requests, etc.) — only HMR updates are never applied.
    await retry(async () => {
      expect(webSocketState.opened).toBe(true)
    })
  })

  it('requires a manual refresh to reflect file changes', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#content').text()).toBe('app content v1')

    await next.patchFile(
      'app/page.tsx',
      (content) => content!.replace('app content v1', 'app content v2'),
      async () => {
        // A fresh request compiles on demand and serves the new content ...
        await retry(async () => {
          expect(await next.render('/')).toContain('app content v2')
        })

        // ... but the already-open browser is not updated, despite the
        // connected websocket. Give any (unwanted) update a moment to apply
        // before asserting.
        await waitFor(2000)
        expect(await browser.elementByCss('#content').text()).toBe(
          'app content v1'
        )

        // A manual refresh shows the new content.
        await browser.refresh()
        await retry(async () => {
          expect(await browser.elementByCss('#content').text()).toBe(
            'app content v2'
          )
        })
      }
    )
  })

  it('does not serve React Refresh or HMR chunk registrations', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#content').text()).toBe('app content v1')

    const scripts: string[] = await browser.eval(
      `Array.from(document.querySelectorAll('script[src]')).map((s) => s.getAttribute('src'))`
    )
    expect(scripts.length).toBeGreaterThan(0)

    for (const src of scripts) {
      const text = await next.fetch(src).then((res) => res.text())

      // The react-refresh runtime entry is not injected. (Match on the
      // implementation rather than the package name, which can also appear
      // in unrelated module path strings.)
      expect(text).not.toContain('performReactRefresh')

      // No HMR chunk list register chunks are emitted. (The generic dev
      // runtime still contains the registration *handler*, so we assert on
      // the register call shape emitted per chunk group instead.)
      expect(text).not.toContain('_CHUNK_LISTS"] = [])).push(')
    }
  })

  it('shows build errors on a manual refresh', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#content').text()).toBe('app content v1')

    await next.patchFile(
      'app/page.tsx',
      (content) => content!.replace('return', 'return syntax error'),
      async () => {
        // A fresh request compiles the broken page on demand and responds
        // with the dev error page.
        await retry(async () => {
          const { status } = await next.fetch('/')
          expect(status).toBe(500)
        })

        await browser.refresh()
        await waitForRedbox(browser)

        expect(next.cliOutput).toContain(
          'Parsing ecmascript source code failed'
        )
      }
    )
  })

  it('still surfaces runtime errors in the dev overlay', async () => {
    const browser = await next.browser('/runtime-error')

    await browser.elementByCss('#trigger-runtime-error').click()
    // App router runtime errors surface as an issue badge on the DevTools
    // indicator; opening it shows the error overlay.
    await openRedbox(browser)

    expect(
      await browser.eval(
        `document.querySelector('nextjs-portal').shadowRoot.textContent`
      )
    ).toContain('no-hmr runtime error')
  })

  it('requires a manual refresh for the pages router', async () => {
    const webSocketState = { opened: false }
    const browser = await next.browser(
      '/legacy',
      trackHmrWebSocket(webSocketState)
    )

    expect(await browser.elementByCss('#legacy-content').text()).toBe(
      'legacy content v1'
    )

    await retry(async () => {
      expect(webSocketState.opened).toBe(true)
    })

    await next.patchFile(
      'pages/legacy.tsx',
      (content) => content!.replace('legacy content v1', 'legacy content v2'),
      async () => {
        await retry(async () => {
          expect(await next.render('/legacy')).toContain('legacy content v2')
        })

        await waitFor(2000)
        expect(await browser.elementByCss('#legacy-content').text()).toBe(
          'legacy content v1'
        )

        await browser.refresh()
        await retry(async () => {
          expect(await browser.elementByCss('#legacy-content').text()).toBe(
            'legacy content v2'
          )
        })
      }
    )
  })
})
