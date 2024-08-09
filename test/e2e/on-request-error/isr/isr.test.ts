import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'
import { getOutputLogJson } from '../_testing/utils'

const outputLogPath = 'output-log.json'

describe('on-request-error - isr', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
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
          revalidateReason: 'stale',
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
      await next.fetch('/app/revalidate-path?path=/app/on-demand/page')
      await next.fetch('/app/on-demand')
      await matchRevalidateReason('app:on-demand', 'on-demand')
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
      await next.fetch('/app/revalidate-path?path=/pages/on-demand')
      await next.fetch('/pages/on-demand')
      await matchRevalidateReason('pages:on-demand', 'on-demand')
    })
  })
})
