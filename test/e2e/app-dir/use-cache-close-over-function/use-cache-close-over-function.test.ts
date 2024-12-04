import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  getRedboxDescription,
  getRedboxSource,
  openRedbox,
} from 'next-test-utils'

describe('use-cache-close-over-function', () => {
  const { next, isNextDev, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: process.env.NEXT_TEST_MODE !== 'dev',
  })

  if (skipped) {
    return
  }

  if (isNextDev) {
    it('should show an error toast for client-side usage', async () => {
      const browser = await next.browser('/client')

      await openRedbox(browser)

      const errorDescription = await getRedboxDescription(browser)
      const errorSource = await getRedboxSource(browser)

      expect(errorDescription).toMatchInlineSnapshot(`
        "[ Prerender ] Error: Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server". Or maybe you meant to call this function rather than return it.
          [function fn]
           ^^^^^^^^^^^"
      `)

      expect(errorSource).toMatchInlineSnapshot(`
        "app/client/page.tsx (8:3) @ createCachedFn

           6 |   }
           7 |
        >  8 |   return async () => {
             |   ^
           9 |     'use cache'
          10 |     return Math.random() + fn()
          11 |   }"
      `)

      if (isTurbopack) {
        expect(next.cliOutput).toInclude(`
 ⨯ Error: Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server". Or maybe you meant to call this function rather than return it.
  [function fn]
   ^^^^^^^^^^^
    at createCachedFn (./app/client/page.tsx:8:3)`)
      } else {
        // TODO(veil): line:column is wrong with Webpack.
        expect(next.cliOutput).toInclude(`
 ⨯ Error: Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server". Or maybe you meant to call this function rather than return it.
  [function fn]
   ^^^^^^^^^^^
    at createCachedFn (./app/client/page.tsx:25:132)`)
      }
    })

    it('should show the error overlay for server-side usage', async () => {
      const browser = await next.browser('/server')

      await assertHasRedbox(browser)

      const errorDescription = await getRedboxDescription(browser)
      const errorSource = await getRedboxSource(browser)

      expect(errorDescription).toMatchInlineSnapshot(`
        "[ Prerender ] Error: Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server". Or maybe you meant to call this function rather than return it.
          [function fn]
           ^^^^^^^^^^^"
      `)

      expect(errorSource).toMatchInlineSnapshot(`
        "app/server/page.tsx (6:3) @ createCachedFn

          4 |   }
          5 |
        > 6 |   return async () => {
            |   ^
          7 |     'use cache'
          8 |     return Math.random() + fn()
          9 |   }"
      `)

      if (isTurbopack) {
        expect(next.cliOutput).toInclude(`
 ⨯ Error: Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server". Or maybe you meant to call this function rather than return it.
  [function fn]
   ^^^^^^^^^^^
    at createCachedFn (./app/server/page.tsx:6:3)`)
      } else {
        // TODO(veil): line:column is wrong with Webpack.
        expect(next.cliOutput).toInclude(`
 ⨯ Error: Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server". Or maybe you meant to call this function rather than return it.
  [function fn]
   ^^^^^^^^^^^
    at createCachedFn (./app/server/page.tsx:23:132)`)
      }
    })
  } else {
    it('should fail the build with an error', async () => {
      const { cliOutput } = await next.build()

      expect(cliOutput).toInclude(`
Error: Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server". Or maybe you meant to call this function rather than return it.
  [function]
   ^^^^^^^^`)

      expect(cliOutput).toMatch(
        /Error occurred prerendering page "\/(client|server)"/
      )
    })
  }
})
