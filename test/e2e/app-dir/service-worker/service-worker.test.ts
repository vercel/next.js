import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('app-dir - service worker (single-chunk)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('serves /service-worker.js at the root scope', async () => {
    const res = await next.fetch('/service-worker.js')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('javascript')
  })

  it('inlines the dynamically-imported helper into the single bundle', async () => {
    const res = await next.fetch('/service-worker.js')
    const body = await res.text()

    // The helper reached via `import('./sw-helper')` is inlined into the single
    // file rather than emitted as a separately-fetched chunk. If it weren't
    // inlined, this string would live in a different file.
    expect(body).toContain('hello from sw helper')

    // The dynamic import compiles to the synchronous single-chunk mapping
    // (`Promise.resolve().then(...)`), not an async chunk loader.
    expect(body).toContain('Promise.resolve().then')
  })

  it('registers the compiled service worker and intercepts a request at runtime', async () => {
    const browser = await next.browser('/')

    // Make sure the page actually loaded before we touch the SW API. Loading the
    // page is enough to trigger registration: the app renders the
    // `<RegisterServiceWorker />` client component, whose `useEffect` calls
    // `navigator.serviceWorker.register('/service-worker.js')`. The test never
    // registers the SW itself — it only awaits and asserts.
    expect(await browser.elementByCss('#home').text()).toBe(
      'service worker test home'
    )

    // 1. Wait until the app-registered service worker is activated. `.eval`
    //    swallows thrown errors (returning null), so this function never throws
    //    and instead reports a status string we can assert on / poll.
    await retry(async () => {
      const status = await browser.eval(async () => {
        if (!('serviceWorker' in navigator)) {
          return 'no-serviceWorker-api'
        }
        try {
          // `ready` resolves once there is an active registration controlling
          // this scope. The registration is performed by the app's
          // `<RegisterServiceWorker />` component, not by this test.
          const reg = await navigator.serviceWorker.ready
          return reg.active ? 'active' : 'registered-not-active'
        } catch (err) {
          return 'ready-error: ' + (err && err.message)
        }
      })
      expect(status).toBe('active')
    })

    // 2. The SW calls `clients.claim()` on activate, but a page that was already
    //    loaded before the SW activated may not be controlled yet. Reload so the
    //    freshly-loaded page is guaranteed to be claimed by the active SW, then
    //    confirm `navigator.serviceWorker.controller` is set.
    await retry(async () => {
      await browser.refresh()
      const controlled = await browser.eval(
        () => !!navigator.serviceWorker.controller
      )
      expect(controlled).toBe(true)
    })

    // 3. Now that the page is controlled, a fetch for the sentinel path must be
    //    answered by the SW's `fetch` handler. There is no Next.js route for
    //    `/__sw_intercepted__`, so this exact body can only come from the SW.
    await retry(async () => {
      const body = await browser.eval(async () => {
        try {
          const res = await fetch('/__sw_intercepted__')
          return await res.text()
        } catch (err) {
          return 'fetch-error: ' + (err && err.message)
        }
      })
      expect(body).toBe('intercepted-by-service-worker')
    })
  })
})
