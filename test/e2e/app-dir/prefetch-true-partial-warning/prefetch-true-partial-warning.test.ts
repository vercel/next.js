import { nextTestSetup } from 'e2e-utils'

describe('prefetch-true-partial-warning', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  // The warning is only emitted in development. In dev we don't prefetch, so it
  // fires at navigation time instead.
  if (!isNextDev) {
    it('is skipped outside of dev', () => {})
    return
  }

  // A stable substring of the dev warning emitted from navigation.ts.
  const WARNING = 'Partial Prefetching is not enabled'

  async function navigateViaAccordion(
    browser: Awaited<ReturnType<typeof next.browser>>,
    href: string
  ) {
    const toggle = await browser.elementByCss(
      `input[data-link-accordion="${href}"]`
    )
    await toggle.click()
    const link = await browser.elementByCss(`a[href="${href}"]`)
    await link.click()
  }

  it('warns when a prefetch={true} link navigates to a route without partial prefetching', async () => {
    const browser = await next.browser('/')
    await navigateViaAccordion(browser, '/default-route')

    // Wait for the navigation to fully complete (dynamic content rendered).
    // The warning fires synchronously at the start of the navigation, so by
    // now it must already be in the console log.
    await browser.waitForElementByCss('#dynamic-content')
    expect(await browser.elementById('dynamic-content').text()).toBe(
      'Default dynamic'
    )

    expect(await browser.log()).toContainEqual(
      expect.objectContaining({
        source: 'error',
        message: expect.stringContaining(WARNING),
      })
    )
  })

  it('does not warn when the target route opts into partial prefetching', async () => {
    const browser = await next.browser('/')
    await navigateViaAccordion(browser, '/partial-route')

    await browser.waitForElementByCss('#dynamic-content')
    expect(await browser.elementById('dynamic-content').text()).toBe(
      'Partial dynamic'
    )

    expect(await browser.log()).not.toContainEqual(
      expect.objectContaining({
        source: 'error',
        message: expect.stringContaining(WARNING),
      })
    )
  })

  it('does not warn for a default (non-full) prefetch link', async () => {
    const browser = await next.browser('/')
    await navigateViaAccordion(browser, '/control-route')

    await browser.waitForElementByCss('#dynamic-content')
    expect(await browser.elementById('dynamic-content').text()).toBe(
      'Control dynamic'
    )

    expect(await browser.log()).not.toContainEqual(
      expect.objectContaining({
        source: 'error',
        message: expect.stringContaining(WARNING),
      })
    )
  })
})
