import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  getRedboxDescription,
  getRedboxSource,
  openRedbox,
} from 'next-test-utils'
import stripAnsi from 'strip-ansi'

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
      const outputIndex = next.cliOutput.length
      const browser = await next.browser('/client')

      await openRedbox(browser)

      const errorDescription = await getRedboxDescription(browser)
      const errorSource = await getRedboxSource(browser)

      expect(errorDescription).toMatchInlineSnapshot(`
        "Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server". Or maybe you meant to call this function rather than return it.
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

      const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))
      expect(cliOutput).toContain(
        '' +
          'Error: Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server". Or maybe you meant to call this function rather than return it.' +
          '\n  [function fn]' +
          '\n   ^^^^^^^^^^^' +
          '\n    at createCachedFn (app/client/page.tsx:8:3)' +
          '\n    at Page (app/client/page.tsx:15:28)' +
          '\n   6 |   }' +
          '\n   7 |' +
          '\n>  8 |   return async () => {' +
          '\n     |   ^' +
          "\n   9 |     'use cache'" +
          '\n  10 |     return Math.random() + fn()' +
          '\n  11 |   }'
      )
    })

    it('should show the error overlay for server-side usage', async () => {
      const outputIndex = next.cliOutput.length
      const browser = await next.browser('/server')

      await assertHasRedbox(browser)

      const errorDescription = await getRedboxDescription(browser)
      const errorSource = await getRedboxSource(browser)

      expect(errorDescription).toMatchInlineSnapshot(`
        "Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server". Or maybe you meant to call this function rather than return it.
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

      const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))
      expect(cliOutput).toContain(
        isTurbopack
          ? '' +
              'Error: Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server". Or maybe you meant to call this function rather than return it.' +
              '\n  [function fn]' +
              '\n   ^^^^^^^^^^^' +
              '\n    at createCachedFn (app/server/page.tsx:6:3)' +
              '\n    at module evaluation (app/server/page.tsx:12:24)'
          : '' +
              'Error: Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server". Or maybe you meant to call this function rather than return it.' +
              '\n  [function fn]' +
              '\n   ^^^^^^^^^^^' +
              '\n    at createCachedFn (app/server/page.tsx:6:3)' +
              '\n    at eval (app/server/page.tsx:12:24)' +
              // TODO(veil): Should be source-mapped.
              '\n    at <unknown> (rsc)'
      )
      expect(cliOutput).toContain(
        '' +
          '\n> 6 |   return async () => {' +
          '\n    |   ^' +
          "\n  7 |     'use cache'"
      )
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
