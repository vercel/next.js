import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('segment cache (MPA navigations)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    test('ppr is disabled', () => {})
    return
  }

  type ElementWithExpando = Element & { __expando?: boolean }

  it('triggers MPA navigation when navigating to a different root layout', async () => {
    const browser = await next.browser('/')

    // Set an expando on the html element so we can detect if the page
    // gets unloaded.
    const html = await browser.elementByCss('html')

    await html.evaluate((el) => ((el as ElementWithExpando).__expando = true))

    // Navigate to a page with a different root layout.
    const link = await browser.elementByCss(`a[href="/foo"]`)
    await link.click()

    // The expando should not be present because we did a full-page navigation.
    await retry(async () => {
      const htmlAfterNav = await browser.elementByCss('html')
      expect(
        await htmlAfterNav.evaluate(
          (el) => (el as ElementWithExpando).__expando
        )
      ).toBe(undefined)
    })
  })

  it(
    'triggers MPA navigation when navigating to a different root layout, ' +
      'during a navigation where a root param also changed',
    async () => {
      // Testing this scenario because a root param change alone does not
      // trigger an MPA navigation, but if an inner segment changes before the
      // root layout, then we should trigger an MPA navigation. This case is
      // handled slightly differently in the implementation than the case where
      // there's no root param change.
      const browser = await next.browser('/foo')

      // Set an expando on the html element so we can detect if the page
      // gets unloaded.
      const html = await browser.elementByCss('html')
      await html.evaluate((el) => ((el as ElementWithExpando).__expando = true))

      // Navigate to a page with a different root layout.
      const link = await browser.elementByCss(`a[href="/bar/inner"]`)
      await link.click()

      // The expando should not be present because we did a full-page navigation.
      await retry(async () => {
        const htmlAfterNav = await browser.elementByCss('html')
        expect(
          await htmlAfterNav.evaluate(
            (el) => (el as ElementWithExpando).__expando
          )
        ).toBe(undefined)
      })
    }
  )
})
