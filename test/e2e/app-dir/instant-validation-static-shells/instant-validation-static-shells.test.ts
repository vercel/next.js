import { nextTestSetup } from 'e2e-utils'
import { waitForNoErrorToast } from 'next-test-utils'
import { join } from 'node:path'

describe('instant validation - opting out of static shells', () => {
  const { next, skipped, isNextDev } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'valid'),
    skipDeployment: true,
  })
  if (skipped) return

  // NOTE: if something's wrong in build, we'll fail before any tests run.
  // Visiting the pages is mostly just a sanity check.

  it('does not require a static shell if a root layouts is configured as blocking', async () => {
    const browser = await next.browser('/blocking-root-layout')
    await browser.elementByCss('main')
    if (isNextDev) await waitForNoErrorToast(browser)
  })
  it('does not require a static shell if a layout is configured as blocking', async () => {
    const browser = await next.browser('/blocking-layout')
    await browser.elementByCss('main')
    if (isNextDev) await waitForNoErrorToast(browser)
  })
  it('does not require a static shell if a page is configured as blocking', async () => {
    const browser = await next.browser('/blocking-page')
    await browser.elementByCss('main')
    if (isNextDev) await waitForNoErrorToast(browser)
  })
})

describe.each([
  { debugChannelEnabled: true, description: 'with debug channel' },
  { debugChannelEnabled: false, description: 'without debug channel' },
])('instant validation - $description', ({ debugChannelEnabled }) => {
  describe('requires a static shell if a below a static layout page is configured as blocking', () => {
    const { next, skipped, isNextDev } = nextTestSetup({
      files: join(__dirname, 'fixtures', 'invalid-blocking-page-below-static'),
      skipStart: true,
      skipDeployment: true,
      env: {
        REACT_DEBUG_CHANNEL: debugChannelEnabled ? '1' : '',
      },
    })
    if (skipped) return

    if (isNextDev) {
      beforeAll(() => next.start())
      it('errors in dev', async () => {
        const browser = await next.browser('/blocking-page-below-static')
        await browser.elementByCss('main')
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "description": "Data that blocks navigation was accessed outside of <Suspense>

         This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. Uncached data such as fetch(...), cached data with a low expire time, or connection() are all examples of data that only resolve on navigation.

         To fix this, you can either:

         Provide a fallback UI using <Suspense> around this component. This allows Next.js to stream its contents to the user as soon as it's ready, without blocking the rest of the app.

         or

         Move the asynchronous await into a Cache Component ("use cache"). This allows Next.js to statically prerender the component as part of the HTML document, so it's instantly visible to the user.

         Learn more: https://nextjs.org/docs/messages/blocking-route",
           "environmentLabel": "Server",
           "label": "Blocking Route",
           "source": "app/blocking-page-below-static/page.tsx (6:19) @ Page
         > 6 |   await connection()
             |                   ^",
           "stack": [
             "Page app/blocking-page-below-static/page.tsx (6:19)",
           ],
         }
        `)
      })
    } else {
      let didBuildError = false
      beforeAll(async () => {
        try {
          await next.start()
        } catch (err) {
          didBuildError = true
        }
      })
      it('errors during build', () => {
        expect(didBuildError).toBe(true)
        expect(next.cliOutput).toContain(
          'Uncached data was accessed outside of <Suspense>'
        )
      })
    }
  })
})
