import { nextTestSetup } from 'e2e-utils'
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

describe('instant validation', () => {
  const { next, skipped, isNextDev } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    env: {
      NEXT_TEST_LOG_VALIDATION: '1',
    },
  })
  if (skipped) return
  if (!isNextDev) {
    it.skip('Only implemented in dev', () => {})
    return
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

  type ValidationEvent =
    | { type: 'validation_start'; requestId: string; url: string }
    | { type: 'validation_end'; requestId: string; url: string }

  async function waitForValidationStart(targetUrl: string): Promise<string> {
    const parsedTargetUrl = new URL(targetUrl)
    const relativeTargetUrl =
      parsedTargetUrl.pathname + parsedTargetUrl.search + parsedTargetUrl.hash

    const requestId = await retry(
      async () => {
        const events = parseValidationMessages(getCliOutputSinceMark())
        const start = events.find(
          (e) =>
            e.type === 'validation_start' &&
            normalizeValidationUrl(e.url) === relativeTargetUrl
        )
        expect(start).toBeDefined()
        return start!.requestId
      },
      undefined,
      undefined,
      `wait for validation of '${relativeTargetUrl}' to start`
    )
    return requestId
  }

  async function waitForValidationEnd(requestId: string): Promise<void> {
    await retry(
      async () => {
        const events = parseValidationMessages(getCliOutputSinceMark())
        const end = events.find(
          (e) => e.type === 'validation_end' && e.requestId === requestId
        )
        expect(end).toBeDefined()
      },
      undefined,
      undefined,
      'wait for validation to end'
    )
  }

  async function waitForValidation(url: string) {
    const requestId = await waitForValidationStart(url)
    await waitForValidationEnd(requestId)
  }

  const NO_VALIDATION_ERRORS_WAIT: Parameters<typeof waitForNoErrorToast>[1] = {
    waitInMs: 500,
  }

  async function expectNoValidationErrors(
    browser: Awaited<ReturnType<typeof next.browser>>,
    url: string
  ): Promise<void> {
    await waitForValidation(url)
    await waitForNoErrorToast(browser, NO_VALIDATION_ERRORS_WAIT)
  }

  function parseValidationMessages(output: string): ValidationEvent[] {
    const messageRe = /<VALIDATION_MESSAGE>(.*?)<\/VALIDATION_MESSAGE>/g
    const events: ValidationEvent[] = []
    let match: RegExpExecArray | null
    while ((match = messageRe.exec(output)) !== null) {
      try {
        events.push(JSON.parse(match[1]))
      } catch (err) {
        throw new Error(`Failed to parse message '${match[1]}'`, {
          cause: err,
        })
      }
    }
    return events
  }

  function normalizeValidationUrl(url: string): string {
    // RSC requests include ?_rsc=... in the URL. Strip it so the event URL
    // matches what browser.url() returns (which has no _rsc param).
    const parsed = new URL(url, 'http://n')
    parsed.searchParams.delete('_rsc')
    return parsed.pathname + parsed.search + parsed.hash
  }

  describe.each([
    { isClientNav: false, description: 'initial load' },
    { isClientNav: true, description: 'client navigation' },
  ])('$description', ({ isClientNav }) => {
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
      const browser = await navigateTo(
        '/suspense-in-root/static/suspense-around-dynamic'
      )
      await expectNoValidationErrors(browser, await browser.url())
    })
    it('valid - runtime prefetch - suspense only around dynamic', async () => {
      const browser = await navigateTo(
        '/suspense-in-root/runtime/suspense-around-dynamic'
      )
      await expectNoValidationErrors(browser, await browser.url())
    })

    it('invalid - static prefetch - missing suspense around runtime', async () => {
      const browser = await navigateTo(
        '/suspense-in-root/static/missing-suspense-around-runtime'
      )
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "cause": [
           {
             "label": "Caused by: Instant Validation",
             "message": " ",
             "source": "app/suspense-in-root/static/missing-suspense-around-runtime/page.tsx (3:33) @ unstable_instant
       > 3 | export const unstable_instant = { prefetch: 'static' }
           |                                 ^",
             "stack": [
               "unstable_instant app/suspense-in-root/static/missing-suspense-around-runtime/page.tsx (3:33)",
               "Set.forEach <anonymous>",
             ],
           },
         ],
         "description": "Runtime data was accessed outside of <Suspense>

       This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. cookies(), headers(), and searchParams, are examples of Runtime data that can only come from a user request.

       To fix this:

       Provide a fallback UI using <Suspense> around this component.

       or

       Move the Runtime data access into a deeper component wrapped in <Suspense>.

       In either case this allows Next.js to stream its contents to the user when they request the page, while still providing an initial UI that is prerendered and prefetchable for instant navigations.

       Learn more: https://nextjs.org/docs/messages/blocking-route",
         "environmentLabel": "Server",
         "label": "Blocking Route",
         "source": "app/suspense-in-root/static/missing-suspense-around-runtime/page.tsx (6:16) @ Page
       > 6 |   await cookies()
           |                ^",
         "stack": [
           "Page app/suspense-in-root/static/missing-suspense-around-runtime/page.tsx (6:16)",
         ],
       }
      `)
    })
    it('invalid - static prefetch - missing suspense around dynamic', async () => {
      const browser = await navigateTo(
        '/suspense-in-root/static/missing-suspense-around-dynamic'
      )
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "cause": [
           {
             "label": "Caused by: Instant Validation",
             "message": " ",
             "source": "app/suspense-in-root/static/missing-suspense-around-dynamic/page.tsx (3:33) @ unstable_instant
       > 3 | export const unstable_instant = { prefetch: 'static' }
           |                                 ^",
             "stack": [
               "unstable_instant app/suspense-in-root/static/missing-suspense-around-dynamic/page.tsx (3:33)",
               "Set.forEach <anonymous>",
             ],
           },
         ],
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
    })
    it('invalid - runtime prefetch - missing suspense around dynamic', async () => {
      const browser = await navigateTo(
        '/suspense-in-root/runtime/missing-suspense-around-dynamic'
      )
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "cause": [
           {
             "label": "Caused by: Instant Validation",
             "message": " ",
             "source": "app/suspense-in-root/runtime/missing-suspense-around-dynamic/page.tsx (4:33) @ unstable_instant
       > 4 | export const unstable_instant = {
           |                                 ^",
             "stack": [
               "unstable_instant app/suspense-in-root/runtime/missing-suspense-around-dynamic/page.tsx (4:33)",
               "Set.forEach <anonymous>",
             ],
           },
         ],
         "description": "Data that blocks navigation was accessed outside of <Suspense>

       This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. Uncached data such as fetch(...), cached data with a low expire time, or connection() are all examples of data that only resolve on navigation.

       To fix this, you can either:

       Provide a fallback UI using <Suspense> around this component. This allows Next.js to stream its contents to the user as soon as it's ready, without blocking the rest of the app.

       or

       Move the asynchronous await into a Cache Component ("use cache"). This allows Next.js to statically prerender the component as part of the HTML document, so it's instantly visible to the user.

       Learn more: https://nextjs.org/docs/messages/blocking-route",
         "environmentLabel": "Server",
         "label": "Blocking Route",
         "source": "app/suspense-in-root/runtime/missing-suspense-around-dynamic/page.tsx (25:19) @ Dynamic
       > 25 |   await connection()
            |                   ^",
         "stack": [
           "Dynamic app/suspense-in-root/runtime/missing-suspense-around-dynamic/page.tsx (25:19)",
           "Page app/suspense-in-root/runtime/missing-suspense-around-dynamic/page.tsx (18:9)",
         ],
       }
      `)
    })

    it('invalid - static prefetch - missing suspense around dynamic in a layout', async () => {
      const browser = await navigateTo(
        '/suspense-in-root/static/missing-suspense-around-dynamic-layout'
      )
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "cause": [
           {
             "label": "Caused by: Instant Validation",
             "message": " ",
             "source": "app/suspense-in-root/static/missing-suspense-around-dynamic-layout/layout.tsx (4:33) @ unstable_instant
       > 4 | export const unstable_instant = { prefetch: 'static' }
           |                                 ^",
             "stack": [
               "unstable_instant app/suspense-in-root/static/missing-suspense-around-dynamic-layout/layout.tsx (4:33)",
               "Set.forEach <anonymous>",
             ],
           },
         ],
         "description": "Runtime data was accessed outside of <Suspense>

       This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. cookies(), headers(), and searchParams, are examples of Runtime data that can only come from a user request.

       To fix this:

       Provide a fallback UI using <Suspense> around this component.

       or

       Move the Runtime data access into a deeper component wrapped in <Suspense>.

       In either case this allows Next.js to stream its contents to the user when they request the page, while still providing an initial UI that is prerendered and prefetchable for instant navigations.

       Learn more: https://nextjs.org/docs/messages/blocking-route",
         "environmentLabel": "Server",
         "label": "Blocking Route",
         "source": "app/suspense-in-root/static/missing-suspense-around-dynamic-layout/layout.tsx (7:16) @ Layout
       >  7 |   await cookies()
            |                ^",
         "stack": [
           "Layout app/suspense-in-root/static/missing-suspense-around-dynamic-layout/layout.tsx (7:16)",
         ],
       }
      `)
    })
    it('invalid - runtime prefetch - missing suspense around dynamic in a layout', async () => {
      const browser = await navigateTo(
        '/suspense-in-root/runtime/missing-suspense-around-dynamic-layout'
      )
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "cause": [
           {
             "label": "Caused by: Instant Validation",
             "message": " ",
             "source": "app/suspense-in-root/runtime/missing-suspense-around-dynamic-layout/layout.tsx (4:33) @ unstable_instant
       > 4 | export const unstable_instant = {
           |                                 ^",
             "stack": [
               "unstable_instant app/suspense-in-root/runtime/missing-suspense-around-dynamic-layout/layout.tsx (4:33)",
               "Set.forEach <anonymous>",
             ],
           },
         ],
         "description": "Data that blocks navigation was accessed outside of <Suspense>

       This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. Uncached data such as fetch(...), cached data with a low expire time, or connection() are all examples of data that only resolve on navigation.

       To fix this, you can either:

       Provide a fallback UI using <Suspense> around this component. This allows Next.js to stream its contents to the user as soon as it's ready, without blocking the rest of the app.

       or

       Move the asynchronous await into a Cache Component ("use cache"). This allows Next.js to statically prerender the component as part of the HTML document, so it's instantly visible to the user.

       Learn more: https://nextjs.org/docs/messages/blocking-route",
         "environmentLabel": "Server",
         "label": "Blocking Route",
         "source": "app/suspense-in-root/runtime/missing-suspense-around-dynamic-layout/layout.tsx (10:19) @ Layout
       > 10 |   await connection()
            |                   ^",
         "stack": [
           "Layout app/suspense-in-root/runtime/missing-suspense-around-dynamic-layout/layout.tsx (10:19)",
         ],
       }
      `)
    })

    it('invalid - static prefetch - missing suspense around params', async () => {
      const browser = await navigateTo(
        '/suspense-in-root/static/missing-suspense-around-params/123'
      )
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "cause": [
           {
             "label": "Caused by: Instant Validation",
             "message": " ",
             "source": "app/suspense-in-root/static/missing-suspense-around-params/[param]/page.tsx (1:33) @ unstable_instant
       > 1 | export const unstable_instant = { prefetch: 'static' }
           |                                 ^",
             "stack": [
               "unstable_instant app/suspense-in-root/static/missing-suspense-around-params/[param]/page.tsx (1:33)",
               "Set.forEach <anonymous>",
             ],
           },
         ],
         "description": "Runtime data was accessed outside of <Suspense>

       This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. cookies(), headers(), and searchParams, are examples of Runtime data that can only come from a user request.

       To fix this:

       Provide a fallback UI using <Suspense> around this component.

       or

       Move the Runtime data access into a deeper component wrapped in <Suspense>.

       In either case this allows Next.js to stream its contents to the user when they request the page, while still providing an initial UI that is prerendered and prefetchable for instant navigations.

       Learn more: https://nextjs.org/docs/messages/blocking-route",
         "environmentLabel": "Server",
         "label": "Blocking Route",
         "source": "app/suspense-in-root/static/missing-suspense-around-params/[param]/page.tsx (17:21) @ Runtime
       > 17 |   const { param } = await params
            |                     ^",
         "stack": [
           "Runtime app/suspense-in-root/static/missing-suspense-around-params/[param]/page.tsx (17:21)",
           "Page app/suspense-in-root/static/missing-suspense-around-params/[param]/page.tsx (11:7)",
         ],
       }
      `)
    })

    it('valid - runtime prefetch - does not require Suspense around params', async () => {
      const browser = await navigateTo(
        '/suspense-in-root/runtime/valid-no-suspense-around-params/123'
      )
      await expectNoValidationErrors(browser, await browser.url())
    })

    it('invalid - static prefetch - missing suspense around search params', async () => {
      const browser = await navigateTo(
        '/suspense-in-root/static/missing-suspense-around-search-params?foo=bar'
      )
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "cause": [
           {
             "label": "Caused by: Instant Validation",
             "message": " ",
             "source": "app/suspense-in-root/static/missing-suspense-around-search-params/page.tsx (1:33) @ unstable_instant
       > 1 | export const unstable_instant = { prefetch: 'static' }
           |                                 ^",
             "stack": [
               "unstable_instant app/suspense-in-root/static/missing-suspense-around-search-params/page.tsx (1:33)",
               "Set.forEach <anonymous>",
             ],
           },
         ],
         "description": "Runtime data was accessed outside of <Suspense>

       This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. cookies(), headers(), and searchParams, are examples of Runtime data that can only come from a user request.

       To fix this:

       Provide a fallback UI using <Suspense> around this component.

       or

       Move the Runtime data access into a deeper component wrapped in <Suspense>.

       In either case this allows Next.js to stream its contents to the user when they request the page, while still providing an initial UI that is prerendered and prefetchable for instant navigations.

       Learn more: https://nextjs.org/docs/messages/blocking-route",
         "environmentLabel": "Server",
         "label": "Blocking Route",
         "source": "app/suspense-in-root/static/missing-suspense-around-search-params/page.tsx (4:18) @ Page
       > 4 |   const search = await searchParams
           |                  ^",
         "stack": [
           "Page app/suspense-in-root/static/missing-suspense-around-search-params/page.tsx (4:18)",
         ],
       }
      `)
    })

    it('valid - runtime prefetch - does not require Suspense around search params', async () => {
      const browser = await navigateTo(
        '/suspense-in-root/runtime/valid-no-suspense-around-search-params?foo=bar'
      )
      await expectNoValidationErrors(browser, await browser.url())
    })

    it('valid - target segment not visible in all navigations', async () => {
      // Notable special case -- we accept that the segment with the assertion might not
      // *itself* be visible in all navigations as long as they're instant.
      // A parent layout might be blocked from rendering the children slot,
      // but that's fine as long as it provides a fallback.
      //
      // This is in opposition to an alternate model we considered at some point,
      // where putting an assertion on a segment would mean that it must be visible
      // in all navigations (which would require that its parent layouts must never
      // block the children slots)
      const browser = await navigateTo('/default/static/valid-blocked-children')
      await expectNoValidationErrors(browser, await browser.url())
    })

    it('invalid - static prefetch - suspense too high', async () => {
      const browser = await navigateTo(
        '/suspense-in-root/static/suspense-too-high'
      )
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "cause": [
           {
             "label": "Caused by: Instant Validation",
             "message": " ",
             "source": "app/suspense-in-root/static/suspense-too-high/page.tsx (3:33) @ unstable_instant
       > 3 | export const unstable_instant = { prefetch: 'static' }
           |                                 ^",
             "stack": [
               "unstable_instant app/suspense-in-root/static/suspense-too-high/page.tsx (3:33)",
               "Set.forEach <anonymous>",
             ],
           },
         ],
         "description": "Runtime data was accessed outside of <Suspense>

       This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. cookies(), headers(), and searchParams, are examples of Runtime data that can only come from a user request.

       To fix this:

       Provide a fallback UI using <Suspense> around this component.

       or

       Move the Runtime data access into a deeper component wrapped in <Suspense>.

       In either case this allows Next.js to stream its contents to the user when they request the page, while still providing an initial UI that is prerendered and prefetchable for instant navigations.

       Learn more: https://nextjs.org/docs/messages/blocking-route",
         "environmentLabel": "Server",
         "label": "Blocking Route",
         "source": "app/suspense-in-root/static/suspense-too-high/page.tsx (6:16) @ Page
       > 6 |   await cookies()
           |                ^",
         "stack": [
           "Page app/suspense-in-root/static/suspense-too-high/page.tsx (6:16)",
         ],
       }
      `)
    })
    it('invalid - runtime prefetch - suspense too high', async () => {
      const browser = await navigateTo(
        '/suspense-in-root/runtime/suspense-too-high'
      )
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "cause": [
           {
             "label": "Caused by: Instant Validation",
             "message": " ",
             "source": "app/suspense-in-root/runtime/suspense-too-high/page.tsx (4:33) @ unstable_instant
       > 4 | export const unstable_instant = {
           |                                 ^",
             "stack": [
               "unstable_instant app/suspense-in-root/runtime/suspense-too-high/page.tsx (4:33)",
               "Set.forEach <anonymous>",
             ],
           },
         ],
         "description": "Data that blocks navigation was accessed outside of <Suspense>

       This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. Uncached data such as fetch(...), cached data with a low expire time, or connection() are all examples of data that only resolve on navigation.

       To fix this, you can either:

       Provide a fallback UI using <Suspense> around this component. This allows Next.js to stream its contents to the user as soon as it's ready, without blocking the rest of the app.

       or

       Move the asynchronous await into a Cache Component ("use cache"). This allows Next.js to statically prerender the component as part of the HTML document, so it's instantly visible to the user.

       Learn more: https://nextjs.org/docs/messages/blocking-route",
         "environmentLabel": "Server",
         "label": "Blocking Route",
         "source": "app/suspense-in-root/runtime/suspense-too-high/page.tsx (26:19) @ Dynamic
       > 26 |   await connection()
            |                   ^",
         "stack": [
           "Dynamic app/suspense-in-root/runtime/suspense-too-high/page.tsx (26:19)",
           "Page app/suspense-in-root/runtime/suspense-too-high/page.tsx (19:9)",
         ],
       }
      `)
    })

    it('invalid - runtime prefetch - sync IO after runtime API', async () => {
      const browser = await navigateTo(
        '/suspense-in-root/runtime/invalid-sync-io'
      )
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "description": "Route "/suspense-in-root/runtime/invalid-sync-io" used \`Date.now()\` before accessing either uncached data (e.g. \`fetch()\`) or awaiting \`connection()\`. When configured for Runtime prefetching, accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-runtime-current-time",
         "environmentLabel": "Server",
         "label": "Console Error",
         "source": "app/suspense-in-root/runtime/invalid-sync-io/page.tsx (10:20) @ Page
       > 10 |   const now = Date.now()
            |                    ^",
         "stack": [
           "Page app/suspense-in-root/runtime/invalid-sync-io/page.tsx (10:20)",
           "Page <anonymous>",
         ],
       }
      `)
    })

    it('invalid - runtime prefetch - sync IO in runtime segment with valid static parent', async () => {
      // The static parent layout has sync IO after cookies() which is fine
      // because it's not runtime-prefetchable. But the page itself has
      // runtime prefetch enabled and also has sync IO after cookies(),
      // which should error.
      const browser = await navigateTo(
        '/suspense-in-root/runtime/invalid-sync-io-in-runtime-with-valid-static-parent'
      )
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "description": "Route "/suspense-in-root/runtime/invalid-sync-io-in-runtime-with-valid-static-parent" used \`Date.now()\` before accessing either uncached data (e.g. \`fetch()\`) or awaiting \`connection()\`. When configured for Runtime prefetching, accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-runtime-current-time",
         "environmentLabel": "Server",
         "label": "Console Error",
         "source": "app/suspense-in-root/runtime/invalid-sync-io-in-runtime-with-valid-static-parent/page.tsx (14:20) @ Page
       > 14 |   const now = Date.now()
            |                    ^",
         "stack": [
           "Page app/suspense-in-root/runtime/invalid-sync-io-in-runtime-with-valid-static-parent/page.tsx (14:20)",
           "Page <anonymous>",
         ],
       }
      `)
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
      const browser = await navigateTo(
        '/suspense-in-root/runtime/invalid-sync-io-after-cache-with-cookie-input'
      )
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "description": "Route "/suspense-in-root/runtime/invalid-sync-io-after-cache-with-cookie-input" used \`Date.now()\` before accessing either uncached data (e.g. \`fetch()\`) or awaiting \`connection()\`. When configured for Runtime prefetching, accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-runtime-current-time",
         "environmentLabel": "Server",
         "label": "Console Error",
         "source": "app/suspense-in-root/runtime/invalid-sync-io-after-cache-with-cookie-input/page.tsx (30:20) @ Page
       > 30 |   const now = Date.now()
            |                    ^",
         "stack": [
           "Page app/suspense-in-root/runtime/invalid-sync-io-after-cache-with-cookie-input/page.tsx (30:20)",
           "Page <anonymous>",
         ],
       }
      `)
    })

    it('valid - runtime prefetch - sync IO in a static parent layout is allowed', async () => {
      // Sync IO (Date.now()) in a layout that is NOT runtime-prefetchable
      // should not error, even though the child page has runtime prefetch
      // enabled. Only segments that are runtime-prefetchable should be
      // validated for sync IO after runtime APIs.
      const browser = await navigateTo(
        '/suspense-in-root/runtime/valid-sync-io-in-static-parent'
      )
      await expectNoValidationErrors(browser, await browser.url())
    })

    it('invalid - missing suspense around dynamic (with loading.js)', async () => {
      const browser = await navigateTo(
        '/suspense-in-root/static/invalid-only-loading-around-dynamic'
      )
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "cause": [
           {
             "label": "Caused by: Instant Validation",
             "message": " ",
             "source": "app/suspense-in-root/static/invalid-only-loading-around-dynamic/page.tsx (4:33) @ unstable_instant
       > 4 | export const unstable_instant = { prefetch: 'static' }
           |                                 ^",
             "stack": [
               "unstable_instant app/suspense-in-root/static/invalid-only-loading-around-dynamic/page.tsx (4:33)",
               "Set.forEach <anonymous>",
             ],
           },
         ],
         "description": "Data that blocks navigation was accessed outside of <Suspense>

       This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. Uncached data such as fetch(...), cached data with a low expire time, or connection() are all examples of data that only resolve on navigation.

       To fix this, you can either:

       Provide a fallback UI using <Suspense> around this component. This allows Next.js to stream its contents to the user as soon as it's ready, without blocking the rest of the app.

       or

       Move the asynchronous await into a Cache Component ("use cache"). This allows Next.js to statically prerender the component as part of the HTML document, so it's instantly visible to the user.

       Learn more: https://nextjs.org/docs/messages/blocking-route",
         "environmentLabel": "Server",
         "label": "Blocking Route",
         "source": "app/suspense-in-root/static/invalid-only-loading-around-dynamic/page.tsx (31:19) @ Dynamic
       > 31 |   await connection()
            |                   ^",
         "stack": [
           "Dynamic app/suspense-in-root/static/invalid-only-loading-around-dynamic/page.tsx (31:19)",
           "Page app/suspense-in-root/static/invalid-only-loading-around-dynamic/page.tsx (19:9)",
         ],
       }
      `)
    })

    describe('blocking', () => {
      it('valid - blocking layout with unstable_instant = false is allowed to block', async () => {
        const browser = await navigateTo(
          '/suspense-in-root/static/blocking-layout'
        )
        await expectNoValidationErrors(browser, await browser.url())
      })
      it('invalid - missing suspense inside blocking layout', async () => {
        const browser = await navigateTo(
          '/suspense-in-root/static/blocking-layout/missing-suspense-around-dynamic'
        )
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "cause": [
             {
               "label": "Caused by: Instant Validation",
               "message": " ",
               "source": "app/suspense-in-root/static/blocking-layout/missing-suspense-around-dynamic/page.tsx (3:33) @ unstable_instant
         > 3 | export const unstable_instant = { prefetch: 'static' }
             |                                 ^",
               "stack": [
                 "unstable_instant app/suspense-in-root/static/blocking-layout/missing-suspense-around-dynamic/page.tsx (3:33)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
           "description": "Runtime data was accessed outside of <Suspense>

         This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. cookies(), headers(), and searchParams, are examples of Runtime data that can only come from a user request.

         To fix this:

         Provide a fallback UI using <Suspense> around this component.

         or

         Move the Runtime data access into a deeper component wrapped in <Suspense>.

         In either case this allows Next.js to stream its contents to the user when they request the page, while still providing an initial UI that is prerendered and prefetchable for instant navigations.

         Learn more: https://nextjs.org/docs/messages/blocking-route",
           "environmentLabel": "Server",
           "label": "Blocking Route",
           "source": "app/suspense-in-root/static/blocking-layout/missing-suspense-around-dynamic/page.tsx (6:16) @ Page
         > 6 |   await cookies()
             |                ^",
           "stack": [
             "Page app/suspense-in-root/static/blocking-layout/missing-suspense-around-dynamic/page.tsx (6:16)",
           ],
         }
        `)
      })

      it('valid - blocking page inside a static layout is allowed if the layout has suspense', async () => {
        const browser = await navigateTo(
          '/default/static/valid-blocking-inside-static'
        )
        await expectNoValidationErrors(browser, await browser.url())
      })
      it('valid - blocking page inside a runtime layout is allowed if the layout has suspense', async () => {
        const browser = await navigateTo(
          '/suspense-in-root/runtime/valid-blocking-inside-runtime'
        )
        await expectNoValidationErrors(browser, await browser.url())
      })

      it('invalid - blocking page inside a static layout is not allowed if the layout has no suspense', async () => {
        const browser = await navigateTo(
          '/suspense-in-root/static/invalid-blocking-inside-static'
        )
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "cause": [
             {
               "label": "Caused by: Instant Validation",
               "message": " ",
               "source": "app/suspense-in-root/static/invalid-blocking-inside-static/layout.tsx (1:33) @ unstable_instant
         > 1 | export const unstable_instant = { prefetch: 'static' }
             |                                 ^",
               "stack": [
                 "unstable_instant app/suspense-in-root/static/invalid-blocking-inside-static/layout.tsx (1:33)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
           "description": "Runtime data was accessed outside of <Suspense>

         This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. cookies(), headers(), and searchParams, are examples of Runtime data that can only come from a user request.

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
      })
      it('invalid - blocking page inside a runtime layout is not allowed if the layout has no suspense', async () => {
        const browser = await navigateTo(
          '/suspense-in-root/runtime/invalid-blocking-inside-runtime'
        )
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "cause": [
             {
               "label": "Caused by: Instant Validation",
               "message": " ",
               "source": "app/suspense-in-root/runtime/invalid-blocking-inside-runtime/layout.tsx (3:33) @ unstable_instant
         > 3 | export const unstable_instant = {
             |                                 ^",
               "stack": [
                 "unstable_instant app/suspense-in-root/runtime/invalid-blocking-inside-runtime/layout.tsx (3:33)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
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
      })
    })

    describe('invalid - missing suspense in parallel slot', () => {
      it('index', async () => {
        const browser = await navigateTo(
          '/suspense-in-root/static/missing-suspense-in-parallel-route'
        )
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "cause": [
             {
               "label": "Caused by: Instant Validation",
               "message": " ",
               "source": "app/suspense-in-root/static/missing-suspense-in-parallel-route/page.tsx (3:33) @ unstable_instant
         > 3 | export const unstable_instant = { prefetch: 'static' }
             |                                 ^",
               "stack": [
                 "unstable_instant app/suspense-in-root/static/missing-suspense-in-parallel-route/page.tsx (3:33)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
           "description": "Runtime data was accessed outside of <Suspense>

         This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. cookies(), headers(), and searchParams, are examples of Runtime data that can only come from a user request.

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
      })

      it('subpage', async () => {
        const browser = await navigateTo(
          '/suspense-in-root/static/missing-suspense-in-parallel-route/foo'
        )
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "cause": [
             {
               "label": "Caused by: Instant Validation",
               "message": " ",
               "source": "app/suspense-in-root/static/missing-suspense-in-parallel-route/foo/page.tsx (1:33) @ unstable_instant
         > 1 | export const unstable_instant = { prefetch: 'static' }
             |                                 ^",
               "stack": [
                 "unstable_instant app/suspense-in-root/static/missing-suspense-in-parallel-route/foo/page.tsx (1:33)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
           "description": "Runtime data was accessed outside of <Suspense>

         This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. cookies(), headers(), and searchParams, are examples of Runtime data that can only come from a user request.

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
      })

      it('default slot', async () => {
        const browser = await navigateTo(
          '/suspense-in-root/static/missing-suspense-in-parallel-route/bar'
        )
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "cause": [
             {
               "label": "Caused by: Instant Validation",
               "message": " ",
               "source": "app/suspense-in-root/static/missing-suspense-in-parallel-route/bar/page.tsx (1:33) @ unstable_instant
         > 1 | export const unstable_instant = { prefetch: 'static' }
             |                                 ^",
               "stack": [
                 "unstable_instant app/suspense-in-root/static/missing-suspense-in-parallel-route/bar/page.tsx (1:33)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
           "description": "Runtime data was accessed outside of <Suspense>

         This delays the entire page from rendering, resulting in a slow user experience. Next.js uses this error to ensure your app loads instantly on every navigation. cookies(), headers(), and searchParams, are examples of Runtime data that can only come from a user request.

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
      })
    })

    describe('client components', () => {
      it('unable to validate - parent suspends on client data and blocks children', async () => {
        const browser = await navigateTo(
          '/suspense-in-root/static/invalid-client-data-blocks-validation'
        )
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "cause": [
             {
               "label": "Caused by: Instant Validation",
               "message": " ",
               "source": "app/suspense-in-root/static/invalid-client-data-blocks-validation/page.tsx (1:33) @ unstable_instant
         > 1 | export const unstable_instant = {
             |                                 ^",
               "stack": [
                 "unstable_instant app/suspense-in-root/static/invalid-client-data-blocks-validation/page.tsx (1:33)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
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
      })

      it('valid - parent suspends on client data but does not block children', async () => {
        const browser = await navigateTo(
          '/suspense-in-root/static/valid-client-data-does-not-block-validation'
        )
        await expectNoValidationErrors(browser, await browser.url())
      })

      it('valid - parent uses sync IO in a client component', async () => {
        const browser = await navigateTo(
          '/suspense-in-root/static/valid-client-api-in-parent/sync-io'
        )
        await expectNoValidationErrors(browser, await browser.url())
      })
      it('valid - parent uses dynamic usePathname() in a client component', async () => {
        const browser = await navigateTo(
          '/suspense-in-root/static/valid-client-api-in-parent/dynamic-params/123'
        )
        await expectNoValidationErrors(browser, await browser.url())
      })
      it('valid - parent uses useSearchPatams() in a client component', async () => {
        const browser = await navigateTo(
          '/suspense-in-root/static/valid-client-api-in-parent/search-params'
        )
        await expectNoValidationErrors(browser, await browser.url())
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
             "description": "No SSR please",
             "environmentLabel": "Server",
             "label": "Console Error",
             "source": "app/suspense-in-root/static/invalid-client-error-in-parent-blocks-children/client.tsx (5:11) @ ErrorInSSR
         > 5 |     throw new Error('No SSR please')
             |           ^",
             "stack": [
               "ErrorInSSR app/suspense-in-root/static/invalid-client-error-in-parent-blocks-children/client.tsx (5:11)",
             ],
           },
         ]
        `)
      })

      it('unable to validate - client error from sibling of children slot without suspense', async () => {
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
             "description": "No SSR please",
             "environmentLabel": "Server",
             "label": "Console Error",
             "source": "app/suspense-in-root/static/invalid-client-error-in-parent-sibling/client.tsx (5:11) @ ErrorInSSR
         > 5 |     throw new Error('No SSR please')
             |           ^",
             "stack": [
               "ErrorInSSR app/suspense-in-root/static/invalid-client-error-in-parent-sibling/client.tsx (5:11)",
             ],
           },
         ]
        `)
      })

      it('valid - client error from sibling of children slot with suspense', async () => {
        const browser = await navigateTo(
          '/suspense-in-root/static/valid-client-error-in-parent-does-not-block-validation'
        )
        await waitForValidation(await browser.url())
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
      })
    })

    describe('disabling validation', () => {
      // We don't log any messages if validation is skipped, so the best we can do is wait.
      const VALIDATION_SKIPPED_WAIT: Parameters<typeof waitForNoErrorToast>[1] =
        { waitInMs: 3000 }
      it('in a layout', async () => {
        const browser = await navigateTo(
          '/suspense-in-root/disable-validation/in-layout'
        )
        await waitForNoErrorToast(browser, VALIDATION_SKIPPED_WAIT)
      })
      it('in a page', async () => {
        const browser = await navigateTo(
          '/suspense-in-root/disable-validation/in-page'
        )
        await waitForNoErrorToast(browser, VALIDATION_SKIPPED_WAIT)
      })
      it('in a page with a parent that has a config', async () => {
        const browser = await navigateTo(
          '/suspense-in-root/disable-validation/in-page-with-outer'
        )
        await waitForNoErrorToast(browser, VALIDATION_SKIPPED_WAIT)
      })
    })
  })
})
