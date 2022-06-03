import { createNext, FileRef } from 'e2e-utils'
import webdriver from 'next-webdriver'
import { NextInstance } from 'test/lib/next-modes/base'
import { join } from 'path'
import { BrowserInterface } from 'test/lib/browsers/base'
import { retry } from 'next-test-utils'

describe('client-dev-overlay', () => {
  let next: NextInstance
  let browser: BrowserInterface

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'app/pages')),
      },
      // This test only applies to development builds, not production builds.
      startCommand: 'yarn next',
    })
  })
  beforeEach(async () => {
    browser = await webdriver(next.url, '')
  })
  afterAll(() => next.destroy())

  // The `BrowserInterface.hasElementByCssSelector` cannot be used for elements inside a shadow DOM.
  async function elementExistsInNextJSPortalShadowDOM(selector: string) {
    return browser.eval(
      `!!document.querySelector('nextjs-portal').shadowRoot.querySelector('${selector}')`
    ) as any
  }

  async function getFullscreenDialog() {
    const selector = '[data-nextjs-dialog]'
    browser.waitForElementByCss(selector)
    const exists = await elementExistsInNextJSPortalShadowDOM(selector)

    return {
      element: browser.elementByCss(selector),
      exists,
    }
  }

  async function getToast() {
    const selector = '[data-nextjs-toast]'
    await browser.waitForElementByCss(selector)

    const exists = await elementExistsInNextJSPortalShadowDOM(selector)

    return { element: browser.elementByCss(selector), exists }
  }

  async function getMinimizeButton() {
    const selector = '[data-nextjs-errors-dialog-left-right-close-button]'
    await browser.waitForElementByCss(selector)

    const exists = await elementExistsInNextJSPortalShadowDOM(selector)

    return { element: browser.elementByCss(selector), exists }
  }

  async function getHideButton() {
    const selector = '[data-nextjs-toast-errors-hide-button]'
    await browser.waitForElementByCss(selector)

    const exists = await elementExistsInNextJSPortalShadowDOM(selector)

    return { element: browser.elementByCss(selector), exists }
  }

  it('should be able to fullscreen the minimized overlay', async () => {
    const { element: minimizeButton } = await getMinimizeButton()
    minimizeButton.click()
    const { element: toast } = await getToast()
    toast.click()

    await retry(
      async () => {
        const { exists: fullscreenOverlayExists } = await getFullscreenDialog()
        expect(fullscreenOverlayExists).toBe(true)
      },
      3000,
      1000
    )
  })

  it('should be able to minimize the fullscreen overlay', async () => {
    const { element: minimizeButton } = await getMinimizeButton()
    minimizeButton.click()

    const { exists: toastExists } = await getToast()

    expect(toastExists).toBe(true)
  })

  it('should be able to hide the minimized overlay', async () => {
    const { element: minimizeButton } = await getMinimizeButton()
    minimizeButton.click()
    const { element: hideButton } = await getHideButton()
    hideButton.click()

    await retry(async () => {
      expect(await elementExistsInNextJSPortalShadowDOM('div')).toBe(false)
    })
  })
})
