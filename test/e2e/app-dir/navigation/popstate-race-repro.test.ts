/**
 * TEMP DEBUG (do not merge): repro attempt for the CI-only failure of
 * "browser back to a revalidated page > should load the page".
 * CPU-throttles the browser so back() lands while the server action's router
 * work is still in flight, forcing the discard path like on slow CI machines.
 */
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('popstate-revalidate race repro', () => {
  const { next } = nextTestSetup({ files: __dirname })

  for (let i = 0; i < 5; i++) {
    it(`immediate back() after submit, iteration ${i}`, async () => {
      const browser = await next.browser('/popstate-revalidate', {
        cpuThrottleRate: 10,
      })
      await browser.waitForElementByCss('h1', 30_000)
      await browser.elementByCss("[href='/popstate-revalidate/foo']").click()
      await browser.waitForElementByCss('#submit-button', 30_000)
      await browser.elementById('submit-button').click()
      await browser.back()

      await retry(
        async () => {
          expect(await browser.elementByCss('h1').text()).toBe('Home')
        },
        20_000,
        undefined,
        `iteration ${i}`
      )
    })

    it(`back() after Form Submitted appears, iteration ${i}`, async () => {
      const browser = await next.browser('/popstate-revalidate', {
        cpuThrottleRate: 10,
      })
      await browser.waitForElementByCss('h1', 30_000)
      await browser.elementByCss("[href='/popstate-revalidate/foo']").click()
      await browser.waitForElementByCss('#submit-button', 30_000)
      await browser.elementById('submit-button').click()
      // Tight poll (no 500ms retry interval) so back() lands right after the
      // action value resolves, while the router action is still pending.
      await browser.eval(
        `new Promise((resolve) => {
          const check = () => {
            if (document.body.textContent.includes('Form Submitted.')) {
              resolve()
            } else {
              setTimeout(check, 5)
            }
          }
          check()
        })`
      )
      await browser.back()

      await retry(
        async () => {
          expect(await browser.elementByCss('h1').text()).toBe('Home')
        },
        20_000,
        undefined,
        `iteration ${i}`
      )
    })
  }
})
