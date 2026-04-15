import { nextTestSetup } from 'e2e-utils'
import {
  expectNoBuildValidationErrors,
  expectBuildValidationSkipped,
  extractBuildValidationError,
  waitForValidation,
} from 'e2e-utils/instant-validation'
import {
  openRedbox,
  retry,
  waitForNoErrorToast,
  waitForRedbox,
} from '../../../lib/next-test-utils'
import {
  createRedboxSnapshot,
  ErrorSnapshot,
  RedboxSnapshot,
} from '../../../lib/add-redbox-matchers'
import { Playwright } from '../../../lib/next-webdriver'

describe('instant validation', () => {
  const { next, skipped, isNextDev, isNextStart, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
    env: {
      NEXT_TEST_LOG_VALIDATION: '1',
    },
  })
  if (skipped) return

  if (isNextStart && !isTurbopack) {
    // TODO(instant-validation-build): snapshot tests for webpack
    it.skip('TODO: snapshot tests for webpack', () => {})
    return
  }

  if (isNextStart) {
    beforeAll(async () => {
      await next.build({ args: ['--experimental-build-mode', 'compile'] })
    })
    afterEach(async () => {
      await next.stop()
    })
  } else {
    beforeAll(async () => {
      await next.start()
    })
  }

  let currentCliOutputIndex = 0
  beforeEach(() => {
    currentCliOutputIndex = next.cliOutput.length
  })

  function getCliOutputSinceMark(): string {
    if (next.cliOutput.length < currentCliOutputIndex) {
      // cliOutput shrank since we started the test, so something (like a `sandbox`) reset the logs
      currentCliOutputIndex = 0
    }
    return next.cliOutput.slice(currentCliOutputIndex)
  }

  const prerender = async (pathname: string) => {
    const args = [
      '--experimental-build-mode',
      'generate',
      '--debug-build-paths',
      `app${pathname}/page.tsx`,
    ]
    return await next.build({ args })
  }

  const NO_VALIDATION_ERRORS_WAIT: Parameters<typeof waitForNoErrorToast>[1] = {
    waitInMs: 500,
  }

  async function expectNoDevValidationErrors(
    browser: Playwright,
    url: string
  ): Promise<void> {
    await waitForValidation(url, getCliOutputSinceMark)
    await waitForNoErrorToast(browser, NO_VALIDATION_ERRORS_WAIT)
  }

  const cases = isNextDev
    ? [
        { isClientNav: false, description: 'dev - initial load' },
        { isClientNav: true, description: 'dev - client navigation' },
      ]
    : [{ isClientNav: false, description: 'build' }]

  describe.each(cases)('$description', ({ isClientNav }) => {
    /**
     * Navigate to a page either via initial load or soft navigation.
     * For soft nav, navigates to the index page first, then clicks the link.
     */
    async function navigateTo(href: string) {
      if (!isClientNav) {
        // Initial load - navigate directly
        const browser = await next.browser(href)
        await browser.elementByCss('main')
        return browser
      }

      // Soft nav - go to index page first, then click link
      const indexPage = href.startsWith('/default/')
        ? '/default'
        : '/suspense-in-root'
      const browser = await next.browser(indexPage)
      const initialRootLayoutTimestamp = await browser
        .elementById('root-layout-timestamp')
        .text()

      await browser
        .elementByCss(`[data-link-type="soft"][href="${href}"]`)
        .click()

      await retry(
        async () => {
          expect(await browser.url()).toContain(href)
        },
        undefined,
        100,
        'wait for url to change'
      )

      // Sanity check: we shouldn't have switched or otherwise refetched the root layout
      const finalRootLayoutTimestamp = await browser
        .elementById('root-layout-timestamp')
        .text()
      expect(initialRootLayoutTimestamp).toBe(finalRootLayoutTimestamp)
      return browser
    }

    it('valid - static prefetch - suspense around runtime and dynamic', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/suspense-around-dynamic'
        )
        await expectNoDevValidationErrors(browser, await browser.url())
      } else {
        const result = await prerender(
          '/suspense-in-root/static/suspense-around-dynamic'
        )
        expectNoBuildValidationErrors(result)
      }
    })

    it('valid - runtime prefetch - suspense only around dynamic', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/runtime/suspense-around-dynamic'
        )
        await expectNoDevValidationErrors(browser, await browser.url())
      } else {
        const result = await prerender(
          '/suspense-in-root/runtime/suspense-around-dynamic'
        )
        expectNoBuildValidationErrors(result)
      }
    })

    it('invalid - static prefetch - missing suspense around runtime', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/missing-suspense-around-runtime'
        )
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "cause": [
             {
               "label": "Caused by: Instant Validation",
               "source": "app/suspense-in-root/static/missing-suspense-around-runtime/page.tsx (3:33) @ unstable_instant
         > 3 | export const unstable_instant = {
             |                                 ^",
               "stack": [
                 "unstable_instant app/suspense-in-root/static/missing-suspense-around-runtime/page.tsx (3:33)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
           "code": "E1078",
           "description": "Runtime data was accessed outside of <Suspense>

         This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. cookies(), headers(), params, and searchParams are examples of Runtime data that can only come from a user request.

         To fix this:

         Provide a fallback UI using <Suspense> around this component.

         or

         Move the Runtime data access into a deeper component wrapped in <Suspense>.

         In either case this allows Next.js to stream its contents to the user when they request the page, while still providing an initial UI that is prerendered and prefetchable for instant navigations.

         Learn more: https://nextjs.org/docs/messages/blocking-route",
           "environmentLabel": "Server",
           "label": "Blocking Route",
           "source": "app/suspense-in-root/static/missing-suspense-around-runtime/page.tsx (9:16) @ Page
         >  9 |   await cookies()
              |                ^",
           "stack": [
             "Page app/suspense-in-root/static/missing-suspense-around-runtime/page.tsx (9:16)",
           ],
         }
        `)
      } else {
        const result = await prerender(
          '/suspense-in-root/static/missing-suspense-around-runtime'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
         "Error: Route "/suspense-in-root/static/missing-suspense-around-runtime": Runtime data such as \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` was accessed outside of \`<Suspense>\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/blocking-route
             at body (<anonymous>)
             at html (<anonymous>)
             at a (<anonymous>)
         Build-time instant validation failed for route "/suspense-in-root/static/missing-suspense-around-runtime".
         Stopping prerender due to instant validation errors."
        `)
        expect(result.exitCode).toBe(1)
      }
    })

    it('invalid - static prefetch - missing suspense around dynamic', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/missing-suspense-around-dynamic'
        )
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "cause": [
             {
               "label": "Caused by: Instant Validation",
               "source": "app/suspense-in-root/static/missing-suspense-around-dynamic/page.tsx (3:33) @ unstable_instant
         > 3 | export const unstable_instant = { prefetch: 'static' }
             |                                 ^",
               "stack": [
                 "unstable_instant app/suspense-in-root/static/missing-suspense-around-dynamic/page.tsx (3:33)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
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
           "source": "app/suspense-in-root/static/missing-suspense-around-dynamic/page.tsx (6:19) @ Page
         > 6 |   await connection()
             |                   ^",
           "stack": [
             "Page app/suspense-in-root/static/missing-suspense-around-dynamic/page.tsx (6:19)",
           ],
         }
        `)
      } else {
        const result = await prerender(
          '/suspense-in-root/static/missing-suspense-around-dynamic'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
         "Error: Route "/suspense-in-root/static/missing-suspense-around-dynamic": Uncached data, \`params\`, \`searchParams\`, or \`connection()\` was accessed outside of \`<Suspense>\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/blocking-route
             at body (<anonymous>)
             at html (<anonymous>)
             at a (<anonymous>)
         Build-time instant validation failed for route "/suspense-in-root/static/missing-suspense-around-dynamic".
         Stopping prerender due to instant validation errors."
        `)
        expect(result.exitCode).toBe(1)
      }
    })

    it('invalid - runtime prefetch - missing suspense around dynamic', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/runtime/missing-suspense-around-dynamic'
        )
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "cause": [
             {
               "label": "Caused by: Instant Validation",
               "source": "app/suspense-in-root/runtime/missing-suspense-around-dynamic/page.tsx (4:33) @ unstable_instant
         > 4 | export const unstable_instant = {
             |                                 ^",
               "stack": [
                 "unstable_instant app/suspense-in-root/runtime/missing-suspense-around-dynamic/page.tsx (4:33)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
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
           "source": "app/suspense-in-root/runtime/missing-suspense-around-dynamic/page.tsx (26:19) @ Dynamic
         > 26 |   await connection()
              |                   ^",
           "stack": [
             "Dynamic app/suspense-in-root/runtime/missing-suspense-around-dynamic/page.tsx (26:19)",
             "Page app/suspense-in-root/runtime/missing-suspense-around-dynamic/page.tsx (19:9)",
           ],
         }
        `)
      } else {
        const result = await prerender(
          '/suspense-in-root/runtime/missing-suspense-around-dynamic'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
         "Error: Route "/suspense-in-root/runtime/missing-suspense-around-dynamic": Uncached data, \`params\`, \`searchParams\`, or \`connection()\` was accessed outside of \`<Suspense>\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/blocking-route
             at div (<anonymous>)
             at main (<anonymous>)
             at body (<anonymous>)
             at html (<anonymous>)
             at a (<anonymous>)
         Build-time instant validation failed for route "/suspense-in-root/runtime/missing-suspense-around-dynamic".
         Stopping prerender due to instant validation errors."
        `)
        expect(result.exitCode).toBe(1)
      }
    })

    it('invalid - static prefetch - missing suspense around dynamic in a layout', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/missing-suspense-around-dynamic-layout'
        )
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "cause": [
             {
               "label": "Caused by: Instant Validation",
               "source": "app/suspense-in-root/static/missing-suspense-around-dynamic-layout/layout.tsx (4:33) @ unstable_instant
         > 4 | export const unstable_instant = {
             |                                 ^",
               "stack": [
                 "unstable_instant app/suspense-in-root/static/missing-suspense-around-dynamic-layout/layout.tsx (4:33)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
           "code": "E1078",
           "description": "Runtime data was accessed outside of <Suspense>

         This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. cookies(), headers(), params, and searchParams are examples of Runtime data that can only come from a user request.

         To fix this:

         Provide a fallback UI using <Suspense> around this component.

         or

         Move the Runtime data access into a deeper component wrapped in <Suspense>.

         In either case this allows Next.js to stream its contents to the user when they request the page, while still providing an initial UI that is prerendered and prefetchable for instant navigations.

         Learn more: https://nextjs.org/docs/messages/blocking-route",
           "environmentLabel": "Server",
           "label": "Blocking Route",
           "source": "app/suspense-in-root/static/missing-suspense-around-dynamic-layout/layout.tsx (10:16) @ Layout
         > 10 |   await cookies()
              |                ^",
           "stack": [
             "Layout app/suspense-in-root/static/missing-suspense-around-dynamic-layout/layout.tsx (10:16)",
           ],
         }
        `)
      } else {
        const result = await prerender(
          '/suspense-in-root/static/missing-suspense-around-dynamic-layout'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
         "Error: Route "/suspense-in-root/static/missing-suspense-around-dynamic-layout": Runtime data such as \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` was accessed outside of \`<Suspense>\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/blocking-route
             at body (<anonymous>)
             at html (<anonymous>)
             at a (<anonymous>)
         Build-time instant validation failed for route "/suspense-in-root/static/missing-suspense-around-dynamic-layout".
         Stopping prerender due to instant validation errors."
        `)
        expect(result.exitCode).toBe(1)
      }
    })

    it('invalid - runtime prefetch - missing suspense around dynamic in a layout', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/runtime/missing-suspense-around-dynamic-layout'
        )
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "cause": [
             {
               "label": "Caused by: Instant Validation",
               "source": "app/suspense-in-root/runtime/missing-suspense-around-dynamic-layout/layout.tsx (4:33) @ unstable_instant
         > 4 | export const unstable_instant = {
             |                                 ^",
               "stack": [
                 "unstable_instant app/suspense-in-root/runtime/missing-suspense-around-dynamic-layout/layout.tsx (4:33)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
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
           "source": "app/suspense-in-root/runtime/missing-suspense-around-dynamic-layout/layout.tsx (11:19) @ Layout
         > 11 |   await connection()
              |                   ^",
           "stack": [
             "Layout app/suspense-in-root/runtime/missing-suspense-around-dynamic-layout/layout.tsx (11:19)",
           ],
         }
        `)
      } else {
        const result = await prerender(
          '/suspense-in-root/runtime/missing-suspense-around-dynamic-layout'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
         "Error: Route "/suspense-in-root/runtime/missing-suspense-around-dynamic-layout": Uncached data, \`params\`, \`searchParams\`, or \`connection()\` was accessed outside of \`<Suspense>\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/blocking-route
             at body (<anonymous>)
             at html (<anonymous>)
             at a (<anonymous>)
         Build-time instant validation failed for route "/suspense-in-root/runtime/missing-suspense-around-dynamic-layout".
         Stopping prerender due to instant validation errors."
        `)
        expect(result.exitCode).toBe(1)
      }
    })

    it('invalid - static prefetch - missing suspense around params', async () => {
      // In build mode, providing params in the sample makes them resolve
      // immediately, so the blocking behavior isn't detected. This case
      // is only testable in dev mode.
      if (!isNextDev) return
      const browser = await navigateTo(
        '/suspense-in-root/static/missing-suspense-around-params/123'
      )
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "cause": [
           {
             "label": "Caused by: Instant Validation",
             "source": "app/suspense-in-root/static/missing-suspense-around-params/[param]/page.tsx (1:33) @ unstable_instant
       > 1 | export const unstable_instant = {
           |                                 ^",
             "stack": [
               "unstable_instant app/suspense-in-root/static/missing-suspense-around-params/[param]/page.tsx (1:33)",
               "Set.forEach <anonymous>",
             ],
           },
         ],
         "code": "E1078",
         "description": "Runtime data was accessed outside of <Suspense>

       This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. cookies(), headers(), params, and searchParams are examples of Runtime data that can only come from a user request.

       To fix this:

       Provide a fallback UI using <Suspense> around this component.

       or

       Move the Runtime data access into a deeper component wrapped in <Suspense>.

       In either case this allows Next.js to stream its contents to the user when they request the page, while still providing an initial UI that is prerendered and prefetchable for instant navigations.

       Learn more: https://nextjs.org/docs/messages/blocking-route",
         "environmentLabel": "Server",
         "label": "Blocking Route",
         "source": "app/suspense-in-root/static/missing-suspense-around-params/[param]/page.tsx (20:21) @ Runtime
       > 20 |   const { param } = await params
            |                     ^",
         "stack": [
           "Runtime app/suspense-in-root/static/missing-suspense-around-params/[param]/page.tsx (20:21)",
           "Page app/suspense-in-root/static/missing-suspense-around-params/[param]/page.tsx (14:7)",
         ],
       }
      `)
    })

    it('valid - runtime prefetch - does not require Suspense around params', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/runtime/valid-no-suspense-around-params/123'
        )
        await expectNoDevValidationErrors(browser, await browser.url())
      } else {
        const result = await prerender(
          '/suspense-in-root/runtime/valid-no-suspense-around-params/[param]'
        )
        expectNoBuildValidationErrors(result)
      }
    })

    it('invalid - static prefetch - missing suspense around search params', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/missing-suspense-around-search-params?foo=bar'
        )
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "cause": [
             {
               "label": "Caused by: Instant Validation",
               "source": "app/suspense-in-root/static/missing-suspense-around-search-params/page.tsx (1:33) @ unstable_instant
         > 1 | export const unstable_instant = {
             |                                 ^",
               "stack": [
                 "unstable_instant app/suspense-in-root/static/missing-suspense-around-search-params/page.tsx (1:33)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
           "code": "E1078",
           "description": "Runtime data was accessed outside of <Suspense>

         This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. cookies(), headers(), params, and searchParams are examples of Runtime data that can only come from a user request.

         To fix this:

         Provide a fallback UI using <Suspense> around this component.

         or

         Move the Runtime data access into a deeper component wrapped in <Suspense>.

         In either case this allows Next.js to stream its contents to the user when they request the page, while still providing an initial UI that is prerendered and prefetchable for instant navigations.

         Learn more: https://nextjs.org/docs/messages/blocking-route",
           "environmentLabel": "Server",
           "label": "Blocking Route",
           "source": "app/suspense-in-root/static/missing-suspense-around-search-params/page.tsx (7:18) @ Page
         >  7 |   const search = await searchParams
              |                  ^",
           "stack": [
             "Page app/suspense-in-root/static/missing-suspense-around-search-params/page.tsx (7:18)",
           ],
         }
        `)
      } else {
        const result = await prerender(
          '/suspense-in-root/static/missing-suspense-around-search-params'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
         "Error: Route "/suspense-in-root/static/missing-suspense-around-search-params": Runtime data such as \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` was accessed outside of \`<Suspense>\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/blocking-route
             at body (<anonymous>)
             at html (<anonymous>)
             at a (<anonymous>)
         Build-time instant validation failed for route "/suspense-in-root/static/missing-suspense-around-search-params".
         Stopping prerender due to instant validation errors."
        `)
        expect(result.exitCode).toBe(1)
      }
    })

    it('valid - runtime prefetch - does not require Suspense around search params', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/runtime/valid-no-suspense-around-search-params?foo=bar'
        )
        await expectNoDevValidationErrors(browser, await browser.url())
      } else {
        const result = await prerender(
          '/suspense-in-root/runtime/valid-no-suspense-around-search-params'
        )
        expectNoBuildValidationErrors(result)
      }
    })

    it('valid - target segment not visible in all navigations', async () => {
      if (isNextDev) {
        // Notable special case -- we accept that the segment with the assertion might not
        // *itself* be visible in all navigations as long as they're instant.
        // A parent layout might be blocked from rendering the children slot,
        // but that's fine as long as it provides a fallback.
        //
        // This is in opposition to an alternate model we considered at some point,
        // where putting an assertion on a segment would mean that it must be visible
        // in all navigations (which would require that its parent layouts must never
        // block the children slots)
        const browser = await navigateTo(
          '/default/static/valid-blocked-children'
        )
        await expectNoDevValidationErrors(browser, await browser.url())
      } else {
        const result = await prerender('/default/static/valid-blocked-children')
        expectNoBuildValidationErrors(result)
      }
    })

    it('invalid - static prefetch - suspense too high', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/suspense-too-high'
        )
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "cause": [
             {
               "label": "Caused by: Instant Validation",
               "source": "app/suspense-in-root/static/suspense-too-high/page.tsx (3:33) @ unstable_instant
         > 3 | export const unstable_instant = {
             |                                 ^",
               "stack": [
                 "unstable_instant app/suspense-in-root/static/suspense-too-high/page.tsx (3:33)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
           "code": "E1078",
           "description": "Runtime data was accessed outside of <Suspense>

         This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. cookies(), headers(), params, and searchParams are examples of Runtime data that can only come from a user request.

         To fix this:

         Provide a fallback UI using <Suspense> around this component.

         or

         Move the Runtime data access into a deeper component wrapped in <Suspense>.

         In either case this allows Next.js to stream its contents to the user when they request the page, while still providing an initial UI that is prerendered and prefetchable for instant navigations.

         Learn more: https://nextjs.org/docs/messages/blocking-route",
           "environmentLabel": "Server",
           "label": "Blocking Route",
           "source": "app/suspense-in-root/static/suspense-too-high/page.tsx (9:16) @ Page
         >  9 |   await cookies()
              |                ^",
           "stack": [
             "Page app/suspense-in-root/static/suspense-too-high/page.tsx (9:16)",
           ],
         }
        `)
      } else {
        const result = await prerender(
          '/suspense-in-root/static/suspense-too-high'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
         "Error: Route "/suspense-in-root/static/suspense-too-high": Runtime data such as \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` was accessed outside of \`<Suspense>\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/blocking-route
             at a (<anonymous>)
             at div (<anonymous>)
             at div (<anonymous>)
             at body (<anonymous>)
             at html (<anonymous>)
             at b (<anonymous>)
         Build-time instant validation failed for route "/suspense-in-root/static/suspense-too-high".
         Stopping prerender due to instant validation errors."
        `)
        expect(result.exitCode).toBe(1)
      }
    })

    it('invalid - runtime prefetch - suspense too high', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/runtime/suspense-too-high'
        )
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "cause": [
             {
               "label": "Caused by: Instant Validation",
               "source": "app/suspense-in-root/runtime/suspense-too-high/page.tsx (4:33) @ unstable_instant
         > 4 | export const unstable_instant = {
             |                                 ^",
               "stack": [
                 "unstable_instant app/suspense-in-root/runtime/suspense-too-high/page.tsx (4:33)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
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
           "source": "app/suspense-in-root/runtime/suspense-too-high/page.tsx (27:19) @ Dynamic
         > 27 |   await connection()
              |                   ^",
           "stack": [
             "Dynamic app/suspense-in-root/runtime/suspense-too-high/page.tsx (27:19)",
             "Page app/suspense-in-root/runtime/suspense-too-high/page.tsx (20:9)",
           ],
         }
        `)
      } else {
        const result = await prerender(
          '/suspense-in-root/runtime/suspense-too-high'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
         "Error: Route "/suspense-in-root/runtime/suspense-too-high": Uncached data, \`params\`, \`searchParams\`, or \`connection()\` was accessed outside of \`<Suspense>\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/blocking-route
             at div (<anonymous>)
             at main (<anonymous>)
             at a (<anonymous>)
             at body (<anonymous>)
             at html (<anonymous>)
             at b (<anonymous>)
         Build-time instant validation failed for route "/suspense-in-root/runtime/suspense-too-high".
         Stopping prerender due to instant validation errors."
        `)
        expect(result.exitCode).toBe(1)
      }
    })

    it('invalid - runtime prefetch - sync IO after runtime API', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/runtime/invalid-sync-io'
        )
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "code": "E394",
           "description": "Route "/suspense-in-root/runtime/invalid-sync-io" used \`Date.now()\` before accessing either uncached data (e.g. \`fetch()\`) or awaiting \`connection()\`. When configured for Runtime prefetching, accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-runtime-current-time",
           "environmentLabel": "Server",
           "label": "Console Error",
           "source": "app/suspense-in-root/runtime/invalid-sync-io/page.tsx (11:20) @ Page
         > 11 |   const now = Date.now()
              |                    ^",
           "stack": [
             "Page app/suspense-in-root/runtime/invalid-sync-io/page.tsx (11:20)",
             "Page <anonymous>",
           ],
         }
        `)
      } else {
        const result = await prerender(
          '/suspense-in-root/runtime/invalid-sync-io'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
         "Error: Route "/suspense-in-root/runtime/invalid-sync-io" used \`Date.now()\` before accessing either uncached data (e.g. \`fetch()\`) or awaiting \`connection()\`. When configured for Runtime prefetching, accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-runtime-current-time
             at a (app/suspense-in-root/runtime/invalid-sync-io/page.tsx:11:20)
            9 | export default async function Page() {
           10 |   await cookies()
         > 11 |   const now = Date.now()
              |                    ^
           12 |   return (
           13 |     <main>
           14 |       <p>This page uses sync IO after awaiting cookies(): {now}</p>
         Error: Route "/suspense-in-root/runtime/invalid-sync-io" used \`Date.now()\` before accessing either uncached data (e.g. \`fetch()\`) or awaiting \`connection()\`. When configured for Runtime prefetching, accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-runtime-current-time
             at b (app/suspense-in-root/runtime/invalid-sync-io/page.tsx:11:20)
            9 | export default async function Page() {
           10 |   await cookies()
         > 11 |   const now = Date.now()
              |                    ^
           12 |   return (
           13 |     <main>
           14 |       <p>This page uses sync IO after awaiting cookies(): {now}</p>
         Build-time instant validation failed for route "/suspense-in-root/runtime/invalid-sync-io".
         Stopping prerender due to instant validation errors."
        `)
        expect(result.exitCode).toBe(1)
      }
    })

    it('invalid - runtime prefetch - sync IO in runtime segment with valid static parent', async () => {
      // The static parent layout has sync IO after cookies() which is fine
      // because it's not runtime-prefetchable. But the page itself has
      // runtime prefetch enabled and also has sync IO after cookies(),
      // which should error.
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/runtime/invalid-sync-io-in-runtime-with-valid-static-parent'
        )
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "code": "E394",
           "description": "Route "/suspense-in-root/runtime/invalid-sync-io-in-runtime-with-valid-static-parent" used \`Date.now()\` before accessing either uncached data (e.g. \`fetch()\`) or awaiting \`connection()\`. When configured for Runtime prefetching, accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-runtime-current-time",
           "environmentLabel": "Server",
           "label": "Console Error",
           "source": "app/suspense-in-root/runtime/invalid-sync-io-in-runtime-with-valid-static-parent/page.tsx (15:20) @ Page
         > 15 |   const now = Date.now()
              |                    ^",
           "stack": [
             "Page app/suspense-in-root/runtime/invalid-sync-io-in-runtime-with-valid-static-parent/page.tsx (15:20)",
             "Page <anonymous>",
           ],
         }
        `)
      } else {
        const result = await prerender(
          '/suspense-in-root/runtime/invalid-sync-io-in-runtime-with-valid-static-parent'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
         "Error: Route "/suspense-in-root/runtime/invalid-sync-io-in-runtime-with-valid-static-parent" used \`Date.now()\` before accessing either uncached data (e.g. \`fetch()\`) or awaiting \`connection()\`. When configured for Runtime prefetching, accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-runtime-current-time
             at a (app/suspense-in-root/runtime/invalid-sync-io-in-runtime-with-valid-static-parent/page.tsx:15:20)
           13 | export default async function Page() {
           14 |   await cookies()
         > 15 |   const now = Date.now()
              |                    ^
           16 |   return (
           17 |     <main>
           18 |       <p>Runtime page with sync IO after cookies: {now}</p>
         Error: Route "/suspense-in-root/runtime/invalid-sync-io-in-runtime-with-valid-static-parent" used \`Date.now()\` before accessing either uncached data (e.g. \`fetch()\`) or awaiting \`connection()\`. When configured for Runtime prefetching, accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-runtime-current-time
             at b (app/suspense-in-root/runtime/invalid-sync-io-in-runtime-with-valid-static-parent/page.tsx:15:20)
           13 | export default async function Page() {
           14 |   await cookies()
         > 15 |   const now = Date.now()
              |                    ^
           16 |   return (
           17 |     <main>
           18 |       <p>Runtime page with sync IO after cookies: {now}</p>
         Error: Route "/suspense-in-root/runtime/invalid-sync-io-in-runtime-with-valid-static-parent" used \`Date.now()\` before accessing either uncached data (e.g. \`fetch()\`) or awaiting \`connection()\`. When configured for Runtime prefetching, accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-runtime-current-time
             at c (app/suspense-in-root/runtime/invalid-sync-io-in-runtime-with-valid-static-parent/page.tsx:15:20)
           13 | export default async function Page() {
           14 |   await cookies()
         > 15 |   const now = Date.now()
              |                    ^
           16 |   return (
           17 |     <main>
           18 |       <p>Runtime page with sync IO after cookies: {now}</p>
         Build-time instant validation failed for route "/suspense-in-root/runtime/invalid-sync-io-in-runtime-with-valid-static-parent".
         Stopping prerender due to instant validation errors."
        `)
        expect(result.exitCode).toBe(1)
      }
    })

    it('invalid - runtime prefetch - sync IO after public cache with cookie input', async () => {
      // A public "use cache" function receives cookies() as a promise
      // input (for cache keying). The cache body doesn't read the cookies.
      // After the cache resolves, Date.now() is sync IO that should error
      // because the cookies input causes the cache to resolve during the
      // EarlyRuntime stage where canSyncInterrupt returns true.
      //
      // If the stage discrimination for cache inputs were broken (always
      // using Runtime instead of getRuntimeStage), the cookies would
      // resolve at Runtime where canSyncInterrupt returns false, and the
      // sync IO would be silently allowed.
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/runtime/invalid-sync-io-after-cache-with-cookie-input'
        )
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "code": "E394",
           "description": "Route "/suspense-in-root/runtime/invalid-sync-io-after-cache-with-cookie-input" used \`Date.now()\` before accessing either uncached data (e.g. \`fetch()\`) or awaiting \`connection()\`. When configured for Runtime prefetching, accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-runtime-current-time",
           "environmentLabel": "Server",
           "label": "Console Error",
           "source": "app/suspense-in-root/runtime/invalid-sync-io-after-cache-with-cookie-input/page.tsx (31:20) @ Page
         > 31 |   const now = Date.now()
              |                    ^",
           "stack": [
             "Page app/suspense-in-root/runtime/invalid-sync-io-after-cache-with-cookie-input/page.tsx (31:20)",
             "Page <anonymous>",
           ],
         }
        `)
      } else {
        const result = await prerender(
          '/suspense-in-root/runtime/invalid-sync-io-after-cache-with-cookie-input'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
         "Error: Route "/suspense-in-root/runtime/invalid-sync-io-after-cache-with-cookie-input" accessed cookie "testCookie" which is not defined in the \`samples\` of \`unstable_instant\`. Add it to the sample's \`cookies\` array, or \`{ name: "testCookie", value: null }\` if it should be absent.
             at <unknown> (app/suspense-in-root/runtime/invalid-sync-io-after-cache-with-cookie-input/page.tsx:29:49)
           27 |
           28 | export default async function Page() {
         > 29 |   const cookiePromise = cookies().then((c) => c.get('testCookie')?.value ?? '')
              |                                                 ^
           30 |   await cachedFn(cookiePromise)
           31 |   const now = Date.now()
           32 |   return ( {
           digest: 'INSTANT_VALIDATION_ERROR'
         }
         Build-time instant validation failed for route "/suspense-in-root/runtime/invalid-sync-io-after-cache-with-cookie-input".
         Stopping prerender due to instant validation errors."
        `)
        expect(result.exitCode).toBe(1)
      }
    })

    it('valid - runtime prefetch - sync IO in a static parent layout is allowed', async () => {
      // Sync IO (Date.now()) in a layout that is NOT runtime-prefetchable
      // should not error, even though the child page has runtime prefetch
      // enabled. Only segments that are runtime-prefetchable should be
      // validated for sync IO after runtime APIs.
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/runtime/valid-sync-io-in-static-parent'
        )
        await expectNoDevValidationErrors(browser, await browser.url())
      } else {
        const result = await prerender(
          '/suspense-in-root/runtime/valid-sync-io-in-static-parent'
        )
        expectNoBuildValidationErrors(result)
      }
    })

    it('invalid - runtime prefetch - sync IO in generateMetadata', async () => {
      // The page has runtime prefetch enabled. generateMetadata uses
      // cookies() then Date.now(). Since metadata belongs to the Page
      // and the Page is runtime-prefetchable, this should error.
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/runtime/invalid-sync-io-in-generate-metadata'
        )
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "code": "E394",
           "description": "Route "/suspense-in-root/runtime/invalid-sync-io-in-generate-metadata" used \`Date.now()\` before accessing either uncached data (e.g. \`fetch()\`) or awaiting \`connection()\`. When configured for Runtime prefetching, accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-runtime-current-time",
           "environmentLabel": "Server",
           "label": "Console Error",
           "source": "app/suspense-in-root/runtime/invalid-sync-io-in-generate-metadata/page.tsx (12:20) @ Module.generateMetadata
         > 12 |   const now = Date.now()
              |                    ^",
           "stack": [
             "Module.generateMetadata app/suspense-in-root/runtime/invalid-sync-io-in-generate-metadata/page.tsx (12:20)",
             "Next.MetadataOutlet <anonymous>",
           ],
         }
        `)
      } else {
        const result = await prerender(
          '/suspense-in-root/runtime/invalid-sync-io-in-generate-metadata'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
         "Error: Route "/suspense-in-root/runtime/invalid-sync-io-in-generate-metadata" used \`Date.now()\` before accessing either uncached data (e.g. \`fetch()\`) or awaiting \`connection()\`. When configured for Runtime prefetching, accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-runtime-current-time
             at Module.e [as generateMetadata] (app/suspense-in-root/runtime/invalid-sync-io-in-generate-metadata/page.tsx:12:20)
           10 | export async function generateMetadata() {
           11 |   await cookies()
         > 12 |   const now = Date.now()
              |                    ^
           13 |   return {
           14 |     title: \`Sync IO in metadata: \${now}\`,
           15 |   }
         Error: Route "/suspense-in-root/runtime/invalid-sync-io-in-generate-metadata" used \`Date.now()\` before accessing either uncached data (e.g. \`fetch()\`) or awaiting \`connection()\`. When configured for Runtime prefetching, accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-runtime-current-time
             at Module.e [as generateMetadata] (app/suspense-in-root/runtime/invalid-sync-io-in-generate-metadata/page.tsx:12:20)
           10 | export async function generateMetadata() {
           11 |   await cookies()
         > 12 |   const now = Date.now()
              |                    ^
           13 |   return {
           14 |     title: \`Sync IO in metadata: \${now}\`,
           15 |   }
         Build-time instant validation failed for route "/suspense-in-root/runtime/invalid-sync-io-in-generate-metadata".
         Stopping prerender due to instant validation errors."
        `)
        expect(result.exitCode).toBe(1)
      }
    })

    it('valid - runtime prefetch - sync IO in generateMetadata on a static page is allowed', async () => {
      // The page does NOT have runtime prefetch. generateMetadata uses
      // cookies() then Date.now(). Since no segment is runtime-prefetchable,
      // sync IO in generateMetadata should be allowed.
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/runtime/valid-sync-io-in-generate-metadata-static-page'
        )
        await expectNoDevValidationErrors(browser, await browser.url())
      } else {
        const result = await prerender(
          '/suspense-in-root/runtime/valid-sync-io-in-generate-metadata-static-page'
        )
        expectNoBuildValidationErrors(result)
      }
    })

    it('invalid - runtime prefetch - sync IO in layout generateMetadata when page is prefetchable', async () => {
      // The layout has generateMetadata with sync IO after cookies().
      // The layout itself does NOT have runtime prefetch, but the child
      // page does. Since metadata belongs to the Page, and the Page is
      // runtime-prefetchable, sync IO in the layout's generateMetadata
      // should error.
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/runtime/invalid-sync-io-in-layout-generate-metadata'
        )
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "code": "E394",
           "description": "Route "/suspense-in-root/runtime/invalid-sync-io-in-layout-generate-metadata" used \`Date.now()\` before accessing either uncached data (e.g. \`fetch()\`) or awaiting \`connection()\`. When configured for Runtime prefetching, accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-runtime-current-time",
           "environmentLabel": "Server",
           "label": "Console Error",
           "source": "app/suspense-in-root/runtime/invalid-sync-io-in-layout-generate-metadata/layout.tsx (11:20) @ Module.generateMetadata
         > 11 |   const now = Date.now()
              |                    ^",
           "stack": [
             "Module.generateMetadata app/suspense-in-root/runtime/invalid-sync-io-in-layout-generate-metadata/layout.tsx (11:20)",
             "Next.MetadataOutlet <anonymous>",
           ],
         }
        `)
      } else {
        const result = await prerender(
          '/suspense-in-root/runtime/invalid-sync-io-in-layout-generate-metadata'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
         "Error: Route "/suspense-in-root/runtime/invalid-sync-io-in-layout-generate-metadata" used \`Date.now()\` before accessing either uncached data (e.g. \`fetch()\`) or awaiting \`connection()\`. When configured for Runtime prefetching, accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-runtime-current-time
             at Module.d [as generateMetadata] (app/suspense-in-root/runtime/invalid-sync-io-in-layout-generate-metadata/layout.tsx:11:20)
            9 | export async function generateMetadata() {
           10 |   await cookies()
         > 11 |   const now = Date.now()
              |                    ^
           12 |   return {
           13 |     title: \`Layout metadata with sync IO: \${now}\`,
           14 |   }
         Error: Route "/suspense-in-root/runtime/invalid-sync-io-in-layout-generate-metadata" used \`Date.now()\` before accessing either uncached data (e.g. \`fetch()\`) or awaiting \`connection()\`. When configured for Runtime prefetching, accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-runtime-current-time
             at Module.d [as generateMetadata] (app/suspense-in-root/runtime/invalid-sync-io-in-layout-generate-metadata/layout.tsx:11:20)
            9 | export async function generateMetadata() {
           10 |   await cookies()
         > 11 |   const now = Date.now()
              |                    ^
           12 |   return {
           13 |     title: \`Layout metadata with sync IO: \${now}\`,
           14 |   }
         Error: Route "/suspense-in-root/runtime/invalid-sync-io-in-layout-generate-metadata" used \`Date.now()\` before accessing either uncached data (e.g. \`fetch()\`) or awaiting \`connection()\`. When configured for Runtime prefetching, accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-runtime-current-time
             at Module.d [as generateMetadata] (app/suspense-in-root/runtime/invalid-sync-io-in-layout-generate-metadata/layout.tsx:11:20)
            9 | export async function generateMetadata() {
           10 |   await cookies()
         > 11 |   const now = Date.now()
              |                    ^
           12 |   return {
           13 |     title: \`Layout metadata with sync IO: \${now}\`,
           14 |   }
         Build-time instant validation failed for route "/suspense-in-root/runtime/invalid-sync-io-in-layout-generate-metadata".
         Stopping prerender due to instant validation errors."
        `)
        expect(result.exitCode).toBe(1)
      }
    })

    it('valid - runtime prefetch - sync IO in layout generateMetadata when page is NOT prefetchable', async () => {
      // The layout has generateMetadata with sync IO after cookies().
      // Neither the layout nor the page has runtime prefetch. Since no
      // segment is runtime-prefetchable, sync IO in generateMetadata
      // should be allowed.
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/runtime/valid-sync-io-in-layout-generate-metadata-static-page'
        )
        await expectNoDevValidationErrors(browser, await browser.url())
      } else {
        const result = await prerender(
          '/suspense-in-root/runtime/valid-sync-io-in-layout-generate-metadata-static-page'
        )
        expectNoBuildValidationErrors(result)
      }
    })

    it('valid - no suspense needed around dynamic in page if loading.js is present', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/valid-only-loading-around-dynamic'
        )
        await expectNoDevValidationErrors(browser, await browser.url())
      } else {
        const result = await prerender(
          '/suspense-in-root/static/valid-only-loading-around-dynamic'
        )
        expectNoBuildValidationErrors(result)
      }
    })

    // The page is inside a route group with loading.tsx on the parent
    // URL segment. Validation conservatively treats the route group as
    // a potential shared boundary where loading.tsx's Suspense would
    // already be revealed. A more advanced system could analyze siblings
    // to determine if such a navigation is actually possible.
    it('invalid - loading.js above route group does not cover dynamic in page', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/invalid-loading-above-route-group'
        )
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "cause": [
             {
               "label": "Caused by: Instant Validation",
               "source": "app/suspense-in-root/static/invalid-loading-above-route-group/(group)/page.tsx (4:33) @ unstable_instant
         > 4 | export const unstable_instant = {
             |                                 ^",
               "stack": [
                 "unstable_instant app/suspense-in-root/static/invalid-loading-above-route-group/(group)/page.tsx (4:33)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
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
           "source": "app/suspense-in-root/static/invalid-loading-above-route-group/(group)/page.tsx (37:19) @ Dynamic
         > 37 |   await connection()
              |                   ^",
           "stack": [
             "Dynamic app/suspense-in-root/static/invalid-loading-above-route-group/(group)/page.tsx (37:19)",
             "Page app/suspense-in-root/static/invalid-loading-above-route-group/(group)/page.tsx (25:9)",
           ],
         }
        `)
      } else {
        const result = await prerender(
          '/suspense-in-root/static/invalid-loading-above-route-group/(group)'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
         "Error: Route "/suspense-in-root/static/invalid-loading-above-route-group": Uncached data, \`params\`, \`searchParams\`, or \`connection()\` was accessed outside of \`<Suspense>\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/blocking-route
             at div (<anonymous>)
             at main (<anonymous>)
             at a (<anonymous>)
             at body (<anonymous>)
             at html (<anonymous>)
             at b (<anonymous>)
         Build-time instant validation failed for route "/suspense-in-root/static/invalid-loading-above-route-group".
         Stopping prerender due to instant validation errors."
        `)
        expect(result.exitCode).toBe(1)
      }
    })

    it('invalid - loading.js covers page, but not layout at the same level', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/invalid-dynamic-layout-with-loading'
        )
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "cause": [
             {
               "label": "Caused by: Instant Validation",
               "source": "app/suspense-in-root/static/invalid-dynamic-layout-with-loading/layout.tsx (4:33) @ unstable_instant
         > 4 | export const unstable_instant = { prefetch: 'static' }
             |                                 ^",
               "stack": [
                 "unstable_instant app/suspense-in-root/static/invalid-dynamic-layout-with-loading/layout.tsx (4:33)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
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
           "source": "app/suspense-in-root/static/invalid-dynamic-layout-with-loading/layout.tsx (24:19) @ Dynamic
         > 24 |   await connection()
              |                   ^",
           "stack": [
             "Dynamic app/suspense-in-root/static/invalid-dynamic-layout-with-loading/layout.tsx (24:19)",
             "Layout app/suspense-in-root/static/invalid-dynamic-layout-with-loading/layout.tsx (15:9)",
           ],
         }
        `)
      } else {
        const result = await prerender(
          '/suspense-in-root/static/invalid-dynamic-layout-with-loading'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
         "Error: Route "/suspense-in-root/static/invalid-dynamic-layout-with-loading": Uncached data, \`params\`, \`searchParams\`, or \`connection()\` was accessed outside of \`<Suspense>\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/blocking-route
             at div (<anonymous>)
             at body (<anonymous>)
             at html (<anonymous>)
             at a (<anonymous>)
         Build-time instant validation failed for route "/suspense-in-root/static/invalid-dynamic-layout-with-loading".
         Stopping prerender due to instant validation errors."
        `)
        expect(result.exitCode).toBe(1)
      }
    })

    describe('blocking', () => {
      it('valid - blocking layout with unstable_instant = false is allowed to block', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/static/blocking-layout'
          )
          await expectNoDevValidationErrors(browser, await browser.url())
        } else {
          const result = await prerender(
            '/suspense-in-root/static/blocking-layout'
          )
          expectNoBuildValidationErrors(result)
        }
      })

      it('invalid - missing suspense inside blocking layout', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/static/blocking-layout/missing-suspense-around-dynamic'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/static/blocking-layout/missing-suspense-around-dynamic/page.tsx (3:33) @ unstable_instant
           > 3 | export const unstable_instant = {
               |                                 ^",
                 "stack": [
                   "unstable_instant app/suspense-in-root/static/blocking-layout/missing-suspense-around-dynamic/page.tsx (3:33)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1078",
             "description": "Runtime data was accessed outside of <Suspense>

           This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. cookies(), headers(), params, and searchParams are examples of Runtime data that can only come from a user request.

           To fix this:

           Provide a fallback UI using <Suspense> around this component.

           or

           Move the Runtime data access into a deeper component wrapped in <Suspense>.

           In either case this allows Next.js to stream its contents to the user when they request the page, while still providing an initial UI that is prerendered and prefetchable for instant navigations.

           Learn more: https://nextjs.org/docs/messages/blocking-route",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/suspense-in-root/static/blocking-layout/missing-suspense-around-dynamic/page.tsx (9:16) @ Page
           >  9 |   await cookies()
                |                ^",
             "stack": [
               "Page app/suspense-in-root/static/blocking-layout/missing-suspense-around-dynamic/page.tsx (9:16)",
             ],
           }
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/static/blocking-layout/missing-suspense-around-dynamic'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/static/blocking-layout/missing-suspense-around-dynamic": Runtime data such as \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` was accessed outside of \`<Suspense>\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/blocking-route
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
           Build-time instant validation failed for route "/suspense-in-root/static/blocking-layout/missing-suspense-around-dynamic".
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })

      it('valid - blocking page inside a static layout is allowed if the layout has suspense', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/default/static/valid-blocking-inside-static'
          )
          await expectNoDevValidationErrors(browser, await browser.url())
        } else {
          const result = await prerender(
            '/default/static/valid-blocking-inside-static'
          )
          expectNoBuildValidationErrors(result)
        }
      })

      it('valid - blocking page inside a runtime layout is allowed if the layout has suspense', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/runtime/valid-blocking-inside-runtime'
          )
          await expectNoDevValidationErrors(browser, await browser.url())
        } else {
          const result = await prerender(
            '/suspense-in-root/runtime/valid-blocking-inside-runtime'
          )
          expectNoBuildValidationErrors(result)
        }
      })

      it('invalid - blocking page inside a static layout is not allowed if the layout has no suspense', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/static/invalid-blocking-inside-static'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/static/invalid-blocking-inside-static/layout.tsx (1:33) @ unstable_instant
           > 1 | export const unstable_instant = { prefetch: 'static' }
               |                                 ^",
                 "stack": [
                   "unstable_instant app/suspense-in-root/static/invalid-blocking-inside-static/layout.tsx (1:33)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1078",
             "description": "Runtime data was accessed outside of <Suspense>

           This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. cookies(), headers(), params, and searchParams are examples of Runtime data that can only come from a user request.

           To fix this:

           Provide a fallback UI using <Suspense> around this component.

           or

           Move the Runtime data access into a deeper component wrapped in <Suspense>.

           In either case this allows Next.js to stream its contents to the user when they request the page, while still providing an initial UI that is prerendered and prefetchable for instant navigations.

           Learn more: https://nextjs.org/docs/messages/blocking-route",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/suspense-in-root/static/invalid-blocking-inside-static/page.tsx (6:16) @ BlockingPage
           > 6 |   await cookies()
               |                ^",
             "stack": [
               "BlockingPage app/suspense-in-root/static/invalid-blocking-inside-static/page.tsx (6:16)",
             ],
           }
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/static/invalid-blocking-inside-static'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/static/invalid-blocking-inside-static": Runtime data such as \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` was accessed outside of \`<Suspense>\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/blocking-route
               at div (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
           Build-time instant validation failed for route "/suspense-in-root/static/invalid-blocking-inside-static".
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })

      it('invalid - blocking page inside a runtime layout is not allowed if the layout has no suspense', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/runtime/invalid-blocking-inside-runtime'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/runtime/invalid-blocking-inside-runtime/layout.tsx (3:33) @ unstable_instant
           > 3 | export const unstable_instant = {
               |                                 ^",
                 "stack": [
                   "unstable_instant app/suspense-in-root/runtime/invalid-blocking-inside-runtime/layout.tsx (3:33)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
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
             "source": "app/suspense-in-root/runtime/invalid-blocking-inside-runtime/page.tsx (6:19) @ BlockingPage
           > 6 |   await connection()
               |                   ^",
             "stack": [
               "BlockingPage app/suspense-in-root/runtime/invalid-blocking-inside-runtime/page.tsx (6:19)",
             ],
           }
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/runtime/invalid-blocking-inside-runtime'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/runtime/invalid-blocking-inside-runtime": Uncached data, \`params\`, \`searchParams\`, or \`connection()\` was accessed outside of \`<Suspense>\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/blocking-route
               at div (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
           Build-time instant validation failed for route "/suspense-in-root/runtime/invalid-blocking-inside-runtime".
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })
    })

    describe('invalid - missing suspense in parallel slot', () => {
      // The "caused by" source differs between bundlers due to parallel
      it('index', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/static/missing-suspense-in-parallel-route'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/static/missing-suspense-in-parallel-route/@slot/layout.tsx (1:33) @ unstable_instant
           > 1 | export const unstable_instant = { prefetch: 'static' }
               |                                 ^",
                 "stack": [
                   "unstable_instant app/suspense-in-root/static/missing-suspense-in-parallel-route/@slot/layout.tsx (1:33)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1078",
             "description": "Runtime data was accessed outside of <Suspense>

           This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. cookies(), headers(), params, and searchParams are examples of Runtime data that can only come from a user request.

           To fix this:

           Provide a fallback UI using <Suspense> around this component.

           or

           Move the Runtime data access into a deeper component wrapped in <Suspense>.

           In either case this allows Next.js to stream its contents to the user when they request the page, while still providing an initial UI that is prerendered and prefetchable for instant navigations.

           Learn more: https://nextjs.org/docs/messages/blocking-route",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/suspense-in-root/static/missing-suspense-in-parallel-route/@slot/page.tsx (4:16) @ IndexSlot
           > 4 |   await cookies()
               |                ^",
             "stack": [
               "IndexSlot app/suspense-in-root/static/missing-suspense-in-parallel-route/@slot/page.tsx (4:16)",
             ],
           }
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/static/missing-suspense-in-parallel-route'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/static/missing-suspense-in-parallel-route": Runtime data such as \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` was accessed outside of \`<Suspense>\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/blocking-route
               at div (<anonymous>)
               at div (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
           Build-time instant validation failed for route "/suspense-in-root/static/missing-suspense-in-parallel-route".
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })

      it('subpage', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/static/missing-suspense-in-parallel-route/foo'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/static/missing-suspense-in-parallel-route/foo/page.tsx (1:33) @ unstable_instant
           > 1 | export const unstable_instant = { prefetch: 'static' }
               |                                 ^",
                 "stack": [
                   "unstable_instant app/suspense-in-root/static/missing-suspense-in-parallel-route/foo/page.tsx (1:33)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1078",
             "description": "Runtime data was accessed outside of <Suspense>

           This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. cookies(), headers(), params, and searchParams are examples of Runtime data that can only come from a user request.

           To fix this:

           Provide a fallback UI using <Suspense> around this component.

           or

           Move the Runtime data access into a deeper component wrapped in <Suspense>.

           In either case this allows Next.js to stream its contents to the user when they request the page, while still providing an initial UI that is prerendered and prefetchable for instant navigations.

           Learn more: https://nextjs.org/docs/messages/blocking-route",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/suspense-in-root/static/missing-suspense-in-parallel-route/@slot/foo/page.tsx (4:16) @ FooSlot
           > 4 |   await cookies()
               |                ^",
             "stack": [
               "FooSlot app/suspense-in-root/static/missing-suspense-in-parallel-route/@slot/foo/page.tsx (4:16)",
             ],
           }
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/static/missing-suspense-in-parallel-route/foo'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/static/missing-suspense-in-parallel-route/foo": Runtime data such as \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` was accessed outside of \`<Suspense>\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/blocking-route
               at div (<anonymous>)
               at div (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
           Build-time instant validation failed for route "/suspense-in-root/static/missing-suspense-in-parallel-route/foo".
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })

      it('default slot', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/static/missing-suspense-in-parallel-route/bar'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/static/missing-suspense-in-parallel-route/bar/page.tsx (1:33) @ unstable_instant
           > 1 | export const unstable_instant = { prefetch: 'static' }
               |                                 ^",
                 "stack": [
                   "unstable_instant app/suspense-in-root/static/missing-suspense-in-parallel-route/bar/page.tsx (1:33)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1078",
             "description": "Runtime data was accessed outside of <Suspense>

           This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. cookies(), headers(), params, and searchParams are examples of Runtime data that can only come from a user request.

           To fix this:

           Provide a fallback UI using <Suspense> around this component.

           or

           Move the Runtime data access into a deeper component wrapped in <Suspense>.

           In either case this allows Next.js to stream its contents to the user when they request the page, while still providing an initial UI that is prerendered and prefetchable for instant navigations.

           Learn more: https://nextjs.org/docs/messages/blocking-route",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/suspense-in-root/static/missing-suspense-in-parallel-route/@slot/default.tsx (4:16) @ DefaultSlot
           > 4 |   await cookies()
               |                ^",
             "stack": [
               "DefaultSlot app/suspense-in-root/static/missing-suspense-in-parallel-route/@slot/default.tsx (4:16)",
             ],
           }
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/static/missing-suspense-in-parallel-route/bar'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/static/missing-suspense-in-parallel-route/bar": Runtime data such as \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` was accessed outside of \`<Suspense>\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/blocking-route
               at div (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
           Build-time instant validation failed for route "/suspense-in-root/static/missing-suspense-in-parallel-route/bar".
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })
    })

    describe('client components', () => {
      it('unable to validate - parent suspends on client data and blocks children', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/static/invalid-client-data-blocks-validation'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
             {
               "cause": [
                 {
                   "label": "Caused by: Instant Validation",
                   "source": "app/suspense-in-root/static/invalid-client-data-blocks-validation/page.tsx (1:33) @ unstable_instant
             > 1 | export const unstable_instant = {
                 |                                 ^",
                   "stack": [
                     "unstable_instant app/suspense-in-root/static/invalid-client-data-blocks-validation/page.tsx (1:33)",
                     "Set.forEach <anonymous>",
                   ],
                 },
               ],
               "code": "E1082",
               "description": "Route "/suspense-in-root/static/invalid-client-data-blocks-validation": Could not validate \`unstable_instant\` because a Client Component in a parent segment prevented the page from rendering.",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/suspense-in-root/static/invalid-client-data-blocks-validation/client.tsx (12:19) @ FetchesClientData
             > 12 |   const data = use(promise)
                  |                   ^",
               "stack": [
                 "FetchesClientData app/suspense-in-root/static/invalid-client-data-blocks-validation/client.tsx (12:19)",
                 "Layout app/suspense-in-root/static/invalid-client-data-blocks-validation/layout.tsx (17:9)",
               ],
             }
            `)
        } else {
          const result = await prerender(
            '/suspense-in-root/static/invalid-client-data-blocks-validation'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "client-data-fetching-lib :: MISS my-key
           client-data-fetching-lib :: MISS my-key
           client-data-fetching-lib :: MISS my-key
           Error: Route "/suspense-in-root/static/invalid-client-data-blocks-validation": Could not validate \`unstable_instant\` because a Client Component in a parent segment prevented the page from rendering.
               at <unknown> (app/suspense-in-root/static/invalid-client-data-blocks-validation/client.tsx:6:37)
               at div (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
             4 | import { useDataCache } from '../../../../client-data-fetching-lib/client'
             5 |
           > 6 | export function FetchesClientData({ children }) {
               |                                     ^
             7 |   const dataCache = useDataCache()
             8 |   const promise = dataCache.getOrLoad('my-key', async () => {
             9 |     await new Promise<void>((resolve) => setTimeout(resolve, 10))
           Build-time instant validation failed for route "/suspense-in-root/static/invalid-client-data-blocks-validation".
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })

      it('valid - parent suspends on client data but does not block children', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/static/valid-client-data-does-not-block-validation'
          )
          await expectNoDevValidationErrors(browser, await browser.url())
        } else {
          const result = await prerender(
            '/suspense-in-root/static/valid-client-data-does-not-block-validation'
          )
          expectNoBuildValidationErrors(result)
        }
      })

      it('valid - parent uses sync IO in a client component', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/static/valid-client-api-in-parent/sync-io'
          )
          await expectNoDevValidationErrors(browser, await browser.url())
        } else {
          const result = await prerender(
            '/suspense-in-root/static/valid-client-api-in-parent/sync-io'
          )
          expectNoBuildValidationErrors(result)
        }
      })

      it('valid - parent uses dynamic usePathname() in a client component', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/static/valid-client-api-in-parent/dynamic-params/123'
          )
          await expectNoDevValidationErrors(browser, await browser.url())
        } else {
          const result = await prerender(
            '/suspense-in-root/static/valid-client-api-in-parent/dynamic-params/[id]'
          )
          expectNoBuildValidationErrors(result)
        }
      })

      it('valid - parent uses useSearchParams() in a client component', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/static/valid-client-api-in-parent/search-params'
          )
          await expectNoDevValidationErrors(browser, await browser.url())
        } else {
          const result = await prerender(
            '/suspense-in-root/static/valid-client-api-in-parent/search-params'
          )
          expectNoBuildValidationErrors(result)
        }
      })
    })

    describe('client errors', () => {
      function removeExpectedError(
        errors: RedboxSnapshot,
        shouldRemove: (error: ErrorSnapshot) => boolean
      ): ErrorSnapshot[] {
        if (!Array.isArray(errors)) {
          throw new Error('Expected to receive multiple errors to filter')
        }
        let found = false
        const result = errors.filter((err) => {
          if (shouldRemove(err)) {
            found = true
            return false
          } else {
            return true
          }
        })
        if (!found) {
          throw new Error(
            `Did not find expected error in errors array: ${JSON.stringify(errors, null, 2)}`
          )
        }
        return result
      }

      it('unable to validate - client error in parent blocks children', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/static/invalid-client-error-in-parent-blocks-children'
          )
          // We expect a collapsed redbox. We need to open it to assert on the messages.
          await openRedbox(browser)

          let errors = await createRedboxSnapshot(browser, next)

          if (!isClientNav) {
            // In SSR, we expect a "Switched to client rendering ..." error because we deliberately throw in a client component.
            // However, the timing of when it appears is inconsistent -- sometimes it's before validation errors,
            // and sometimes it's after.
            // To avoid flakiness, we filter it out (but assert that it appears in the redbox)
            errors = removeExpectedError(errors, (err) => {
              return (
                err.label === 'Recoverable Error' &&
                err.description.startsWith(
                  'Switched to client rendering because the server rendering errored:\n\nNo SSR please'
                )
              )
            })
          }

          expect(errors).toMatchInlineSnapshot(`
           [
             {
               "description": "Route "/suspense-in-root/static/invalid-client-error-in-parent-blocks-children": Could not validate \`unstable_instant\` because the target segment was prevented from rendering, likely due to the following error.",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/suspense-in-root/static/invalid-client-error-in-parent-blocks-children/page.tsx (1:33) @ unstable_instant
           > 1 | export const unstable_instant = {
               |                                 ^",
               "stack": [
                 "unstable_instant app/suspense-in-root/static/invalid-client-error-in-parent-blocks-children/page.tsx (1:33)",
               ],
             },
             {
               "cause": [
                 {
                   "label": "Caused by: Error",
                   "message": "No SSR please",
                   "source": "app/suspense-in-root/static/invalid-client-error-in-parent-blocks-children/client.tsx (5:11) @ ErrorInSSR
           > 5 |     throw new Error('No SSR please')
               |           ^",
                   "stack": [
                     "ErrorInSSR app/suspense-in-root/static/invalid-client-error-in-parent-blocks-children/client.tsx (5:11)",
                   ],
                 },
               ],
               "code": "E1118",
               "description": "An error occurred while attempting to validate instant UI. This error may be preventing the validation from completing.",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/suspense-in-root/static/invalid-client-error-in-parent-blocks-children/layout.tsx (19:11) @ Layout
           > 19 |           <ErrorInSSR>{children}</ErrorInSSR>
                |           ^",
               "stack": [
                 "Layout app/suspense-in-root/static/invalid-client-error-in-parent-blocks-children/layout.tsx (19:11)",
               ],
             },
           ]
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/static/invalid-client-error-in-parent-blocks-children'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/static/invalid-client-error-in-parent-blocks-children": Could not validate \`unstable_instant\` because the target segment was prevented from rendering, likely due to the following error.
               at ignore-listed frames
           Error: An error occurred while attempting to validate instant UI. This error may be preventing the validation from completing.
               at <unknown> (app/suspense-in-root/static/invalid-client-error-in-parent-blocks-children/client.tsx:3:30)
               at a (<anonymous>)
               at div (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at b (<anonymous>)
             1 | 'use client'
             2 |
           > 3 | export function ErrorInSSR({ children }) {
               |                              ^
             4 |   if (typeof window === 'undefined') {
             5 |     throw new Error('No SSR please')
             6 |   } {
             [cause]: Error: No SSR please
                 at <unknown> (app/suspense-in-root/static/invalid-client-error-in-parent-blocks-children/client.tsx:5:11)
               3 | export function ErrorInSSR({ children }) {
               4 |   if (typeof window === 'undefined') {
             > 5 |     throw new Error('No SSR please')
                 |           ^
               6 |   }
               7 |   return <>{children}</>
               8 | }
           }
           Build-time instant validation failed for route "/suspense-in-root/static/invalid-client-error-in-parent-blocks-children".
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })

      it('unable to validate - client error in component from node_modules blocks children', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/static/invalid-error-in-node-modules-blocks-children'
          )
          // We expect a collapsed redbox. We need to open it to assert on the messages.
          await openRedbox(browser)

          let errors = await createRedboxSnapshot(browser, next)

          if (!isClientNav) {
            // In SSR, we expect a "Switched to client rendering ..." error because we deliberately throw in a client component.
            // However, the timing of when it appears is inconsistent -- sometimes it's before validation errors,
            // and sometimes it's after.
            // To avoid flakiness, we filter it out (but assert that it appears in the redbox)
            errors = removeExpectedError(errors, (err) => {
              return (
                err.label === 'Recoverable Error' &&
                err.description.startsWith(
                  'Switched to client rendering because the server rendering errored:\n\nError from node_modules'
                )
              )
            })
          }

          expect(errors).toMatchInlineSnapshot(`
           [
             {
               "description": "Route "/suspense-in-root/static/invalid-error-in-node-modules-blocks-children": Could not validate \`unstable_instant\` because the target segment was prevented from rendering, likely due to the following error.",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/suspense-in-root/static/invalid-error-in-node-modules-blocks-children/page.tsx (1:33) @ unstable_instant
           > 1 | export const unstable_instant = {
               |                                 ^",
               "stack": [
                 "unstable_instant app/suspense-in-root/static/invalid-error-in-node-modules-blocks-children/page.tsx (1:33)",
               ],
             },
             {
               "cause": [
                 {
                   "label": "Caused by: Error",
                   "message": "Error from node_modules",
                   "source": null,
                   "stack": [],
                 },
               ],
               "code": "E1118",
               "description": "An error occurred while attempting to validate instant UI. This error may be preventing the validation from completing.",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/suspense-in-root/static/invalid-error-in-node-modules-blocks-children/layout.tsx (21:11) @ Layout
           > 21 |           <ErrorInSSRFromPackage>{children}</ErrorInSSRFromPackage>
                |           ^",
               "stack": [
                 "Layout app/suspense-in-root/static/invalid-error-in-node-modules-blocks-children/layout.tsx (21:11)",
               ],
             },
           ]
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/static/invalid-error-in-node-modules-blocks-children'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/static/invalid-error-in-node-modules-blocks-children": Could not validate \`unstable_instant\` because the target segment was prevented from rendering, likely due to the following error.
               at ignore-listed frames
           Error: An error occurred while attempting to validate instant UI. This error may be preventing the validation from completing.
               at a (<anonymous>)
               at div (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at b (<anonymous>) {
             [cause]: Error: Error from node_modules
                 at ignore-listed frames
           }
           Build-time instant validation failed for route "/suspense-in-root/static/invalid-error-in-node-modules-blocks-children".
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })

      it('unable to validate - CSR bailout from next/dynamic blocks children', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/static/invalid-csr-bailout-blocks-children'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           [
             {
               "description": "Route "/suspense-in-root/static/invalid-csr-bailout-blocks-children": Could not validate \`unstable_instant\` because the target segment was prevented from rendering, likely due to the following error.",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/suspense-in-root/static/invalid-csr-bailout-blocks-children/page.tsx (1:33) @ unstable_instant
           > 1 | export const unstable_instant = {
               |                                 ^",
               "stack": [
                 "unstable_instant app/suspense-in-root/static/invalid-csr-bailout-blocks-children/page.tsx (1:33)",
               ],
             },
             {
               "cause": [
                 {
                   "label": "Caused by: Error",
                   "message": "Bail out to client-side rendering: next/dynamic",
                   "source": null,
                   "stack": [],
                 },
               ],
               "code": "E1118",
               "description": "An error occurred while attempting to validate instant UI. This error may be preventing the validation from completing.",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/suspense-in-root/static/invalid-csr-bailout-blocks-children/layout.tsx (19:9) @ Layout
           > 19 |         <LazyClientWrapperWithNoSSR>{children}</LazyClientWrapperWithNoSSR>
                |         ^",
               "stack": [
                 "Layout app/suspense-in-root/static/invalid-csr-bailout-blocks-children/layout.tsx (19:9)",
               ],
             },
           ]
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/static/invalid-csr-bailout-blocks-children'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/static/invalid-csr-bailout-blocks-children": Could not validate \`unstable_instant\` because the target segment was prevented from rendering, likely due to the following error.
               at ignore-listed frames
           Error: An error occurred while attempting to validate instant UI. This error may be preventing the validation from completing.
               at a (<anonymous>)
               at b (<anonymous>)
               at div (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at c (<anonymous>) {
             [cause]: Error: Bail out to client-side rendering: next/dynamic
                 at ignore-listed frames {
               reason: 'next/dynamic',
               digest: 'BAILOUT_TO_CLIENT_SIDE_RENDERING'
             }
           }
           Build-time instant validation failed for route "/suspense-in-root/static/invalid-csr-bailout-blocks-children".
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })

      it('unable to validate - client error from sibling of children slot without suspense', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/static/invalid-client-error-in-parent-sibling'
          )

          if (isClientNav) {
            // In a client navigation, the redbox will be collapsed.
            await openRedbox(browser)
          } else {
            // In SSR, the redbox will be open due to the missing tags error.
            await waitForRedbox(browser)
          }

          let errors = await createRedboxSnapshot(browser, next)
          if (!isClientNav) {
            // In SSR, we expect a "Switched to client rendering ..." error because we deliberately throw in a client component.
            // However, the timing of when it appears is inconsistent -- sometimes it's before validation errors,
            // and sometimes it's after.
            // To avoid flakiness, we filter it out (but assert that it appears in the redbox)
            errors = removeExpectedError(errors, (err) => {
              return (
                err.label === 'Runtime Error' &&
                err.description.startsWith(
                  'Missing <html> and <body> tags in the root layout.'
                )
              )
            })
          }

          expect(errors).toMatchInlineSnapshot(`
           [
             {
               "description": "Route "/suspense-in-root/static/invalid-client-error-in-parent-sibling": Could not validate \`unstable_instant\` because the target segment was prevented from rendering, likely due to the following error.",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/suspense-in-root/static/invalid-client-error-in-parent-sibling/page.tsx (1:33) @ unstable_instant
           > 1 | export const unstable_instant = {
               |                                 ^",
               "stack": [
                 "unstable_instant app/suspense-in-root/static/invalid-client-error-in-parent-sibling/page.tsx (1:33)",
               ],
             },
             {
               "cause": [
                 {
                   "label": "Caused by: Error",
                   "message": "No SSR please",
                   "source": "app/suspense-in-root/static/invalid-client-error-in-parent-sibling/client.tsx (5:11) @ ErrorInSSR
           > 5 |     throw new Error('No SSR please')
               |           ^",
                   "stack": [
                     "ErrorInSSR app/suspense-in-root/static/invalid-client-error-in-parent-sibling/client.tsx (5:11)",
                   ],
                 },
               ],
               "code": "E1118",
               "description": "An error occurred while attempting to validate instant UI. This error may be preventing the validation from completing.",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/suspense-in-root/static/invalid-client-error-in-parent-sibling/layout.tsx (20:7) @ Layout
           > 20 |       <ErrorInSSR />
                |       ^",
               "stack": [
                 "Layout app/suspense-in-root/static/invalid-client-error-in-parent-sibling/layout.tsx (20:7)",
               ],
             },
           ]
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/static/invalid-client-error-in-parent-sibling'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/static/invalid-client-error-in-parent-sibling": Could not validate \`unstable_instant\` because the target segment was prevented from rendering, likely due to the following error.
               at ignore-listed frames
           Error: An error occurred while attempting to validate instant UI. This error may be preventing the validation from completing.
               at <unknown> (app/suspense-in-root/static/invalid-client-error-in-parent-sibling/client.tsx:5:11)
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
             3 | export function ErrorInSSR() {
             4 |   if (typeof window === 'undefined') {
           > 5 |     throw new Error('No SSR please')
               |           ^
             6 |   }
             7 |   return <div>Hello, browser!</div>
             8 | } {
             [cause]: Error: No SSR please
                 at <unknown> (app/suspense-in-root/static/invalid-client-error-in-parent-sibling/client.tsx:5:11)
               3 | export function ErrorInSSR() {
               4 |   if (typeof window === 'undefined') {
             > 5 |     throw new Error('No SSR please')
                 |           ^
               6 |   }
               7 |   return <div>Hello, browser!</div>
               8 | }
           }
           Build-time instant validation failed for route "/suspense-in-root/static/invalid-client-error-in-parent-sibling".
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })

      it('valid - client error from sibling of children slot with suspense', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/static/valid-client-error-in-parent-does-not-block-validation'
          )
          await waitForValidation(await browser.url(), getCliOutputSinceMark)
          if (isClientNav) {
            // In a client nav, no errors should be reported.
            await waitForNoErrorToast(browser, NO_VALIDATION_ERRORS_WAIT)
          } else {
            // In SSR, we expect to only see the error coming from react.
            await expect(browser).toDisplayCollapsedRedbox(`
              {
                "description": "Switched to client rendering because the server rendering errored:

              No SSR please",
                "environmentLabel": null,
                "label": "Recoverable Error",
                "source": "app/suspense-in-root/static/valid-client-error-in-parent-does-not-block-validation/client.tsx (5:11) @ ErrorInSSR
              > 5 |     throw new Error('No SSR please')
                  |           ^",
                "stack": [
                  "ErrorInSSR app/suspense-in-root/static/valid-client-error-in-parent-does-not-block-validation/client.tsx (5:11)",
                ],
              }
          `)
          }
        } else {
          const result = await prerender(
            '/suspense-in-root/static/valid-client-error-in-parent-does-not-block-validation'
          )
          expectNoBuildValidationErrors(result)
        }
      })
    })

    describe('head', () => {
      it('valid - runtime prefetch - dynamic generateMetadata does not block navigation', async () => {
        if (isNextDev) {
          // Metadata streams and does not block navigation, so it can access
          // dynamic data without failing validation.
          const browser = await navigateTo(
            '/suspense-in-root/head/valid-dynamic-metadata-in-runtime'
          )
          await expectNoDevValidationErrors(browser, await browser.url())
        } else {
          const result = await prerender(
            '/suspense-in-root/head/valid-dynamic-metadata-in-runtime'
          )
          expectNoBuildValidationErrors(result)
        }
      })

      it('valid - static prefetch - runtime generateMetadata does not block navigation', async () => {
        if (isNextDev) {
          // Metadata streams and does not block navigation, so it can access
          // runtime data without failing validation.
          const browser = await navigateTo(
            '/suspense-in-root/head/valid-runtime-metadata-in-static'
          )
          await expectNoDevValidationErrors(browser, await browser.url())
        } else {
          const result = await prerender(
            '/suspense-in-root/head/valid-runtime-metadata-in-static'
          )
          expectNoBuildValidationErrors(result)
        }
      })

      it('invalid - static prefetch - runtime generateViewport blocks navigation', async () => {
        if (isNextDev) {
          // if generateViewport uses runtime data and we use a static prefetch,
          // we won't have it available when navigating, so we'll block and should fail validation.
          const browser = await navigateTo(
            '/suspense-in-root/head/invalid-runtime-viewport-in-static'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/head/invalid-runtime-viewport-in-static/page.tsx (8:33) @ unstable_instant
           >  8 | export const unstable_instant = {
                |                                 ^",
                 "stack": [
                   "unstable_instant app/suspense-in-root/head/invalid-runtime-viewport-in-static/page.tsx (8:33)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1086",
             "description": "Runtime data was accessed inside generateViewport()

           Viewport metadata needs to be available on page load so accessing data that comes from a user Request while producing it prevents Next.js from prerendering an initial UI.cookies(), headers(), params, and searchParams are examples of Runtime data that can only come from a user request.

           To fix this:

           Remove the Runtime data requirement from generateViewport. This allows Next.js to statically prerender generateViewport() as part of the HTML document, so it's instantly visible to the user.

           or

           Put a <Suspense> around your document <body>.This indicate to Next.js that you are opting into allowing blocking navigations for any page.

           params are usually considered Runtime data but if all params are provided a value using generateStaticParams they can be statically prerendered.

           Learn more: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/suspense-in-root/head/invalid-runtime-viewport-in-static/page.tsx (14:16) @ Module.generateViewport
           > 14 |   await cookies()
                |                ^",
             "stack": [
               "Module.generateViewport app/suspense-in-root/head/invalid-runtime-viewport-in-static/page.tsx (14:16)",
             ],
           }
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/head/invalid-runtime-viewport-in-static'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/head/invalid-runtime-viewport-in-static": Runtime data such as \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` was accessed inside \`generateViewport\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport
               at ignore-listed frames
           Build-time instant validation failed for route "/suspense-in-root/head/invalid-runtime-viewport-in-static".
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })

      it('invalid - runtime prefetch - dynamic viewport blocks navigation', async () => {
        if (isNextDev) {
          // if generateViewport uses dynamic data and we use a runtime prefetch,
          // we won't have it available when navigating, so we'll block and should fail validation.
          const browser = await navigateTo(
            '/suspense-in-root/head/invalid-dynamic-viewport-in-runtime'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/head/invalid-dynamic-viewport-in-runtime/page.tsx (6:33) @ unstable_instant
           > 6 | export const unstable_instant = {
               |                                 ^",
                 "stack": [
                   "unstable_instant app/suspense-in-root/head/invalid-dynamic-viewport-in-runtime/page.tsx (6:33)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1086",
             "description": "Data that blocks navigation was accessed inside generateViewport()

           Viewport metadata needs to be available on page load so accessing data that waits for a user navigation while producing it prevents Next.js from prerendering an initial UI. Uncached data such as fetch(...), cached data with a low expire time, or connection() are all examples of data that only resolve on navigation.

           To fix this:

           Move the asynchronous await into a Cache Component ("use cache"). This allows Next.js to statically prerender generateViewport() as part of the HTML document, so it's instantly visible to the user.

           or

           Put a <Suspense> around your document <body>.This indicate to Next.js that you are opting into allowing blocking navigations for any page.

           Learn more: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/suspense-in-root/head/invalid-dynamic-viewport-in-runtime/page.tsx (14:19) @ Module.generateViewport
           > 14 |   await connection()
                |                   ^",
             "stack": [
               "Module.generateViewport app/suspense-in-root/head/invalid-dynamic-viewport-in-runtime/page.tsx (14:19)",
             ],
           }
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/head/invalid-dynamic-viewport-in-runtime'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/head/invalid-dynamic-viewport-in-runtime": Uncached data or \`connection()\` was accessed inside \`generateViewport\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport
               at ignore-listed frames
           Build-time instant validation failed for route "/suspense-in-root/head/invalid-dynamic-viewport-in-runtime".
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })

      it('valid - runtime prefetch - runtime generateViewport does not block navigation', async () => {
        if (isNextDev) {
          // if generateViewport uses runtime data and we use a runtime prefetch,
          // we'll have it available when navigating, so we won't block and validation should succeed.
          const browser = await navigateTo(
            '/suspense-in-root/head/valid-runtime-viewport-in-runtime'
          )
          await expectNoDevValidationErrors(browser, await browser.url())
        } else {
          const result = await prerender(
            '/suspense-in-root/head/valid-runtime-viewport-in-runtime'
          )
          expectNoBuildValidationErrors(result)
        }
      })

      it('valid - blocking layout - dynamic viewport is allowed to block', async () => {
        if (isNextDev) {
          // if generateViewport uses dynamic data, it'll always block regardless of prefetching.
          // however, this is valid if the page opts into blocking via `instant = false`.
          const browser = await navigateTo(
            '/suspense-in-root/head/valid-dynamic-viewport-in-blocking'
          )
          await expectNoDevValidationErrors(browser, await browser.url())
        } else {
          const result = await prerender(
            '/suspense-in-root/head/valid-dynamic-viewport-in-blocking'
          )
          // The only way to allow this is to have `instant = false` on the page,
          // and no assertions in layouts above -- they can't pass because a dynamic
          // generateViewport will always block the navigation.
          // This test is just here to ensure this behavior doesn't break.
          expectBuildValidationSkipped(result)
        }
      })

      it('invalid - blocking page inside static - dynamic viewport is not allowed to block', async () => {
        if (isNextDev) {
          // if generateViewport uses dynamic data, it'll always block regardless of prefetching.
          // this can be allowed if a page opts into blocking. but if it violates a static
          // assertion on a parent layout, it should still fail.
          const browser = await navigateTo(
            '/suspense-in-root/head/invalid-dynamic-viewport-in-blocking-inside-static'
          )
          // TODO(instant-validation): why aren't we pointing to `await connection()` here?
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/head/invalid-dynamic-viewport-in-blocking-inside-static/layout.tsx (3:33) @ unstable_instant
           > 3 | export const unstable_instant = { prefetch: 'static' }
               |                                 ^",
                 "stack": [
                   "unstable_instant app/suspense-in-root/head/invalid-dynamic-viewport-in-blocking-inside-static/layout.tsx (3:33)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1086",
             "description": "Data that blocks navigation was accessed inside generateViewport()

           Viewport metadata needs to be available on page load so accessing data that waits for a user navigation while producing it prevents Next.js from prerendering an initial UI. Uncached data such as fetch(...), cached data with a low expire time, or connection() are all examples of data that only resolve on navigation.

           To fix this:

           Move the asynchronous await into a Cache Component ("use cache"). This allows Next.js to statically prerender generateViewport() as part of the HTML document, so it's instantly visible to the user.

           or

           Put a <Suspense> around your document <body>.This indicate to Next.js that you are opting into allowing blocking navigations for any page.

           Learn more: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/suspense-in-root/head/invalid-dynamic-viewport-in-blocking-inside-static/page.tsx (6:23) @ Module.generateViewport
           > 6 | export async function generateViewport(): Promise<Viewport> {
               |                       ^",
             "stack": [
               "Module.generateViewport app/suspense-in-root/head/invalid-dynamic-viewport-in-blocking-inside-static/page.tsx (6:23)",
             ],
           }
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/head/invalid-dynamic-viewport-in-blocking-inside-static'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/head/invalid-dynamic-viewport-in-blocking-inside-static": Uncached data or \`connection()\` was accessed inside \`generateViewport\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport
               at ignore-listed frames
           Build-time instant validation failed for route "/suspense-in-root/head/invalid-dynamic-viewport-in-blocking-inside-static".
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })
    })

    describe('route groups', () => {
      it('invalid - config on route group layout - cookies() blocks below', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/static/route-group-config-only'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/static/route-group-config-only/(group)/layout.tsx (3:33) @ unstable_instant
           > 3 | export const unstable_instant = { prefetch: 'static' }
               |                                 ^",
                 "stack": [
                   "unstable_instant app/suspense-in-root/static/route-group-config-only/(group)/layout.tsx (3:33)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1078",
             "description": "Runtime data was accessed outside of <Suspense>

           This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. cookies(), headers(), params, and searchParams are examples of Runtime data that can only come from a user request.

           To fix this:

           Provide a fallback UI using <Suspense> around this component.

           or

           Move the Runtime data access into a deeper component wrapped in <Suspense>.

           In either case this allows Next.js to stream its contents to the user when they request the page, while still providing an initial UI that is prerendered and prefetchable for instant navigations.

           Learn more: https://nextjs.org/docs/messages/blocking-route",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/suspense-in-root/static/route-group-config-only/(group)/page.tsx (4:16) @ Page
           > 4 |   await cookies()
               |                ^",
             "stack": [
               "Page app/suspense-in-root/static/route-group-config-only/(group)/page.tsx (4:16)",
             ],
           }
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/static/route-group-config-only/(group)'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/static/route-group-config-only": Runtime data such as \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` was accessed outside of \`<Suspense>\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/blocking-route
               at div (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
           Build-time instant validation failed for route "/suspense-in-root/static/route-group-config-only".
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })

      it('invalid - config on both route group and segment layout - cookies() blocks below', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/static/route-group-config-and-segment-config'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/static/route-group-config-and-segment-config/(group)/layout.tsx (3:33) @ unstable_instant
           > 3 | export const unstable_instant = { prefetch: 'static' }
               |                                 ^",
                 "stack": [
                   "unstable_instant app/suspense-in-root/static/route-group-config-and-segment-config/(group)/layout.tsx (3:33)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1078",
             "description": "Runtime data was accessed outside of <Suspense>

           This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. cookies(), headers(), params, and searchParams are examples of Runtime data that can only come from a user request.

           To fix this:

           Provide a fallback UI using <Suspense> around this component.

           or

           Move the Runtime data access into a deeper component wrapped in <Suspense>.

           In either case this allows Next.js to stream its contents to the user when they request the page, while still providing an initial UI that is prerendered and prefetchable for instant navigations.

           Learn more: https://nextjs.org/docs/messages/blocking-route",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/suspense-in-root/static/route-group-config-and-segment-config/(group)/page.tsx (4:16) @ Page
           > 4 |   await cookies()
               |                ^",
             "stack": [
               "Page app/suspense-in-root/static/route-group-config-and-segment-config/(group)/page.tsx (4:16)",
             ],
           }
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/static/route-group-config-and-segment-config/(group)'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/static/route-group-config-and-segment-config": Runtime data such as \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` was accessed outside of \`<Suspense>\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/blocking-route
               at div (<anonymous>)
               at div (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
           Build-time instant validation failed for route "/suspense-in-root/static/route-group-config-and-segment-config".
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })

      it('invalid - config on segment layout - cookies() blocks through route group below', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/static/route-group-segment-config-only'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/static/route-group-segment-config-only/layout.tsx (3:33) @ unstable_instant
           > 3 | export const unstable_instant = { prefetch: 'static' }
               |                                 ^",
                 "stack": [
                   "unstable_instant app/suspense-in-root/static/route-group-segment-config-only/layout.tsx (3:33)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1078",
             "description": "Runtime data was accessed outside of <Suspense>

           This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. cookies(), headers(), params, and searchParams are examples of Runtime data that can only come from a user request.

           To fix this:

           Provide a fallback UI using <Suspense> around this component.

           or

           Move the Runtime data access into a deeper component wrapped in <Suspense>.

           In either case this allows Next.js to stream its contents to the user when they request the page, while still providing an initial UI that is prerendered and prefetchable for instant navigations.

           Learn more: https://nextjs.org/docs/messages/blocking-route",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/suspense-in-root/static/route-group-segment-config-only/(group)/page.tsx (4:16) @ Page
           > 4 |   await cookies()
               |                ^",
             "stack": [
               "Page app/suspense-in-root/static/route-group-segment-config-only/(group)/page.tsx (4:16)",
             ],
           }
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/static/route-group-segment-config-only/(group)'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/static/route-group-segment-config-only": Runtime data such as \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` was accessed outside of \`<Suspense>\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/blocking-route
               at div (<anonymous>)
               at div (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
           Build-time instant validation failed for route "/suspense-in-root/static/route-group-segment-config-only".
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })

      it('invalid - config on route group layout - cookies() blocks in deeper segment', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/static/route-group-config-with-deeper-segment/inner'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/static/route-group-config-with-deeper-segment/(group)/layout.tsx (3:33) @ unstable_instant
           > 3 | export const unstable_instant = { prefetch: 'static' }
               |                                 ^",
                 "stack": [
                   "unstable_instant app/suspense-in-root/static/route-group-config-with-deeper-segment/(group)/layout.tsx (3:33)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1078",
             "description": "Runtime data was accessed outside of <Suspense>

           This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. cookies(), headers(), params, and searchParams are examples of Runtime data that can only come from a user request.

           To fix this:

           Provide a fallback UI using <Suspense> around this component.

           or

           Move the Runtime data access into a deeper component wrapped in <Suspense>.

           In either case this allows Next.js to stream its contents to the user when they request the page, while still providing an initial UI that is prerendered and prefetchable for instant navigations.

           Learn more: https://nextjs.org/docs/messages/blocking-route",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/suspense-in-root/static/route-group-config-with-deeper-segment/(group)/inner/page.tsx (4:16) @ Page
           > 4 |   await cookies()
               |                ^",
             "stack": [
               "Page app/suspense-in-root/static/route-group-config-with-deeper-segment/(group)/inner/page.tsx (4:16)",
             ],
           }
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/static/route-group-config-with-deeper-segment/(group)/inner'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/static/route-group-config-with-deeper-segment/inner": Runtime data such as \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` was accessed outside of \`<Suspense>\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/blocking-route
               at div (<anonymous>)
               at div (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
           Build-time instant validation failed for route "/suspense-in-root/static/route-group-config-with-deeper-segment/inner".
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })

      it('invalid - config on segment layout inside route group - cookies() blocks below', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/static/route-group-deeper-segment-config/inner'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/static/route-group-deeper-segment-config/(group)/inner/layout.tsx (3:33) @ unstable_instant
           > 3 | export const unstable_instant = { prefetch: 'static' }
               |                                 ^",
                 "stack": [
                   "unstable_instant app/suspense-in-root/static/route-group-deeper-segment-config/(group)/inner/layout.tsx (3:33)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1078",
             "description": "Runtime data was accessed outside of <Suspense>

           This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. cookies(), headers(), params, and searchParams are examples of Runtime data that can only come from a user request.

           To fix this:

           Provide a fallback UI using <Suspense> around this component.

           or

           Move the Runtime data access into a deeper component wrapped in <Suspense>.

           In either case this allows Next.js to stream its contents to the user when they request the page, while still providing an initial UI that is prerendered and prefetchable for instant navigations.

           Learn more: https://nextjs.org/docs/messages/blocking-route",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/suspense-in-root/static/route-group-deeper-segment-config/(group)/inner/page.tsx (4:16) @ Page
           > 4 |   await cookies()
               |                ^",
             "stack": [
               "Page app/suspense-in-root/static/route-group-deeper-segment-config/(group)/inner/page.tsx (4:16)",
             ],
           }
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/static/route-group-deeper-segment-config/(group)/inner'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/static/route-group-deeper-segment-config/inner": Runtime data such as \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` was accessed outside of \`<Suspense>\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/blocking-route
               at div (<anonymous>)
               at div (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
           Build-time instant validation failed for route "/suspense-in-root/static/route-group-deeper-segment-config/inner".
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })
    })

    describe('route group shared boundary', () => {
      // When navigating from /foo to /, (outer)/layout is shared — its
      // Suspense doesn't apply to the new tree. (inner)/layout awaits
      // cookies() without its own Suspense, so the navigation should
      // block and produce a validation error. The group depth iteration
      // catches this by treating (outer) as shared and (inner) as new.
      it('invalid - blocking layout inside shared route group boundary', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/static/route-group-shared-boundary'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/static/route-group-shared-boundary/(outer)/(inner)/page.tsx (6:33) @ unstable_instant
           > 6 | export const unstable_instant = { prefetch: 'static' }
               |                                 ^",
                 "stack": [
                   "unstable_instant app/suspense-in-root/static/route-group-shared-boundary/(outer)/(inner)/page.tsx (6:33)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1078",
             "description": "Runtime data was accessed outside of <Suspense>

           This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. cookies(), headers(), params, and searchParams are examples of Runtime data that can only come from a user request.

           To fix this:

           Provide a fallback UI using <Suspense> around this component.

           or

           Move the Runtime data access into a deeper component wrapped in <Suspense>.

           In either case this allows Next.js to stream its contents to the user when they request the page, while still providing an initial UI that is prerendered and prefetchable for instant navigations.

           Learn more: https://nextjs.org/docs/messages/blocking-route",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/suspense-in-root/static/route-group-shared-boundary/(outer)/(inner)/layout.tsx (13:16) @ InnerLayout
           > 13 |   await cookies()
                |                ^",
             "stack": [
               "InnerLayout app/suspense-in-root/static/route-group-shared-boundary/(outer)/(inner)/layout.tsx (13:16)",
             ],
           }
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/static/route-group-shared-boundary/(outer)/(inner)'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/static/route-group-shared-boundary": Runtime data such as \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` was accessed outside of \`<Suspense>\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/blocking-route
               at a (<anonymous>)
               at div (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at b (<anonymous>)
           Build-time instant validation failed for route "/suspense-in-root/static/route-group-shared-boundary".
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })
    })

    describe('parallel slots with different group depths', () => {
      // @slot has 3 groups, children has 2 groups. The validation
      // iterates from deepest group depth (3) down to 0. Deeper
      // holes in one slot are detected before shallower holes in
      // another slot because the shallower slot stays entirely
      // shared at higher group depths.

      it('invalid - deep hole in @slot detected before shallow hole in children', async () => {
        // @slot/(g1)/(g2)/(g3)/layout.tsx has cookies() — the 3rd group blocks.
        // (b1)/(b2)/layout.tsx has cookies() — the 2nd group blocks.
        // At groupDepth=2: @slot's g2 is boundary, g3 enters new tree →
        // g3's cookies() detected at Static stage. children only has
        // 2 groups which is < groupDepth=2, so children stays entirely
        // shared. Only @slot's error is reported.
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/static/parallel-group-depths-deep-slot-hole'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
             {
               "cause": [
                 {
                   "label": "Caused by: Instant Validation",
                   "source": "app/suspense-in-root/static/parallel-group-depths-deep-slot-hole/@slot/(g1)/(g2)/(g3)/page.tsx (1:33) @ unstable_instant
             > 1 | export const unstable_instant = { prefetch: 'static' }
                 |                                 ^",
                   "stack": [
                     "unstable_instant app/suspense-in-root/static/parallel-group-depths-deep-slot-hole/@slot/(g1)/(g2)/(g3)/page.tsx (1:33)",
                     "Set.forEach <anonymous>",
                   ],
                 },
               ],
               "code": "E1078",
               "description": "Runtime data was accessed outside of <Suspense>

             This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. cookies(), headers(), params, and searchParams are examples of Runtime data that can only come from a user request.

             To fix this:

             Provide a fallback UI using <Suspense> around this component.

             or

             Move the Runtime data access into a deeper component wrapped in <Suspense>.

             In either case this allows Next.js to stream its contents to the user when they request the page, while still providing an initial UI that is prerendered and prefetchable for instant navigations.

             Learn more: https://nextjs.org/docs/messages/blocking-route",
               "environmentLabel": "Server",
               "label": "Blocking Route",
               "source": "app/suspense-in-root/static/parallel-group-depths-deep-slot-hole/@slot/(g1)/(g2)/(g3)/layout.tsx (7:16) @ G3Layout
             >  7 |   await cookies()
                  |                ^",
               "stack": [
                 "G3Layout app/suspense-in-root/static/parallel-group-depths-deep-slot-hole/@slot/(g1)/(g2)/(g3)/layout.tsx (7:16)",
               ],
             }
            `)
        } else {
          const result = await prerender(
            '/suspense-in-root/static/parallel-group-depths-deep-slot-hole/(b1)/(b2)'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/static/parallel-group-depths-deep-slot-hole": Runtime data such as \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` was accessed outside of \`<Suspense>\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/blocking-route
               at div (<anonymous>)
               at div (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
           Build-time instant validation failed for route "/suspense-in-root/static/parallel-group-depths-deep-slot-hole".
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })

      it('invalid - children hole detected before shallow @slot hole', async () => {
        // @slot/(g1)/layout.tsx has cookies() — the 1st group blocks.
        // (b1)/(b2)/layout.tsx has cookies() — the 2nd group blocks.
        // At groupDepth=1: @slot's g1 is boundary (shared, cookies()
        // runs at Dynamic stage — not detected). children's b1 is
        // boundary, b2 enters new tree → b2's cookies() detected.
        // The "caused by" config source differs between bundlers due
        // to parallel route key iteration order when slot markers
        // aren't supported in webpack.
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/static/parallel-group-depths-shallow-slot-hole'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/static/parallel-group-depths-shallow-slot-hole/(b1)/(b2)/page.tsx (1:33) @ unstable_instant
           > 1 | export const unstable_instant = { prefetch: 'static' }
               |                                 ^",
                 "stack": [
                   "unstable_instant app/suspense-in-root/static/parallel-group-depths-shallow-slot-hole/(b1)/(b2)/page.tsx (1:33)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1078",
             "description": "Runtime data was accessed outside of <Suspense>

           This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. cookies(), headers(), params, and searchParams are examples of Runtime data that can only come from a user request.

           To fix this:

           Provide a fallback UI using <Suspense> around this component.

           or

           Move the Runtime data access into a deeper component wrapped in <Suspense>.

           In either case this allows Next.js to stream its contents to the user when they request the page, while still providing an initial UI that is prerendered and prefetchable for instant navigations.

           Learn more: https://nextjs.org/docs/messages/blocking-route",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/suspense-in-root/static/parallel-group-depths-shallow-slot-hole/(b1)/(b2)/layout.tsx (5:16) @ B2Layout
           > 5 |   await cookies()
               |                ^",
             "stack": [
               "B2Layout app/suspense-in-root/static/parallel-group-depths-shallow-slot-hole/(b1)/(b2)/layout.tsx (5:16)",
             ],
           }
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/static/parallel-group-depths-shallow-slot-hole/(b1)/(b2)'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/static/parallel-group-depths-shallow-slot-hole": Runtime data such as \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` was accessed outside of \`<Suspense>\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/blocking-route
               at div (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
           Build-time instant validation failed for route "/suspense-in-root/static/parallel-group-depths-shallow-slot-hole".
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })
    })

    // TODO(instant-validation): The error message for this case is
    // technically correct but confusing. The developer configured
    // runtime prefetching on the inner layout, so they expect
    // cookies() to be fine. But the parent layout above the config
    // gets static prefetching by default, making cookies() a
    // blocking violation. The error should explain that segments
    // above the config use static prefetching and suggest either
    // moving the config up or adding Suspense around the runtime
    // data in the parent layout.
    it('invalid - static layout above runtime config blocks navigation', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/runtime/static-layout-above-runtime-config/inner'
        )
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "cause": [
             {
               "label": "Caused by: Instant Validation",
               "source": "app/suspense-in-root/runtime/static-layout-above-runtime-config/inner/layout.tsx (6:33) @ unstable_instant
         > 6 | export const unstable_instant = {
             |                                 ^",
               "stack": [
                 "unstable_instant app/suspense-in-root/runtime/static-layout-above-runtime-config/inner/layout.tsx (6:33)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
           "code": "E1078",
           "description": "Runtime data was accessed outside of <Suspense>

         This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. cookies(), headers(), params, and searchParams are examples of Runtime data that can only come from a user request.

         To fix this:

         Provide a fallback UI using <Suspense> around this component.

         or

         Move the Runtime data access into a deeper component wrapped in <Suspense>.

         In either case this allows Next.js to stream its contents to the user when they request the page, while still providing an initial UI that is prerendered and prefetchable for instant navigations.

         Learn more: https://nextjs.org/docs/messages/blocking-route",
           "environmentLabel": "Server",
           "label": "Blocking Route",
           "source": "app/suspense-in-root/runtime/static-layout-above-runtime-config/layout.tsx (15:16) @ StaticLayout
         > 15 |   await cookies()
              |                ^",
           "stack": [
             "StaticLayout app/suspense-in-root/runtime/static-layout-above-runtime-config/layout.tsx (15:16)",
           ],
         }
        `)
      } else {
        const result = await prerender(
          '/suspense-in-root/runtime/static-layout-above-runtime-config/inner'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
         "Error: Route "/suspense-in-root/runtime/static-layout-above-runtime-config/inner": Runtime data such as \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` was accessed outside of \`<Suspense>\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/blocking-route
             at body (<anonymous>)
             at html (<anonymous>)
             at a (<anonymous>)
         Build-time instant validation failed for route "/suspense-in-root/runtime/static-layout-above-runtime-config/inner".
         Stopping prerender due to instant validation errors."
        `)
        expect(result.exitCode).toBe(1)
      }
    })

    describe('config depth preference', () => {
      // When multiple slots have instant configs at different depths,
      // the deepest config is preferred as the root cause. At equal
      // depth, children is preferred over named slots.

      it('invalid - deeper children config preferred over shallower slot config', async () => {
        // children has config deep (deeper/still/deep/page.tsx, depth 2)
        // @anotherSlot has config shallow (page.tsx, depth 0)
        // @slot blocks with no config — cause should be children's deep config
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/static/config-depth-preference/deeper/still/deep'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/static/config-depth-preference/deeper/still/deep/page.tsx (3:33) @ unstable_instant
           > 3 | export const unstable_instant = { prefetch: 'static' }
               |                                 ^",
                 "stack": [
                   "unstable_instant app/suspense-in-root/static/config-depth-preference/deeper/still/deep/page.tsx (3:33)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1078",
             "description": "Runtime data was accessed outside of <Suspense>

           This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. cookies(), headers(), params, and searchParams are examples of Runtime data that can only come from a user request.

           To fix this:

           Provide a fallback UI using <Suspense> around this component.

           or

           Move the Runtime data access into a deeper component wrapped in <Suspense>.

           In either case this allows Next.js to stream its contents to the user when they request the page, while still providing an initial UI that is prerendered and prefetchable for instant navigations.

           Learn more: https://nextjs.org/docs/messages/blocking-route",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/suspense-in-root/static/config-depth-preference/@slot/[...catchall]/page.tsx (8:16) @ CatchallSlotPage
           >  8 |   await cookies()
                |                ^",
             "stack": [
               "CatchallSlotPage app/suspense-in-root/static/config-depth-preference/@slot/[...catchall]/page.tsx (8:16)",
             ],
           }
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/static/config-depth-preference/deeper/still/deep'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error [InvariantError]: Invariant: An unexpected error occcured during instant validation. This is a bug in Next.js.
               at ignore-listed frames {
             [cause]: Error [InvariantError]: Invariant: Missing value for segment key: "catchall" with dynamic param type: c. This is a bug in Next.js.
                 at ignore-listed frames
           }
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })

      it('invalid - deeper slot config preferred over shallower children catchall', async () => {
        // @anotherSlot has config deep (still/deep/page.tsx, depth 2)
        // children has config shallow ([...rest]/page.tsx, depth 1)
        // @slot blocks with no config — cause should be @anotherSlot's deep config
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/static/config-depth-preference-slot-wins/deeper/still/deep'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/static/config-depth-preference-slot-wins/deeper/@anotherSlot/still/deep/page.tsx (3:33) @ unstable_instant
           > 3 | export const unstable_instant = { prefetch: 'static' }
               |                                 ^",
                 "stack": [
                   "unstable_instant app/suspense-in-root/static/config-depth-preference-slot-wins/deeper/@anotherSlot/still/deep/page.tsx (3:33)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1078",
             "description": "Runtime data was accessed outside of <Suspense>

           This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. cookies(), headers(), params, and searchParams are examples of Runtime data that can only come from a user request.

           To fix this:

           Provide a fallback UI using <Suspense> around this component.

           or

           Move the Runtime data access into a deeper component wrapped in <Suspense>.

           In either case this allows Next.js to stream its contents to the user when they request the page, while still providing an initial UI that is prerendered and prefetchable for instant navigations.

           Learn more: https://nextjs.org/docs/messages/blocking-route",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/suspense-in-root/static/config-depth-preference-slot-wins/@slot/[...catchall]/page.tsx (7:16) @ CatchallSlotPage
           >  7 |   await cookies()
                |                ^",
             "stack": [
               "CatchallSlotPage app/suspense-in-root/static/config-depth-preference-slot-wins/@slot/[...catchall]/page.tsx (7:16)",
             ],
           }
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/static/config-depth-preference-slot-wins/deeper/[...rest]'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/static/config-depth-preference-slot-wins/deeper/[...rest]": Runtime data such as \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` was accessed outside of \`<Suspense>\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/blocking-route
               at div (<anonymous>)
               at div (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
           Build-time instant validation failed for route "/suspense-in-root/static/config-depth-preference-slot-wins/deeper/[...rest]".
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })

      it('invalid - children config preferred at equal depth', async () => {
        // children and @other both have config at same depth (page level)
        // @slot blocks with no config — cause should be children's config
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/static/config-children-preferred'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/static/config-children-preferred/page.tsx (4:33) @ unstable_instant
           > 4 | export const unstable_instant = { prefetch: 'static' }
               |                                 ^",
                 "stack": [
                   "unstable_instant app/suspense-in-root/static/config-children-preferred/page.tsx (4:33)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1078",
             "description": "Runtime data was accessed outside of <Suspense>

           This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. cookies(), headers(), params, and searchParams are examples of Runtime data that can only come from a user request.

           To fix this:

           Provide a fallback UI using <Suspense> around this component.

           or

           Move the Runtime data access into a deeper component wrapped in <Suspense>.

           In either case this allows Next.js to stream its contents to the user when they request the page, while still providing an initial UI that is prerendered and prefetchable for instant navigations.

           Learn more: https://nextjs.org/docs/messages/blocking-route",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/suspense-in-root/static/config-children-preferred/@slot/page.tsx (7:16) @ SlotPage
           >  7 |   await cookies()
                |                ^",
             "stack": [
               "SlotPage app/suspense-in-root/static/config-children-preferred/@slot/page.tsx (7:16)",
             ],
           }
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/static/config-children-preferred'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/static/config-children-preferred": Runtime data such as \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` was accessed outside of \`<Suspense>\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/blocking-route
               at div (<anonymous>)
               at div (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
           Build-time instant validation failed for route "/suspense-in-root/static/config-children-preferred".
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })

      it('invalid - cross-slot blocking falls back to deep children config', async () => {
        // @slot catchall blocks with no config
        // children has config deep behind a second fork with @panel
        // cause should fall back to children's deep config
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/static/cross-slot-blocking/inner/deep'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/static/cross-slot-blocking/inner/deep/page.tsx (5:33) @ unstable_instant
           > 5 | export const unstable_instant = { prefetch: 'static' }
               |                                 ^",
                 "stack": [
                   "unstable_instant app/suspense-in-root/static/cross-slot-blocking/inner/deep/page.tsx (5:33)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1078",
             "description": "Runtime data was accessed outside of <Suspense>

           This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. cookies(), headers(), params, and searchParams are examples of Runtime data that can only come from a user request.

           To fix this:

           Provide a fallback UI using <Suspense> around this component.

           or

           Move the Runtime data access into a deeper component wrapped in <Suspense>.

           In either case this allows Next.js to stream its contents to the user when they request the page, while still providing an initial UI that is prerendered and prefetchable for instant navigations.

           Learn more: https://nextjs.org/docs/messages/blocking-route",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/suspense-in-root/static/cross-slot-blocking/@slot/[...catchall]/page.tsx (8:16) @ CatchallSlotPage
           >  8 |   await cookies()
                |                ^",
             "stack": [
               "CatchallSlotPage app/suspense-in-root/static/cross-slot-blocking/@slot/[...catchall]/page.tsx (8:16)",
             ],
           }
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/static/cross-slot-blocking/inner/deep'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error [InvariantError]: Invariant: An unexpected error occcured during instant validation. This is a bug in Next.js.
               at ignore-listed frames {
             [cause]: Error [InvariantError]: Invariant: Missing value for segment key: "catchall" with dynamic param type: c. This is a bug in Next.js.
                 at ignore-listed frames
           }
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })
    })

    describe('disabling validation', () => {
      it('in a layout', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/disable-validation/in-layout'
          )
          await expectNoDevValidationErrors(browser, await browser.url())
        } else {
          const result = await prerender(
            '/suspense-in-root/disable-validation/in-layout'
          )
          expectBuildValidationSkipped(result)
        }
      })

      it('in a page', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/disable-validation/in-page'
          )
          await expectNoDevValidationErrors(browser, await browser.url())
        } else {
          const result = await prerender(
            '/suspense-in-root/disable-validation/in-page'
          )
          expectBuildValidationSkipped(result)
        }
      })

      it('in a page with a parent that has a config', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/disable-validation/in-page-with-outer'
          )
          await expectNoDevValidationErrors(browser, await browser.url())
        } else {
          const result = await prerender(
            '/suspense-in-root/disable-validation/in-page-with-outer'
          )
          expectBuildValidationSkipped(result)
        }
      })

      it('disabling dev validation', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/disable-validation/disable-dev'
          )
          await expectNoDevValidationErrors(browser, await browser.url())
        } else {
          const result = await prerender(
            '/suspense-in-root/disable-validation/disable-dev'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/disable-validation/disable-dev": Uncached data, \`params\`, \`searchParams\`, or \`connection()\` was accessed outside of \`<Suspense>\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/blocking-route
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
           Build-time instant validation failed for route "/suspense-in-root/disable-validation/disable-dev".
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })

      it('disabling build validation', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/disable-validation/disable-build'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/disable-validation/disable-build/page.tsx (3:33) @ unstable_instant
           > 3 | export const unstable_instant = {
               |                                 ^",
                 "stack": [
                   "unstable_instant app/suspense-in-root/disable-validation/disable-build/page.tsx (3:33)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
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
             "source": "app/suspense-in-root/disable-validation/disable-build/page.tsx (9:19) @ Page
           >  9 |   await connection()
                |                   ^",
             "stack": [
               "Page app/suspense-in-root/disable-validation/disable-build/page.tsx (9:19)",
             ],
           }
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/disable-validation/disable-build'
          )
          expectBuildValidationSkipped(result)
        }
      })
    })
  })
})
