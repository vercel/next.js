import { createNext, FileRef } from 'e2e-utils'
import webdriver from 'next-webdriver'
import { NextInstance } from 'test/lib/next-modes/base'
import { join } from 'path'
import { BrowserInterface } from 'test/lib/browsers/base'
import { check } from 'next-test-utils'

describe('client-dev-overlay', () => {
  let next: NextInstance
  let browser: BrowserInterface

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'app/pages')),
      },
    })
  })
  beforeEach(async () => {
    browser = await webdriver(next.url, '')
  })
  afterAll(() => next.destroy())

  // The `BrowserInterface.hasElementByCssSelector` cannot be used for elements inside a shadow DOM.
  function elementExistsInNextJSPortalShadowDOM(selector: string) {
    return browser.eval(
      `!!document.querySelector('nextjs-portal').shadowRoot.querySelector('${selector}')`
    ) as any
  }
  const selectors = {
    fullScreenDialog: '[data-nextjs-dialog]',
    toast: '[data-nextjs-toast]',
    minimizeButton: '[data-nextjs-errors-dialog-left-right-close-button]',
    hideButton: '[data-nextjs-toast-errors-hide-button]',
  }
  function getToast() {
    return browser.elementByCss(selectors.toast)
  }
  function getMinimizeButton() {
    return browser.elementByCss(selectors.minimizeButton)
  }
  function getHideButton() {
    return browser.elementByCss(selectors.hideButton)
  }

  it('should be able to fullscreen the minimized overlay', async () => {
    await getMinimizeButton().click()
    await getToast().click()

    await check(async () => {
      return (await elementExistsInNextJSPortalShadowDOM(
        selectors.fullScreenDialog
      ))
        ? 'success'
        : 'missing'
    }, 'success')
  })

  it('should be able to minimize the fullscreen overlay', async () => {
    await getMinimizeButton().click()
    expect(await elementExistsInNextJSPortalShadowDOM(selectors.toast)).toBe(
      true
    )
  })

  it('should be able to hide the minimized overlay', async () => {
    await getMinimizeButton().click()
    await getHideButton().click()

    await check(async () => {
      const exists = await elementExistsInNextJSPortalShadowDOM('div')
      return exists ? 'found' : 'success'
    }, 'success')
  })

  it('should have a role of "dialog" if the page is focused', async () => {
    await check(async () => {
      return (await elementExistsInNextJSPortalShadowDOM('[role="dialog"]'))
        ? 'exists'
        : 'missing'
    }, 'exists')
  })
})
