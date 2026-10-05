import { nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// Assertions don't apply to deploy mode (output differs vs. local Next.js server).
// @force-gate !deploy
describe('Edge runtime response error', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    disableAutoSkewProtection: true,
  })

  describe.each([
    { title: 'Edge API', url: '/api/route' },
    { title: 'Middleware', url: '/' },
  ])('test error if response is not Response type', ({ title, url }) => {
    it(`${title} test Response`, async () => {
      const res = await next.fetch(url)
      expect(next.cliOutput).toContain(
        'Expected an instance of Response to be returned'
      )
      expect(res.status).toBe(500)
    })
  })
})
