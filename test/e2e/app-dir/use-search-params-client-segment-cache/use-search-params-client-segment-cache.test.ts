import { nextTestSetup } from 'e2e-utils'
import { retry } from '../../../lib/next-test-utils'

describe('use-search-params-client-segment-cache', () => {
  const { next, isNextStart, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  it('should not have a failed prefetch request', async () => {
    let requestCount = 0

    await next.browser('/', {
      beforePageLoad(page) {
        page.on('request', () => {
          requestCount++
        })

        page.on('response', async (res) => {
          requestCount--
          if (res.status() === 500) {
            throw new Error('Unexpected error response for ' + res.url())
          }
        })
      },
    })

    await retry(async () => {
      expect(requestCount).toBe(0)
    })
  })

  if (isNextStart && !isNextDeploy) {
    it('should render a page with useSearchParams wrapped in Suspense fully static', async () => {
      const meta = await next.readJSON('.next/server/app/index.meta')
      expect(meta.postponed).toBeUndefined()
    })
  }
})
