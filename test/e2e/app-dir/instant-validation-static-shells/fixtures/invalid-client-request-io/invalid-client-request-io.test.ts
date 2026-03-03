import { nextTestSetup } from 'e2e-utils'

describe('invalid-client-request-io', () => {
  const { next, skipped, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
    env: {
      NEXT_PRIVATE_DEBUG_VALIDATION: '1',
    },
  })
  if (skipped) return

  if (isNextDev) {
    beforeAll(() => next.start())

    it('should error during Static Shell Validation via Instant Validation if client request IO without a Suspense boundary', async () => {
      const browser = await next.browser('/new')
      await browser.elementByCss('main')
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "code": "E1078",
         "description": "Data that blocks navigation was accessed outside of <Suspense>

       This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. Uncached data such as fetch(...), cached data with a low expire time, or connection() are all examples of data that only resolve on navigation.

       To fix this, you can either:

       Provide a fallback UI using <Suspense> around this component. This allows Next.js to stream its contents to the user as soon as it's ready, without blocking the rest of the app.

       or

       Move the asynchronous await into a Cache Component ("use cache"). This allows Next.js to statically prerender the component as part of the HTML document, so it's instantly visible to the user.

       Learn more: https://nextjs.org/docs/messages/blocking-route",
         "environmentLabel": "Server",
         "label": "Blocking Route",
         "source": "app/new/page.tsx (14:7) @ Page
       > 14 |       <SearchParamsClient />
            |       ^",
         "stack": [
           "Page app/new/page.tsx (14:7)",
         ],
       }
      `)

      expect(next.cliOutput).toContain(
        'Starting static shell validation inside instant validation...'
      )
    })

    it('should error during legacy Static Shell Validation if client request IO without a Suspense boundary', async () => {
      const browser = await next.browser('/old')
      await browser.elementByCss('main')
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "code": "E1084",
         "description": "Data that blocks navigation was accessed outside of <Suspense>

       This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. Uncached data such as fetch(...), cached data with a low expire time, or connection() are all examples of data that only resolve on navigation.

       To fix this, you can either:

       Provide a fallback UI using <Suspense> around this component. This allows Next.js to stream its contents to the user as soon as it's ready, without blocking the rest of the app.

       or

       Move the asynchronous await into a Cache Component ("use cache"). This allows Next.js to statically prerender the component as part of the HTML document, so it's instantly visible to the user.

       Learn more: https://nextjs.org/docs/messages/blocking-route",
         "environmentLabel": "Server",
         "label": "Blocking Route",
         "source": "app/old/page.tsx (11:7) @ Page
       > 11 |       <SearchParamsClient />
            |       ^",
         "stack": [
           "Page app/old/page.tsx (11:7)",
         ],
       }
      `)

      expect(next.cliOutput).toContain('Starting static shell validation...')
    })
  } else {
    it('errors during build if client request IO without a Suspense boundary', async () => {
      const { cliOutput, exitCode } = await next.build()
      expect(exitCode).toBe(1)
      expect(cliOutput).toContain(
        'Error: Route "/new": Uncached data was accessed outside of <Suspense>.'
      )
      expect(cliOutput).toContain(
        'Error: Route "/old": Uncached data was accessed outside of <Suspense>.'
      )
    })
  }
})
