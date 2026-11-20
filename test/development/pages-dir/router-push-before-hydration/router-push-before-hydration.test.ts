import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type * as Playwright from 'playwright'

// `window.next.router` exists before the initial render starts: in
// development, `hydrate()` waits for an animation frame (`displayContent`)
// after creating the router. A route change that finishes in that window must
// not render first, or it hydrates the server HTML with the next page's props.
//
// The test holds animation frames to keep the page in that window, so it waits
// with interval polling instead of Playwright's default animation-frame polling.
describe('router-push-before-hydration', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  const holdAnimationFrames = `
    (() => {
      const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window)
      let held = []
      window.requestAnimationFrame = (callback) => {
        if (!held) return nativeRequestAnimationFrame(callback)
        held.push(callback)
        return 0
      }
      window.__releaseAnimationFrames = () => {
        const callbacks = held
        held = null
        callbacks.forEach((callback) => nativeRequestAnimationFrame(callback))
      }
    })()
  `

  it('renders a route change requested before hydration after the initial page hydrates', async () => {
    let page: Playwright.Page | undefined
    const messages: string[] = []

    const browser = await next.browser('/a', {
      waitHydration: false,
      async beforePageLoad(p: Playwright.Page) {
        page = p
        page.on('console', (msg) => messages.push(msg.text()))
        page.on('pageerror', (err) => messages.push(String(err)))
        await page.addInitScript({ content: holdAnimationFrames })
      },
    })
    const p = page!

    await p.waitForFunction(() => !!(window as any).next?.router, undefined, {
      polling: 50,
    })
    await p.evaluate(() => {
      ;(window as any).next.router.push('/b')
    })
    // The router updates the URL once `/b`'s data has loaded, just before it
    // renders the new route.
    await p.waitForFunction(() => location.pathname === '/b', undefined, {
      polling: 50,
    })
    await p.evaluate(() => (window as any).__releaseAnimationFrames())

    await retry(async () => {
      expect(await browser.elementByCss('#value').text()).toBe('b')
    })
    expect(messages).not.toContainEqual(
      expect.stringContaining('Hydration failed')
    )
  })
})
