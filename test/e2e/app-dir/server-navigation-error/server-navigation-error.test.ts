import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  getRedboxDescription,
  getRedboxSource,
} from 'next-test-utils'

describe('server-navigation-error', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('pages router', () => {
    it('should error on navigation API redirect', async () => {
      const browser = await next.browser('/pages/redirect')
      await assertHasRedbox(browser)
      expect(await getRedboxDescription(browser)).toMatch(
        `Next.js navigation API is not allowed to be used in Pages Router.`
      )
      const source = await getRedboxSource(browser)
      if (process.env.TURBOPACK) {
        expect(source).toMatchInlineSnapshot(`
          "pages/pages/redirect.tsx (4:10) @ Page

            2 |
            3 | export default function Page() {
          > 4 |   redirect('/')
              |          ^
            5 | }
            6 |"
        `)
      } else {
        expect(source).toMatchInlineSnapshot(`
          "pages/pages/redirect.tsx (4:12) @ Page

            2 |
            3 | export default function Page() {
          > 4 |   redirect('/')
              |            ^
            5 | }
            6 |"
        `)
      }
    })

    it('should error on navigation API notFound', async () => {
      const browser = await next.browser('/pages/not-found')
      await assertHasRedbox(browser)
      expect(await getRedboxDescription(browser)).toMatch(
        `Next.js navigation API is not allowed to be used in Pages Router.`
      )
      const source = await getRedboxSource(browser)
      if (process.env.TURBOPACK) {
        expect(source).toMatchInlineSnapshot(`
          "pages/pages/not-found.tsx (4:10) @ Page

            2 |
            3 | export default function Page() {
          > 4 |   notFound()
              |          ^
            5 | }
            6 |"
        `)
      } else {
        expect(source).toMatchInlineSnapshot(`
          "pages/pages/not-found.tsx (4:11) @ notFound

            2 |
            3 | export default function Page() {
          > 4 |   notFound()
              |           ^
            5 | }
            6 |"
        `)
      }
    })
  })

  describe('middleware', () => {
    it('should error on navigation API redirect ', async () => {
      const browser = await next.browser('/middleware/redirect')
      // FIXME: the first request to middleware error load didn't show the redbox, need one more reload
      await browser.refresh()
      await assertHasRedbox(browser)
      expect(await getRedboxDescription(browser)).toMatch(
        `Next.js navigation API is not allowed to be used in Middleware.`
      )
      // No trace for middleware as it's thrown in the early phase of the adapter
      const source = await getRedboxSource(browser)
      if (process.env.TURBOPACK) {
        expect(source).toMatchInlineSnapshot(`null`)
      } else {
        expect(source).toMatchInlineSnapshot(`null`)
      }
    })

    it('should error on navigation API not-found', async () => {
      const browser = await next.browser('/middleware/not-found')
      await assertHasRedbox(browser)
      expect(await getRedboxDescription(browser)).toMatch(
        `Next.js navigation API is not allowed to be used in Middleware.`
      )
      const source = await getRedboxSource(browser)

      // No trace for middleware as it's thrown in the early phase of the adapter
      if (process.env.TURBOPACK) {
        expect(source).toMatchInlineSnapshot(`null`)
      } else {
        expect(source).toMatchInlineSnapshot(`null`)
      }
    })
  })
})
