import { retry } from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'

describe('Edge runtime response error', () => {
  describe.each([
    { title: 'Edge API', url: '/api/route' },
    { title: 'Middleware', url: '/' },
  ])('test error if response is not Response type', ({ title, url }) => {
    // Each case needs its own deployment: both routes log the same error and
    // late delivery would let one request satisfy the other case's assertion.
    const { next } = nextTestSetup({
      files: __dirname,
      disableAutoSkewProtection: true,
      captureRuntimeLogs: true,
    })

    it(`${title} test Response`, async () => {
      const res = await next.fetch(url)
      expect(res.status).toBe(500)
      // Runtime log delivery can lag behind the response.
      await retry(() => {
        expect(next.cliOutput).toContain(
          'Expected an instance of Response to be returned'
        )
      }, 30_000)
    })
  })
})
