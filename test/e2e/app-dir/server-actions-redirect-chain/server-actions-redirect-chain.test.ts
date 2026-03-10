import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('server-actions-redirect-chain', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Regression test for https://github.com/vercel/next.js/issues/90591
  // createRedirectRenderResult should use redirect: 'manual' to avoid
  // following redirect chains server-side (causing latency or errors).
  it('should handle server action redirect to a route that itself redirects', async () => {
    const browser = await next.browser('/')

    // The server action redirects to /api/redirect-chain, which redirects
    // externally. With the fix, the client receives the redirect header
    // without the server following the chain.
    await browser.elementByCss('#redirect-chain').click()

    await retry(async () => {
      const url = await browser.url()
      // The browser should navigate to either the API route (which issues
      // the external redirect) or directly to the external URL. Either way,
      // the server should not error with "redirect count exceeded".
      expect(url).toMatch(/redirect-chain|example\.com/)
    })
  })
})
