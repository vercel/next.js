import { FileRef } from 'e2e-utils'
import { Playwright } from 'next-webdriver'
import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { assertHasDevToolsIndicator, retry } from 'next-test-utils'

describe('client-dev-overlay', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: {
      pages: new FileRef(join(__dirname, 'pages')),
    },
    env: {
      // Disable the cooldown period for the dev indicator so that hiding the indicator in a test doesn't
      // impact subsequent tests.
      __NEXT_DEV_INDICATOR_COOLDOWN_MS: '0',
    },
  })

  // The `Playwright.hasElementByCssSelector` cannot be used for elements inside a shadow DOM.
  function elementExistsInNextJSPortalShadowDOM(
    browser: Playwright,
    selector: string
  ) {
    return browser.eval(
      `!!document.querySelector('nextjs-portal').shadowRoot.querySelector('${selector}')`
    ) as any
  }
  const selectors = {
    fullScreenDialog: '[data-nextjs-dialog]',
    toast: '[data-nextjs-toast]',
    popover: '[data-nextjs-dev-tools-button]',
    indicator: '[data-next-badge-root]',
    minimizeButton: 'body',
    preferencesButton: '[data-preferences]',
    hideButton: '[data-hide-dev-tools]',
  }
  function getToast(browser: Playwright) {
    return browser.elementByCss(selectors.toast)
  }
  function getPopover(browser: Playwright) {
    return browser.elementByCss(selectors.popover)
  }
  function getMinimizeButton(browser: Playwright) {
    return browser.elementByCss(selectors.minimizeButton)
  }
  function getHideButton(browser: Playwright) {
    return browser.elementByCss(selectors.hideButton)
  }
  function getPreferencesButton(browser: Playwright) {
    return browser.elementByCss(selectors.preferencesButton)
  }

  it('should be able to fullscreen the minimized overlay', async () => {
    const browser = await next.browser('/')
    await getMinimizeButton(browser).click()
    await getToast(browser).click()

    await retry(async () => {
      expect(
        await elementExistsInNextJSPortalShadowDOM(
          browser,
          selectors.fullScreenDialog
        )
      ).toBe(true)
    })
  })

  it('should be able to minimize the fullscreen overlay', async () => {
    const browser = await next.browser('/')
    await getMinimizeButton(browser).click()
    expect(
      await elementExistsInNextJSPortalShadowDOM(browser, selectors.toast)
    ).toBe(true)
  })

  it('should keep the error indicator visible when there are errors', async () => {
    const browser = await next.browser('/')
    await getMinimizeButton(browser).click()
    await getPopover(browser).click()
    await getPreferencesButton(browser).click()
    await getHideButton(browser).click()

    await retry(async () => {
      const display = await browser.eval(
        `getComputedStyle(document.querySelector('nextjs-portal').shadowRoot.querySelector('${selectors.indicator}')).display`
      )
      expect(display).toBe('block')
    })
  })

  it('should be possible to hide the minimized overlay when there are no errors', async () => {
    const browser = await next.browser('/')
    const originalContent = await next.readFile('pages/index.js')
    try {
      await next.patchFile('pages/index.js', (content) => {
        return content.replace(`throw Error('example runtime error')`, '')
      })

      await getMinimizeButton(browser).click()
      await getPopover(browser).click()
      await getPreferencesButton(browser).click()
      await getHideButton(browser).click()

      await retry(async () => {
        const display = await browser.eval(
          `getComputedStyle(document.querySelector('nextjs-portal').shadowRoot.querySelector('${selectors.indicator}')).display`
        )
        expect(display).toBe('none')
      })
    } finally {
      await next.patchFile('pages/index.js', originalContent)
    }
  })

  it('should have a role of "dialog" if the page is focused', async () => {
    const browser = await next.browser('/')
    await retry(async () => {
      expect(
        await elementExistsInNextJSPortalShadowDOM(browser, '[role="dialog"]')
      ).toBe(true)
    })
  })

  it('should nudge to use Turbopack unless Turbopack is disabled', async () => {
    const browser = await next.browser('/')

    // Don't use openDevToolsIndicatorPopover because this is asserting something in the old dev tools menu which isn't preset yet in the new UI.
    const devToolsIndicator = await assertHasDevToolsIndicator(browser)
    try {
      await devToolsIndicator.click()
    } catch (cause) {
      const error = new Error('No DevTools Indicator to open.', { cause })
      throw error
    }

    const devtoolsMenu = await browser.elementByCss('#nextjs-dev-tools-menu')
    if (isTurbopack) {
      expect(await devtoolsMenu.innerText()).toMatchInlineSnapshot(`
       "Issues
       1
       Route
       Static
       Turbopack
       Enabled
       Preferences"
      `)
    } else {
      expect(await devtoolsMenu.innerText()).toMatchInlineSnapshot(`
       "Issues
       1
       Route
       Static
       Try Turbopack
       Preferences"
      `)
    }
  })
})

describe('client-dev-overlay with Cache Components', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: {
      pages: new FileRef(join(__dirname, 'pages')),
      'next.config.js': `
        module.exports = {
          cacheComponents: true,
        }
      `,
    },
    env: {
      __NEXT_DEV_INDICATOR_COOLDOWN_MS: '0',
    },
  })

  it('should show Cache Components as enabled in the devtools menu', async () => {
    const browser = await next.browser('/')

    const devToolsIndicator = await assertHasDevToolsIndicator(browser)
    try {
      await devToolsIndicator.click()
    } catch (cause) {
      const error = new Error('No DevTools Indicator to open.', { cause })
      throw error
    }

    const devtoolsMenu = await browser.elementByCss('#nextjs-dev-tools-menu')
    const menuText = await devtoolsMenu.innerText()

    // Should include Cache Components
    expect(menuText).toContain('Cache Components')
    expect(menuText).toContain('Enabled')

    // Should also include Turbopack info
    if (isTurbopack) {
      expect(menuText).toMatchInlineSnapshot(`
       "Issues
       1
       Route
       Static
       Turbopack
       Enabled
       Cache Components
       Enabled
       Preferences"
      `)
    } else {
      expect(menuText).toMatchInlineSnapshot(`
       "Issues
       1
       Route
       Static
       Try Turbopack
       Cache Components
       Enabled
       Preferences"
      `)
    }
  })
})
