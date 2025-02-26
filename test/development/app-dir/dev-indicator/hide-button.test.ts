import { nextTestSetup } from 'e2e-utils'
import {
  assertHasDevToolsIndicator,
  assertNoDevToolsIndicator,
  openDevToolsIndicatorPopover,
  waitFor,
} from 'next-test-utils'

const COOLDOWN = 3000

describe('dev indicator - Hide DevTools Button', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: {
      __NEXT_DEV_INDICATOR_COOLDOWN_MS: `${COOLDOWN}`,
    },
  })

  it('should show the dev indicator when the server is manually restarted', async () => {
    const browser = await next.browser('/')

    await openDevToolsIndicatorPopover(browser)
    await browser.elementByCss('[data-preferences]').click()
    await browser.elementByCss('[data-hide-dev-tools]').click()

    await assertNoDevToolsIndicator(browser)

    await next.stop()
    await next.start()

    const browser2 = await next.browser('/')
    await browser2.refresh()
    await assertHasDevToolsIndicator(browser2)
  })

  it('should still hide the dev indicator after reloading the page', async () => {
    const browser = await next.browser('/')

    await openDevToolsIndicatorPopover(browser)
    await browser.elementByCss('[data-preferences]').click()
    await browser.elementByCss('[data-hide-dev-tools]').click()

    await assertNoDevToolsIndicator(browser)
    await browser.refresh()
    // Still hidden after reload
    await assertNoDevToolsIndicator(browser)
  })

  it('should show the dev indicator after cooldown period has passed', async () => {
    await next.stop()
    await next.start()

    const browser = await next.browser('/')

    await openDevToolsIndicatorPopover(browser)
    await browser.elementByCss('[data-preferences]').click()
    await browser.elementByCss('[data-hide-dev-tools]').click()

    await assertNoDevToolsIndicator(browser)

    // Wait for `__NEXT_DEV_INDICATOR_COOLDOWN` to pass.
    await waitFor(COOLDOWN)

    await browser.refresh()
    await assertHasDevToolsIndicator(browser)
  })
})
