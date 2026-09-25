import { retry } from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'

describe('Edge runtime response error', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    disableAutoSkewProtection: true,
    captureRuntimeLogs: true,
  })

  describe.each([
    { title: 'Edge API', url: '/api/route' },
    { title: 'Middleware', url: '/' },
  ])('test error if response is not Response type', ({ title, url }) => {
    it(`${title} test Response`, async () => {
      const res = await next.fetch(url)
      // Runtime logs arrive over the network, outside `retry()`'s 3s
      // default. 30s is what `check()` gives the one deploy suite that
      // already reads them successfully.
      await retry(() => {
        expect(next.cliOutput).toContain(
          'Expected an instance of Response to be returned'
        )
      }, 30_000)
      expect(res.status).toBe(500)
    })
  })
})
