import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'
import { getOutputLogJson } from '../_testing/utils'

const outputLogPath = 'output-log.json'

describe('on-request-error - isr', () => {
  const { next, skipped, isNextDev } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  if (isNextDev) {
    it('should skip in development mode', () => {
      // This ISR test is only applicable for production mode
    })
    return
  }

  async function matchRevalidateReason(
    errorMessage: string,
    revalidateReason: string
  ) {
    await retry(async () => {
      const json = await getOutputLogJson(next, outputLogPath)
      expect(json[errorMessage]).toMatchObject({
        context: {
          revalidateReason,
        },
      })
    })
  }

  describe('app router ISR', () => {
    it('should capture correct reason for stale errored page', async () => {
      await next.fetch('/app/stale')
      await waitFor(2 * 1000) // wait for revalidation
      await next.fetch('/app/stale')

      await matchRevalidateReason('app:stale', 'stale')
    })

    it('should capture correct reason for on-demand revalidated page', async () => {
      await next.fetch('/api/revalidate-path?path=/app/on-demand')

      await matchRevalidateReason('app:on-demand', 'on-demand')
    })

    it('should capture correct reason for build errored route', async () => {
      await next.fetch('/app/route/stale')
      await waitFor(2 * 1000) // wait for revalidation
      await next.fetch('/app/route/stale')

      await matchRevalidateReason('app:route:stale', 'stale')
    })

    it('should capture correct reason for on-demand revalidated route', async () => {
      await next.fetch('/api/revalidate-path?path=/app/route/on-demand')

      await matchRevalidateReason('app:route:on-demand', 'on-demand')
    })

    it('should capture revalidate from server action', async () => {
      const browser = await next.browser('/app/self-revalidate')
      const button = await browser.elementByCss('button')
      await button.click()

      await retry(async () => {
        await next.fetch('/app/self-revalidate')
        await matchRevalidateReason('app:self-revalidate', 'stale')
      })
    })
  })

  describe('pages router ISR', () => {
    it('should capture correct reason for stale errored page', async () => {
      await next.fetch('/pages/stale')
      await waitFor(2 * 1000) // wait for revalidation
      await next.fetch('/pages/stale')

      await matchRevalidateReason('pages:stale', 'stale')
    })

    it('should capture correct reason for on-demand revalidated page', async () => {
      await next.fetch('/api/revalidate-path?path=/pages/on-demand')
      await matchRevalidateReason('pages:on-demand', 'on-demand')
    })
  })
})
