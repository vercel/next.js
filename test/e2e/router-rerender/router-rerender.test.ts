import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('router rerender', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('with middleware', () => {
    it('should not trigger unnecessary rerenders when middleware is used', async () => {
      const browser = await next.browser('/')

      await retry(async () => {
        const renders = await browser.eval('window.__renders')
        expect(renders).toEqual([undefined])
      })
    })
  })

  describe('with rewrites', () => {
    // TODO: Figure out the `isReady` issue.
    it.skip('should not trigger unnecessary rerenders when rewrites are used', async () => {})
    it.skip('should rerender with the correct query parameter if present with rewrites', async () => {})
  })
})
