import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  getRedboxDescription,
  getRedboxSource,
  openRedbox,
} from 'next-test-utils'

describe('use-cache-close-over-function', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
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
        "[ Prerender ] Error: Failed to serialize closed-over values for server function.

        Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server". Or maybe you meant to call this function rather than return it.
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
    })

    it('should show the error overlay for server-side usage', async () => {
      const browser = await next.browser('/server')

      await assertHasRedbox(browser)

      const errorDescription = await getRedboxDescription(browser)
      const errorSource = await getRedboxSource(browser)

      expect(errorDescription).toMatchInlineSnapshot(`
        "[ Prerender ] Error: Failed to serialize closed-over values for server function.

        Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server". Or maybe you meant to call this function rather than return it.
          [function fn1, ...]
           ^^^^^^^^^^^^

        Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server". Or maybe you meant to call this function rather than return it.
          [..., function fn2]
                ^^^^^^^^^^^^"
      `)

      expect(errorSource).toMatchInlineSnapshot(`
        "app/server/page.tsx (10:3) @ createCachedFn

           8 |   }
           9 |
        > 10 |   return async () => {
             |   ^
          11 |     'use cache'
          12 |     return fn1() + fn2()
          13 |   }"
      `)
    })
  } else {
    it('should fail the build with an error', async () => {
      const { cliOutput } = await next.build()

      expect(cliOutput).toInclude(`
Error: Failed to serialize closed-over values for server function.

Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server". Or maybe you meant to call this function rather than return it.
  [function, function]
   ^^^^^^^^

Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server". Or maybe you meant to call this function rather than return it.
  [function, function]
             ^^^^^^^^`)

      expect(cliOutput).toInclude('Error occurred prerendering page "/server"')
    })
  }
})
