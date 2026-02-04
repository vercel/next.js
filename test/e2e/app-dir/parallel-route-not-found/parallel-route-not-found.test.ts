import { nextTestSetup } from 'e2e-utils'

describe('parallel-route-not-found', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  // TODO: adjust the test to work with the new error
  it.skip('should handle a layout that attempts to render a missing parallel route', async () => {
    const browser = await next.browser('/no-bar-slot')
    const logs = await browser.log()
    expect(await browser.elementByCss('body').text()).toContain(
      'This page could not be found'
    )
    const warnings = logs.filter((log) => log.source === 'warning')
    if (isNextDev) {
      expect(warnings.length).toBe(1)
      expect(warnings[0].message).toContain(
        'No default component was found for a parallel route rendered on this page'
      )
      expect(warnings[0].message).toContain('Missing slots: @bar')
    } else {
      expect(warnings.length).toBe(0)
    }
  })

  // TODO: adjust the test to work with the new error
  it.skip('should handle multiple missing parallel routes', async () => {
    const browser = await next.browser('/both-slots-missing')
    const logs = await browser.log()

    expect(await browser.elementByCss('body').text()).toContain(
      'This page could not be found'
    )

    const warnings = logs.filter((log) => log.source === 'warning')
    if (isNextDev) {
      expect(warnings.length).toBe(1)
      expect(warnings[0].message).toContain(
        'No default component was found for a parallel route rendered on this page'
      )
      expect(warnings[0].message).toContain('Missing slots: @bar, @foo')
    } else {
      expect(warnings.length).toBe(0)
    }
  })

  it('should not include any parallel route warnings for a deliberate notFound()', async () => {
    const browser = await next.browser('/has-both-slots/not-found-error')
    const logs = await browser.log()

    expect(await browser.elementByCss('body').text()).toContain(
      'This page could not be found'
    )

    const warnings = logs.filter((log) => log.source === 'warning')
    expect(warnings.length).toBe(0)
  })

  it('should render the page & slots if all parallel routes are found', async () => {
    const browser = await next.browser('/has-both-slots')
    const logs = await browser.log()

    expect(await browser.elementByCss('body').text()).toContain(
      'Has Both Slots'
    )
    expect(await browser.elementByCss('body').text()).toContain('@foo slot')
    expect(await browser.elementByCss('body').text()).toContain('@bar slot')

    const warnings = logs.filter((log) => log.source === 'warning')
    expect(warnings.length).toBe(0)
  })

  it('should handle `notFound()` in generateMetadata on a page that also renders a parallel route', async () => {
    const browser = await next.browser('/not-found-metadata/page-error')

    // The page's `generateMetadata` function threw a `notFound()` error,
    // so we should see the not found page.
    expect(await browser.elementByCss('body').text()).toContain(
      'Custom Not Found!'
    )
  })

  it('should handle `notFound()` in a slot', async () => {
    const browser = await next.browser('/not-found-metadata/slot-error')

    // The page's `generateMetadata` function threw a `notFound()` error,
    // so we should see the not found page.
    expect(await browser.elementByCss('body').text()).toContain(
      'Custom Not Found!'
    )
  })

  // TODO-APP: This test should probably work. But we only provide a not-found boundary for the children slot.
  // This means that if a parallel route throws a notFound() in generateMetadata, it won't be properly handled.
  it.skip('should handle `notFound()` in a slot with no `children` slot', async () => {
    const browser = await next.browser('/not-found-metadata/no-page')

    // The page's `generateMetadata` function threw a `notFound()` error,
    // so we should see the not found page.
    expect(await browser.elementByCss('body').text()).toContain(
      'Custom Not Found!'
    )
  })

  if (isNextDev) {
    it('should not log any warnings for a regular not found page', async () => {
      const browser = await next.browser('/this-page-doesnt-exist')
      const logs = await browser.log()
      expect(await browser.elementByCss('body').text()).toContain(
        'This page could not be found'
      )
      const warnings = logs.filter((log) => log.source === 'warning')
      expect(warnings.length).toBe(0)
    })
  }
})
