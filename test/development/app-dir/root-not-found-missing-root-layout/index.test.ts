import { nextTestSetup } from 'e2e-utils'

describe('root-not-found-missing-root-layout', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  if (!isTurbopack) {
    it('should not conflict with generated layout on dev server', async () => {
      const browser = await next.browser('/')
      expect(await browser.elementByCss('p').text()).toBe('not found')
    })
  } else {
    // skip test for turbo dev server
    // See https://github.com/vercel/next.js/pull/63053#issuecomment-1987101666
    it.skip('should not conflict with generated layout on turbo dev server', () => {})
  }
})
