import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type { Page } from 'playwright'

describe('early-navigation-metadata', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  function clickAsSoonAsHandlerIsAttached(page: Page) {
    page.addInitScript(() => {
      const descriptor = Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        'onclick'
      )
      if (descriptor?.set === undefined) {
        throw new Error('Missing native onclick setter')
      }

      const setOnclick = descriptor.set
      Object.defineProperty(HTMLElement.prototype, 'onclick', {
        ...descriptor,
        set(this: HTMLElement, handler: GlobalEventHandlers['onclick']) {
          setOnclick.call(this, handler)
          if (
            handler === null ||
            !(this instanceof HTMLAnchorElement) ||
            this.pathname !== '/guide'
          ) {
            return
          }
          Object.defineProperty(HTMLElement.prototype, 'onclick', descriptor)
          queueMicrotask(() => this.click())
        },
      })
    })
  }

  it('removes initial metadata after early navigation', async () => {
    const browser = await next.browser('/', {
      beforePageLoad: clickAsSoonAsHandlerIsAttached,
      waitHydration: false,
    })

    await retry(async () => {
      expect(await browser.elementByCss('h1').text()).toBe('Guide')
    })
    await retry(async () => {
      expect(
        await browser.eval(
          'document.querySelectorAll("link[rel=canonical]").length'
        )
      ).toBe(1)
      expect(
        await browser.eval('document.querySelector("link[rel=canonical]").href')
      ).toBe('https://example.test/guide')
    })
  })

  it('keeps one canonical after a loaded navigation', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('a[href="/guide"]').click()

    await retry(async () => {
      expect(await browser.elementByCss('h1').text()).toBe('Guide')
    })
    expect(
      await browser.eval(
        'document.querySelectorAll("link[rel=canonical]").length'
      )
    ).toBe(1)
    expect(
      await browser.eval('document.querySelector("link[rel=canonical]").href')
    ).toBe('https://example.test/guide')
  })
})
