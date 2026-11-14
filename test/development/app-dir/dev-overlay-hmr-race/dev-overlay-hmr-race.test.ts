import { nextTestSetup } from 'e2e-utils'
import {
  getRedboxDescription,
  openRedbox,
  retry,
} from '../../../lib/next-test-utils'

// Delay applying webpack hot updates. This widens the window between a rebuild
// starting and the Fast Refresh at the end of it, which reliably reproduces a
// race that is otherwise timing-dependent.
const HOT_UPDATE_DELAY_MS = 1500

describe('dev-overlay-hmr-race', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  async function softNavigateToUncompiledRoute(href: string, id: string) {
    const browser = await next.browser('/', {
      async beforePageLoad(page) {
        // Not using `page.route()`, because intercepting requests disables the
        // browser cache, which makes Next.js bypass server caches and skip
        // instant validation.
        await page.addInitScript((delayMs) => {
          const originalFetch = window.fetch
          window.fetch = async (input, init) => {
            const url = input instanceof Request ? input.url : String(input)
            if (url.includes('.hot-update.json')) {
              await new Promise((resolve) => setTimeout(resolve, delayMs))
            }
            return originalFetch(input, init)
          }
        }, HOT_UPDATE_DELAY_MS)
      },
    })
    const logCountBeforeNavigation = (await browser.log()).length

    // The target route hasn't been compiled yet, so the navigation triggers an
    // on-demand rebuild, which is followed by a Fast Refresh.
    await browser.elementByCss(`a[href="${href}"]`).click()
    await browser.waitForElementByCss(`#${id}`, 20_000)

    if (!isTurbopack) {
      // Errors that the server reports for the navigation must survive the
      // Fast Refresh, so only start looking for them once it's done.
      await retry(
        async () => {
          const logs = (await browser.log()).slice(logCountBeforeNavigation)
          expect(logs).toContainEqual(
            expect.objectContaining({
              message: expect.stringContaining('[Fast Refresh] done'),
            })
          )
        },
        20_000,
        500,
        'wait for Fast Refresh'
      )
    }

    return browser
  }

  it('shows instant validation errors reported via HMR during a rebuild', async () => {
    const browser = await softNavigateToUncompiledRoute(
      '/instant-validation-error',
      'instant-validation-error'
    )

    await openRedbox(browser)
    expect(await getRedboxDescription(browser)).toContain(
      'Next.js encountered uncached data'
    )
  })

  it('shows server console errors replayed from the navigation response during a rebuild', async () => {
    const browser = await softNavigateToUncompiledRoute(
      '/replayed-console-error',
      'replayed-console-error'
    )

    await openRedbox(browser)
    expect(await getRedboxDescription(browser)).toContain(
      'replayed server console error'
    )
  })
})
