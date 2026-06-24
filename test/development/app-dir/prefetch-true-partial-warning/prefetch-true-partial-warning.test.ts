import { nextTestSetup } from 'e2e-utils'

describe('prefetch-true-partial-warning', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // A stable substring of the dev warning emitted from navigation.ts.
  const WARNING = 'Next.js encountered dynamic data during prefetching'

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

    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "code": "E1386",
       "description": "Next.js encountered dynamic data during prefetching.",
       "environmentLabel": null,
       "label": "Instant",
       "source": "components/link-accordion.tsx (25:9) @ LinkAccordion
     > 25 |         <Link href={href} prefetch={prefetch}>
          |         ^",
       "stack": [
         "LinkAccordion components/link-accordion.tsx (25:9)",
         "Page app/page.tsx (10:11)",
       ],
     }
    `)
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

  it('does not warn when the target page exports instant = false', async () => {
    const browser = await next.browser('/')
    await navigateViaAccordion(browser, '/instant-false-route')

    await browser.waitForElementByCss('#dynamic-content')
    expect(await browser.elementById('dynamic-content').text()).toBe(
      'Instant-false dynamic'
    )

    expect(await browser.log()).not.toContainEqual(
      expect.objectContaining({
        source: 'error',
        message: expect.stringContaining(WARNING),
      })
    )
  })

  it('does not warn when instant = false is set on a parent layout', async () => {
    const browser = await next.browser('/')
    await navigateViaAccordion(browser, '/instant-false-layout')

    await browser.waitForElementByCss('#dynamic-content')
    expect(await browser.elementById('dynamic-content').text()).toBe(
      'Layout-instant-false dynamic'
    )

    expect(await browser.log()).not.toContainEqual(
      expect.objectContaining({
        source: 'error',
        message: expect.stringContaining(WARNING),
      })
    )
  })
})
