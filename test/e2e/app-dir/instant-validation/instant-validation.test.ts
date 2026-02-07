import { nextTestSetup } from 'e2e-utils'
import { waitForNoErrorToast } from '../../../lib/next-test-utils'

describe.each([
  { debugChannelEnabled: true, description: 'with debug channel' },
  { debugChannelEnabled: false, description: 'without debug channel' },
])('instant validation - $description', ({ debugChannelEnabled }) => {
  const { next, skipped, isNextDev } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    env: {
      REACT_DEBUG_CHANNEL: debugChannelEnabled ? '1' : '',
    },
  })
  if (skipped) return
  if (!isNextDev) {
    it.skip('Only implemented in dev', () => {})
    return
  }

  it('valid - static prefetch - suspense around runtime and dynamic', async () => {
    const browser = await next.browser('/static/suspense-around-dynamic')
    await browser.elementByCss('main')
    await waitForNoErrorToast(browser)
  })
  it('valid - runtime prefetch - suspense only around dynamic', async () => {
    const browser = await next.browser('/runtime/suspense-around-dynamic')
    await browser.elementByCss('main')
    await waitForNoErrorToast(browser)
  })

  it('invalid - static prefetch - missing suspense around runtime', async () => {
    const browser = await next.browser(
      '/static/missing-suspense-around-runtime'
    )
    await expect(browser).toDisplayCollapsedRedbox(`
     {
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
       "source": "app/(suspense-in-root)/static/missing-suspense-around-runtime/page.tsx (6:16) @ Page
     > 6 |   await cookies()
         |                ^",
       "stack": [
         "Page app/(suspense-in-root)/static/missing-suspense-around-runtime/page.tsx (6:16)",
       ],
     }
    `)
  })
  it('invalid - static prefetch - missing suspense around dynamic', async () => {
    const browser = await next.browser(
      '/static/missing-suspense-around-dynamic'
    )
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
       "source": "app/(suspense-in-root)/static/missing-suspense-around-dynamic/page.tsx (6:19) @ Page
     > 6 |   await connection()
         |                   ^",
       "stack": [
         "Page app/(suspense-in-root)/static/missing-suspense-around-dynamic/page.tsx (6:19)",
       ],
     }
    `)
  })
  it('invalid - runtime prefetch - missing suspense around dynamic', async () => {
    const browser = await next.browser(
      '/runtime/missing-suspense-around-dynamic'
    )
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
       "source": "app/(suspense-in-root)/runtime/missing-suspense-around-dynamic/page.tsx (25:19) @ Dynamic
     > 25 |   await connection()
          |                   ^",
       "stack": [
         "Dynamic app/(suspense-in-root)/runtime/missing-suspense-around-dynamic/page.tsx (25:19)",
         "Page app/(suspense-in-root)/runtime/missing-suspense-around-dynamic/page.tsx (18:9)",
       ],
     }
    `)
  })

  it('invalid - static prefetch - missing suspense around dynamic in a layout', async () => {
    const browser = await next.browser(
      '/static/missing-suspense-around-dynamic-layout'
    )
    await expect(browser).toDisplayCollapsedRedbox(`
     {
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
       "source": "app/(suspense-in-root)/static/missing-suspense-around-dynamic-layout/layout.tsx (7:16) @ Layout
     >  7 |   await cookies()
          |                ^",
       "stack": [
         "Layout app/(suspense-in-root)/static/missing-suspense-around-dynamic-layout/layout.tsx (7:16)",
       ],
     }
    `)
  })
  it('invalid - runtime prefetch - missing suspense around dynamic in a layout', async () => {
    const browser = await next.browser(
      '/runtime/missing-suspense-around-dynamic-layout'
    )
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
       "source": "app/(suspense-in-root)/runtime/missing-suspense-around-dynamic-layout/layout.tsx (10:19) @ Layout
     > 10 |   await connection()
          |                   ^",
       "stack": [
         "Layout app/(suspense-in-root)/runtime/missing-suspense-around-dynamic-layout/layout.tsx (10:19)",
       ],
     }
    `)
  })

  it('invalid - static prefetch - missing suspense around params', async () => {
    const browser = await next.browser(
      '/static/missing-suspense-around-params/123'
    )
    await expect(browser).toDisplayCollapsedRedbox(`
     {
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
       "source": "app/(suspense-in-root)/static/missing-suspense-around-params/[param]/page.tsx (17:21) @ Runtime
     > 17 |   const { param } = await params
          |                     ^",
       "stack": [
         "Runtime app/(suspense-in-root)/static/missing-suspense-around-params/[param]/page.tsx (17:21)",
         "Page app/(suspense-in-root)/static/missing-suspense-around-params/[param]/page.tsx (11:7)",
       ],
     }
    `)
  })
  it('valid - runtime prefetch - does not require Suspense around params', async () => {
    const browser = await next.browser('/runtime/no-suspense-around-params/123')
    await browser.elementByCss('main')
    await waitForNoErrorToast(browser)
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
    const browser = await next.browser('/static/valid-blocked-children')
    await browser.elementByCss('main')
    await waitForNoErrorToast(browser)
  })

  it('invalid - static prefetch - suspense too high', async () => {
    const browser = await next.browser('/static/suspense-too-high')
    await expect(browser).toDisplayCollapsedRedbox(`
     {
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
       "source": "app/(suspense-in-root)/static/suspense-too-high/page.tsx (6:16) @ Page
     > 6 |   await cookies()
         |                ^",
       "stack": [
         "Page app/(suspense-in-root)/static/suspense-too-high/page.tsx (6:16)",
       ],
     }
    `)
  })
  it('invalid - runtime prefetch - suspense too high', async () => {
    const browser = await next.browser('/runtime/suspense-too-high')
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
       "source": "app/(suspense-in-root)/runtime/suspense-too-high/page.tsx (26:19) @ Dynamic
     > 26 |   await connection()
          |                   ^",
       "stack": [
         "Dynamic app/(suspense-in-root)/runtime/suspense-too-high/page.tsx (26:19)",
         "Page app/(suspense-in-root)/runtime/suspense-too-high/page.tsx (19:9)",
       ],
     }
    `)
  })

  it('invalid - runtime prefetch - sync IO after runtime API', async () => {
    const browser = await next.browser('/runtime/invalid-sync-io')
    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "description": "Route "/runtime/invalid-sync-io" used \`Date.now()\` before accessing either uncached data (e.g. \`fetch()\`) or awaiting \`connection()\`. When configured for Runtime prefetching, accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-runtime-current-time",
       "environmentLabel": "Server",
       "label": "Console Error",
       "source": "app/(suspense-in-root)/runtime/invalid-sync-io/page.tsx (10:20) @ Page
     > 10 |   const now = Date.now()
          |                    ^",
       "stack": [
         "Page app/(suspense-in-root)/runtime/invalid-sync-io/page.tsx (10:20)",
         "Page <anonymous>",
       ],
     }
    `)
  })

  it('invalid - missing suspense around dynamic (with loading.js)', async () => {
    const browser = await next.browser(
      '/static/invalid-only-loading-around-dynamic'
    )
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
       "source": "app/(suspense-in-root)/static/invalid-only-loading-around-dynamic/page.tsx (32:19) @ Dynamic
     > 32 |   await connection()
          |                   ^",
       "stack": [
         "Dynamic app/(suspense-in-root)/static/invalid-only-loading-around-dynamic/page.tsx (32:19)",
         "Page app/(suspense-in-root)/static/invalid-only-loading-around-dynamic/page.tsx (19:9)",
       ],
     }
    `)
  })

  describe('blocking', () => {
    it('valid - blocking layout with unstable_instant = false is allowed to block', async () => {
      const browser = await next.browser('/static/blocking-layout')
      await browser.elementByCss('main')
      await waitForNoErrorToast(browser)
    })
    it('invalid - missing suspense inside blocking layout', async () => {
      const browser = await next.browser(
        '/static/blocking-layout/missing-suspense-around-dynamic'
      )
      await expect(browser).toDisplayCollapsedRedbox(`
       {
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
         "source": "app/(suspense-in-root)/static/blocking-layout/missing-suspense-around-dynamic/page.tsx (6:16) @ Page
       > 6 |   await cookies()
           |                ^",
         "stack": [
           "Page app/(suspense-in-root)/static/blocking-layout/missing-suspense-around-dynamic/page.tsx (6:16)",
         ],
       }
      `)
    })

    it('valid - blocking page inside a static layout is allowed if the layout has suspense', async () => {
      const browser = await next.browser('/static/valid-blocking-inside-static')
      await browser.elementByCss('main')
      await waitForNoErrorToast(browser)
    })
    it('valid - blocking page inside a runtime layout is allowed if the layout has suspense', async () => {
      const browser = await next.browser(
        '/runtime/valid-blocking-inside-runtime'
      )
      await browser.elementByCss('main')
      await waitForNoErrorToast(browser)
    })

    it('invalid - blocking page inside a static layout is not allowed if the layout has no suspense', async () => {
      const browser = await next.browser(
        '/static/invalid-blocking-inside-static'
      )
      await expect(browser).toDisplayCollapsedRedbox(`
       {
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
         "source": "app/(suspense-in-root)/static/invalid-blocking-inside-static/page.tsx (6:16) @ BlockingPage
       > 6 |   await cookies()
           |                ^",
         "stack": [
           "BlockingPage app/(suspense-in-root)/static/invalid-blocking-inside-static/page.tsx (6:16)",
         ],
       }
      `)
    })
    it('invalid - blocking page inside a runtime layout is not allowed if the layout has no suspense', async () => {
      const browser = await next.browser(
        '/runtime/invalid-blocking-inside-runtime'
      )
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
         "source": "app/(suspense-in-root)/runtime/invalid-blocking-inside-runtime/page.tsx (6:19) @ BlockingPage
       > 6 |   await connection()
           |                   ^",
         "stack": [
           "BlockingPage app/(suspense-in-root)/runtime/invalid-blocking-inside-runtime/page.tsx (6:19)",
         ],
       }
      `)
    })
  })

  describe('invalid - missing suspense in parallel slot', () => {
    it('index', async () => {
      const browser = await next.browser(
        '/static/missing-suspense-in-parallel-route'
      )
      await expect(browser).toDisplayCollapsedRedbox(`
       {
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
         "source": "app/(suspense-in-root)/static/missing-suspense-in-parallel-route/@slot/page.tsx (4:16) @ IndexSlot
       > 4 |   await cookies()
           |                ^",
         "stack": [
           "IndexSlot app/(suspense-in-root)/static/missing-suspense-in-parallel-route/@slot/page.tsx (4:16)",
         ],
       }
      `)
    })

    it('subpage', async () => {
      const browser = await next.browser(
        '/static/missing-suspense-in-parallel-route/foo'
      )
      await expect(browser).toDisplayCollapsedRedbox(`
       {
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
         "source": "app/(suspense-in-root)/static/missing-suspense-in-parallel-route/@slot/foo/page.tsx (4:16) @ FooSlot
       > 4 |   await cookies()
           |                ^",
         "stack": [
           "FooSlot app/(suspense-in-root)/static/missing-suspense-in-parallel-route/@slot/foo/page.tsx (4:16)",
         ],
       }
      `)
    })

    it('default slot', async () => {
      const browser = await next.browser(
        '/static/missing-suspense-in-parallel-route/bar'
      )
      await expect(browser).toDisplayCollapsedRedbox(`
       {
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
         "source": "app/(suspense-in-root)/static/missing-suspense-in-parallel-route/@slot/default.tsx (4:16) @ DefaultSlot
       > 4 |   await cookies()
           |                ^",
         "stack": [
           "DefaultSlot app/(suspense-in-root)/static/missing-suspense-in-parallel-route/@slot/default.tsx (4:16)",
         ],
       }
      `)
    })
  })

  describe('disabling validation', () => {
    it('in a layout', async () => {
      const browser = await next.browser('/disable-validation/in-layout')
      await browser.elementByCss('main')
      await waitForNoErrorToast(browser)
    })
    it('in a page', async () => {
      const browser = await next.browser('/disable-validation/in-page')
      await browser.elementByCss('main')
      await waitForNoErrorToast(browser)
    })
    it('in a page with a parent that has a config', async () => {
      const browser = await next.browser(
        '/disable-validation/in-page-with-outer'
      )
      await browser.elementByCss('main')
      await waitForNoErrorToast(browser)
    })
  })
})
