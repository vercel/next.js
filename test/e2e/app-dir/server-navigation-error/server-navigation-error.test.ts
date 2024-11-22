import { nextTestSetup } from 'e2e-utils'
import { assertHasRedbox, getRedboxDescription } from 'next-test-utils'

describe('server-navigation-error', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('redirect', () => {
    it('should error on navigation usage in pages router', async () => {
      const browser = await next.browser('/pages/redirect')
      await assertHasRedbox(browser)
      expect(await getRedboxDescription(browser)).toMatch(
        `Next.js navigation API is not allowed to be used in Pages Router.`
      )
    })

    it('should error on navigation usage in middleware ', async () => {
      const browser = await next.browser('/middleware/redirect')
      // FIXME: the first request to middleware error load didn't show the redbox, need one more reload
      await browser.refresh()
      await assertHasRedbox(browser)
      expect(await getRedboxDescription(browser)).toMatch(
        `Next.js navigation API is not allowed to be used in Middleware.`
      )
    })
  })

  describe('not-found', () => {
    it('should error on navigation usage in pages router', async () => {
      const browser = await next.browser('/pages/not-found')
      await assertHasRedbox(browser)
      expect(await getRedboxDescription(browser)).toMatch(
        `Next.js navigation API is not allowed to be used in Pages Router.`
      )
    })

    it('should error on navigation usage in middleware ', async () => {
      const browser = await next.browser('/middleware/not-found')
      await assertHasRedbox(browser)
      expect(await getRedboxDescription(browser)).toMatch(
        `Next.js navigation API is not allowed to be used in Middleware.`
      )
    })
  })
})
