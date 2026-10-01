import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type { Playwright } from 'next-webdriver'

describe('client-params-shallow-routing', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function load(pathname: string): Promise<Playwright> {
    const browser = await next.browser(pathname)
    await browser.waitForElementByCss('#input')
    // The fallback may be part of the initial load. Only count the ones that
    // are caused by the URL updates below.
    await browser.eval('window.fallbackCommits = 0')
    return browser
  }

  async function waitForRenderedQuery(browser: Playwright, q: string) {
    await retry(async () => {
      expect(await browser.elementByCss('#rendered-q').text()).toBe(q)
    })
  }

  async function typeIntoInput(browser: Playwright) {
    await browser.elementByCss('#input').type('abc')
    await waitForRenderedQuery(browser, 'abc')
    // When the boundary above the input suspends, the input is hidden and
    // loses focus, so the remaining keystrokes are dropped.
    expect(await browser.elementByCss('#input').getValue()).toBe('abc')
    expect(await browser.eval('document.activeElement.id')).toBe('input')
  }

  async function pushState(browser: Playwright) {
    await browser.elementByCss('#push').click()
    await waitForRenderedQuery(browser, 'pushed')
  }

  async function expectNoSyncAccessWarning(browser: Playwright) {
    expect(await browser.log()).not.toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('was accessed directly'),
      })
    )
  }

  describe.each([
    { name: 'page', pathname: '/page-params/1' },
    { name: 'layout', pathname: '/layout-params/1' },
  ])('use(params) in a client $name', ({ pathname }) => {
    it('should not suspend on replaceState', async () => {
      const browser = await load(pathname)
      await typeIntoInput(browser)
      expect(await browser.elementByCss('#id').text()).toBe('1')
      expect(await browser.eval('window.fallbackCommits')).toBe(0)
    })

    it('should not suspend on pushState', async () => {
      const browser = await load(pathname)
      await pushState(browser)
      expect(await browser.elementByCss('#id').text()).toBe('1')
      expect(await browser.eval('window.fallbackCommits')).toBe(0)
    })

    it('should pass the same params promise when the params did not change', async () => {
      const browser = await load(pathname)
      await pushState(browser)
      expect(await browser.elementByCss('#params-identity').text()).toBe('same')
    })
  })

  it('should not warn about sync access when a param shares a name with a field of the promise', async () => {
    const browser = await load('/param-named-value/1')
    await pushState(browser)
    expect(await browser.elementByCss('#value').text()).toBe('1')
    await expectNoSyncAccessWarning(browser)
  })

  describe('use(searchParams) in a client page', () => {
    it('should not suspend on replaceState', async () => {
      const browser = await load('/page-search-params')
      await typeIntoInput(browser)
      expect(await browser.elementByCss('#q').text()).toBe('abc')
      expect(await browser.eval('window.fallbackCommits')).toBe(0)
    })

    it('should not suspend on pushState', async () => {
      const browser = await load('/page-search-params')
      await pushState(browser)
      expect(await browser.elementByCss('#q').text()).toBe('pushed')
      expect(await browser.eval('window.fallbackCommits')).toBe(0)
    })

    it('should not suspend when traversing between shallow history entries', async () => {
      const browser = await load('/page-search-params')
      await pushState(browser)
      await browser.back()
      await waitForRenderedQuery(browser, '(none)')
      expect(await browser.elementByCss('#q').text()).toBe('(none)')
      await browser.forward()
      await waitForRenderedQuery(browser, 'pushed')
      expect(await browser.elementByCss('#q').text()).toBe('pushed')
      expect(await browser.eval('window.fallbackCommits')).toBe(0)
    })

    it('should not warn about sync access when a search param shares a name with a field of the promise', async () => {
      const browser = await load('/page-search-params?q=1&status=2&value=3')
      expect(await browser.elementByCss('#q').text()).toBe('1')
      await pushState(browser)
      await expectNoSyncAccessWarning(browser)
    })
  })

  describe('a component that suspends on data for the new URL', () => {
    // The router applies the URL as a Transition, so React keeps showing the
    // current content until the new content is ready.
    it('should keep showing the current content on pushState', async () => {
      const browser = await load('/suspends-on-search-params')
      await pushState(browser)
      expect(await browser.elementByCss('#loaded').text()).toBe('pushed')
      expect(await browser.eval('window.fallbackCommits')).toBe(0)
    })
  })
})
