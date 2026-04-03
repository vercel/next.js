import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('intercepting-routes-duplicate-groups', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should intercept from group1', async () => {
    const browser = await next.browser('/')

    await browser.elementByCss('#group1-link').click()

    await retry(async () => {
      expect(await browser.elementById('intercepted-modal').text()).toBe(
        'Intercepted from Group 1'
      )
    })
  })

  it('should intercept from group2', async () => {
    const browser = await next.browser('/group2')

    await browser.elementByCss('#group2-link').click()

    await retry(async () => {
      // This assertion should verify the interception works from group2.
      // Due to the bug (#67034), the interception from group2 does not work:
      // generate-interception-routes-rewrites.ts strips route group context,
      // producing identical rewrite rules for both groups.
      // Only the first group's rewrite matches, so group2 falls through
      // to the full /shared page instead of showing the intercepted modal.
      expect(await browser.elementById('intercepted-modal').text()).toBe(
        'Intercepted from Group 2'
      )
    })
  })
})
