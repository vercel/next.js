import { nextTestSetup } from 'e2e-utils'
import {
  waitForRedbox,
  getRedboxDescription,
  getRedboxSource,
  openRedbox,
} from 'next-test-utils'
import stripAnsi from 'strip-ansi'

const reactFunctionError =
  'Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server". Or maybe you meant to call this function rather than return it.'

const useCacheFunctionDocs =
  'https://nextjs.org/docs/app/api-reference/directives/use-cache'

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

      expect(errorDescription).toContain(reactFunctionError)
      expect(errorDescription).toContain('"use cache"')
      expect(errorDescription).toContain(useCacheFunctionDocs)
      expect(errorDescription).toContain('[function fn]')

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
      expect(cliOutput).toContain(reactFunctionError)
      expect(cliOutput).toContain(useCacheFunctionDocs)
      expect(cliOutput).toContain('at createCachedFn (app/client/page.tsx:8:3)')
      expect(cliOutput).toContain('at Page (app/client/page.tsx:15:28)')
    })

    it('should show the error overlay for server-side usage', async () => {
      const outputIndex = next.cliOutput.length
      const browser = await next.browser('/server')

      await waitForRedbox(browser)

      const errorDescription = await getRedboxDescription(browser)
      const errorSource = await getRedboxSource(browser)

      expect(errorDescription).toContain(reactFunctionError)
      expect(errorDescription).toContain('"use cache"')
      expect(errorDescription).toContain(useCacheFunctionDocs)
      expect(errorDescription).toContain('[function fn]')

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
      expect(cliOutput).toContain(reactFunctionError)
      expect(cliOutput).toContain(useCacheFunctionDocs)
      expect(cliOutput).toContain('at createCachedFn (app/server/page.tsx:6:3)')
      if (isTurbopack) {
        expect(cliOutput).toContain(
          'at module evaluation (app/server/page.tsx:12:24)'
        )
      } else {
        expect(cliOutput).toContain('at eval (app/server/page.tsx:12:24)')
      }
    })

    it('should hint when a component function is returned from use cache', async () => {
      const browser = await next.browser('/return-component')

      await waitForRedbox(browser)

      const errorDescription = await getRedboxDescription(browser)
      expect(errorDescription).toContain(reactFunctionError)
      expect(errorDescription).toContain('"use cache"')
      expect(errorDescription).toContain(useCacheFunctionDocs)
      // Stronger wording when the failure is definitely inside the cache fill.
      expect(errorDescription).toContain('Inside `"use cache"`')
    })
  } else {
    it('should fail the build with an error', async () => {
      const { cliOutput } = await next.build()

      expect(cliOutput).toContain(reactFunctionError)
      expect(cliOutput).toContain(useCacheFunctionDocs)

      expect(cliOutput).toMatch(
        /Error occurred prerendering page "\/(client|server|return-component)"/
      )
    })
  }
})
