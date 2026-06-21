import { nextTestSetup } from 'e2e-utils'

describe('prefetch-true-partial-warning', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

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

    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "code": "E1362",
       "description": "A <Link prefetch={true}> navigated to "/default-route", but Partial Prefetching is not enabled for that route, so its dynamic data was included in the prefetch. Enable Partial Prefetching app-wide by setting \`partialPrefetching: true\` in next.config, or per-route by exporting \`const prefetch = 'partial'\` from the page or layout.",
       "environmentLabel": null,
       "label": "Console Error",
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
})
