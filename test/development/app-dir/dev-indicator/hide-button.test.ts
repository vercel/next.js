import { nextTestSetup } from 'e2e-utils'
import {
  waitForDevToolsIndicator,
  assertNoDevToolsIndicator,
  toggleDevToolsIndicatorPopover,
  waitFor,
  retry,
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

    await toggleDevToolsIndicatorPopover(browser)
    await browser.elementByCss('[data-preferences]').click()
    await browser.elementByCss('[data-hide-dev-tools]').click()

    await assertNoDevToolsIndicator(browser)
    expect(
      await browser.elementByCss('.indicator-visibility-notice').text()
    ).toContain('to show it')

    await next.stop()
    await next.start()

    const browser2 = await next.browser('/')
    await browser2.refresh()
    await waitForDevToolsIndicator(browser2)
  })

  it('should still hide the dev indicator after reloading the page', async () => {
    const browser = await next.browser('/')

    await toggleDevToolsIndicatorPopover(browser)
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

    await toggleDevToolsIndicatorPopover(browser)
    await browser.elementByCss('[data-preferences]').click()
    await browser.elementByCss('[data-hide-dev-tools]').click()

    await assertNoDevToolsIndicator(browser)

    // Wait for `__NEXT_DEV_INDICATOR_COOLDOWN` to pass.
    await waitFor(COOLDOWN)

    await browser.refresh()
    await waitForDevToolsIndicator(browser)
  })

  it('should visibly record a shortcut and let it toggle visibility immediately after saving', async () => {
    await next.stop()
    await next.start()
    const browser = await next.browser('/')
    await toggleDevToolsIndicatorPopover(browser)
    await browser.elementByCss('[data-preferences]').click()
    // The outgoing menu keeps its outside-click handler during its exit
    // animation. Wait for it to unmount before clicking inside Preferences.
    await retry(async () => {
      expect(await browser.hasElementByCssSelector('[data-preferences]')).toBe(
        false
      )
    })
    expect(
      await browser.elementByCss('.indicator-preference').text()
    ).toContain('Shortcut')
    await browser.elementByCss('.shortcut-recorder-button').click()
    expect(
      await browser.elementByCss('.shortcut-recorder-button').text()
    ).toContain('Press shortcut')

    async function pressShortcut() {
      await browser.keydown('Control')
      await browser.keydown('Shift')
      await browser.keydown('h')
      await browser.keyup('h')
      await browser.keyup('Shift')
      await browser.keyup('Control')
    }

    await pressShortcut()
    await retry(async () => {
      expect(
        await browser.elementByCss('.shortcut-recorder-status-message').text()
      ).toContain('Shortcut saved')
    })

    // A configuration update from another dev-server client must not replace
    // the locally recorded binding or pass arbitrary tokens to its renderer.
    const response = await next.fetch('/__nextjs_devtools_config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hideShortcut: '__proto__', theme: 'dark' }),
    })
    expect(response.status).toBe(204)
    await retry(async () => {
      expect(
        await browser.eval(() =>
          document.querySelector('nextjs-portal')?.classList.contains('dark')
        )
      ).toBe(true)
      expect(
        await browser.elementByCss('.shortcut-recorder-button').text()
      ).toContain('H')
    })

    // Recording must end after saving, even while the recorder retains focus.
    await pressShortcut()
    await retry(async () => {
      await assertNoDevToolsIndicator(browser)
    })
    expect(
      await browser.elementByCss('.indicator-visibility-notice').text()
    ).toContain('to show it')
    await pressShortcut()
    await waitForDevToolsIndicator(browser)
    await retry(async () => {
      expect(
        await browser.hasElementByCssSelector('.indicator-visibility-notice')
      ).toBe(false)
    })

    await toggleDevToolsIndicatorPopover(browser)
    await browser.elementByCss('[data-preferences]').click()
    await browser.elementByCss('[data-hide-dev-tools]').click()
    await assertNoDevToolsIndicator(browser)
    await browser.elementByCss('.indicator-visibility-notice button').click()
    await waitForDevToolsIndicator(browser)
    await browser.refresh()
    await waitForDevToolsIndicator(browser)

    // The local binding survives reload without a server-side preference.
    await pressShortcut()
    await assertNoDevToolsIndicator(browser)
    await pressShortcut()
    await waitForDevToolsIndicator(browser)
  })

  it('does not install a shortcut sent by another dev-server client', async () => {
    await next.stop()
    await next.start()
    const browser = await next.browser('/')
    await waitForDevToolsIndicator(browser)
    const response = await next.fetch('/__nextjs_devtools_config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hideShortcut: 'KeyJ', theme: 'light' }),
    })
    expect(response.status).toBe(204)
    await retry(async () => {
      expect(
        await browser.eval(() =>
          document.querySelector('nextjs-portal')?.classList.contains('light')
        )
      ).toBe(true)
    })
    await browser.keydown('j')
    await browser.keyup('j')
    await waitForDevToolsIndicator(browser)
  })
})
