import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'

describe('duplicate-runtime-error', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not rerender the overlay for the same runtime error', async () => {
    const browser = await next.browser('/')
    const badge = await browser.elementByCss('[data-next-badge]')

    // Wait until the badge is showing "errored"
    await retry(async () => {
      const errorProp = await badge.getAttribute('data-error')

      expect(errorProp).toBe('true')
    })

    // Still present the same value after a while without re-rendersw.
    // Should always display the badge, should not re-render by hiding it again
    for (let i = 0; i < 40; i++) {
      const errorProp = await badge.getAttribute('data-error')

      expect(errorProp).toBe('true')
      await waitFor(50)
    }
  })
})
