import { nextTestSetup } from 'e2e-utils'

describe('root-not-found-missing-root-layout', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  // Skip test for turbo dev for now since generating a missing root layout is not supported yet.
  // See https://github.com/vercel/next.js/pull/63053#issuecomment-1987101666
  ;(isTurbopack ? it.skip : it)(
    'should not conflict with generated layout on dev server',
    async () => {
      const browser = await next.browser('/')
      // eslint-disable-next-line jest/no-standalone-expect
      expect(await browser.elementByCss('p').text()).toBe('not found')
    }
  )
})
