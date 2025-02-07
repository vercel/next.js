import { nextTestSetup } from 'e2e-utils'
import { hasErrorToast, getToastErrorCount, retry } from 'next-test-utils'

describe('hydration-error-count', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // These error count should be consistent between normal mode and when reactOwnerStack is enabled (PPR testing)
  it('should have correct hydration error count for bad nesting', async () => {
    const browser = await next.browser('/bad-nesting')

    await retry(async () => {
      await hasErrorToast(browser)
      const totalErrorCount = await getToastErrorCount(browser)

      // One hydration error and one warning
      expect(totalErrorCount).toBe(2)
    })
  })

  it('should have correct hydration error count for html diff', async () => {
    const browser = await next.browser('/html-diff')

    await retry(async () => {
      await hasErrorToast(browser)
      const totalErrorCount = await getToastErrorCount(browser)

      // One hydration error and one warning
      expect(totalErrorCount).toBe(1)
    })
  })
})
