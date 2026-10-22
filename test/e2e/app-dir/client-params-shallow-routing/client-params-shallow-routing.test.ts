import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type { Playwright } from 'next-webdriver'

describe('client-params-shallow-routing', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function waitForRenderedQuery(browser: Playwright, q: string) {
    await retry(async () => {
      expect(await browser.elementByCss('#rendered-q').text()).toBe(q)
    })
  }

  // Each keystroke writes the URL with replaceState.
  async function typeIntoInput(browser: Playwright) {
    await browser.elementByCss('#input').type('abc')
    await waitForRenderedQuery(browser, 'abc')
  }

  // Enter writes the URL with pushState. Unlike clicking a button, this keeps
  // the focus on the input.
  async function pushState(browser: Playwright) {
    await browser.keydown('Enter').keyup('Enter')
    await waitForRenderedQuery(browser, 'pushed')
  }

  // If the page suspends, the nearest Suspense fallback hides the input, so it
  // loses focus and the rest of the keystrokes are dropped.
  async function expectInputToKeepFocus(browser: Playwright) {
    expect(await browser.elementByCss('#input').getValue()).toBe('abc')
    expect(await browser.eval('document.activeElement.id')).toBe('input')
  }

  async function expectNoSyncAccessWarning(browser: Playwright) {
    expect(await browser.log()).not.toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining(
          'nextjs.org/docs/messages/sync-dynamic-apis'
        ),
      })
    )
  }

  describe('use(params) in a client page', () => {
    it('should not suspend on replaceState', async () => {
      const browser = await next.browser('/page-params/1')
      await typeIntoInput(browser)
      await expectInputToKeepFocus(browser)
      expect(await browser.elementByCss('#id').text()).toBe('1')
    })

    it('should not suspend on pushState', async () => {
      const browser = await next.browser('/page-params/1')
      await typeIntoInput(browser)
      await pushState(browser)
      await expectInputToKeepFocus(browser)
      expect(await browser.elementByCss('#id').text()).toBe('1')
    })

    it('should not warn about sync access when a param shares a name with a field of the promise', async () => {
      const browser = await next.browser('/param-named-value/1')
      await typeIntoInput(browser)
      await pushState(browser)
      expect(await browser.elementByCss('#value').text()).toBe('1')
      await expectNoSyncAccessWarning(browser)
    })
  })

  describe('use(searchParams) in a client page', () => {
    it('should not suspend on replaceState', async () => {
      const browser = await next.browser('/page-search-params')
      await typeIntoInput(browser)
      await expectInputToKeepFocus(browser)
      expect(await browser.elementByCss('#q').text()).toBe('abc')
    })

    it('should not suspend on pushState', async () => {
      const browser = await next.browser('/page-search-params')
      await typeIntoInput(browser)
      await pushState(browser)
      await expectInputToKeepFocus(browser)
      expect(await browser.elementByCss('#q').text()).toBe('pushed')
    })

    it('should not suspend when traversing between shallow history entries', async () => {
      const browser = await next.browser('/page-search-params')
      await typeIntoInput(browser)
      await pushState(browser)
      await browser.back()
      await waitForRenderedQuery(browser, 'abc')
      expect(await browser.elementByCss('#q').text()).toBe('abc')
      await browser.forward()
      await waitForRenderedQuery(browser, 'pushed')
      expect(await browser.elementByCss('#q').text()).toBe('pushed')
      await expectInputToKeepFocus(browser)
    })

    it('should not warn about sync access when a search param shares a name with a field of the promise', async () => {
      const browser = await next.browser(
        '/page-search-params?q=1&status=2&value=3'
      )
      expect(await browser.elementByCss('#q').text()).toBe('1')
      await typeIntoInput(browser)
      await pushState(browser)
      await expectNoSyncAccessWarning(browser)
    })
  })
})
