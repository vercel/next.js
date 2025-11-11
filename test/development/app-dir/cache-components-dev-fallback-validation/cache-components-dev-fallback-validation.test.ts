import { nextTestSetup } from 'e2e-utils'
import { waitForNoRedbox } from 'next-test-utils'

describe('Cache Components Fallback Validation', () => {
  const { isTurbopack, next } = nextTestSetup({
    files: __dirname,
  })

  it('should not warn about missing Suspense when accessing params if static params are completely known at build time', async () => {
    // when the params are complete we don't expect to see any errors await params regarless of where there
    // are Suspense boundaries.
    const browser = await next.browser(
      '/complete/prerendered/wrapped/prerendered'
    )
    await waitForNoRedbox(browser)

    await browser.loadPage(`${next.url}/complete/prerendered/wrapped/novel`)
    await waitForNoRedbox(browser)

    await browser.loadPage(`${next.url}/complete/novel/wrapped/novel`)
    await waitForNoRedbox(browser)

    await browser.loadPage(
      `${next.url}/complete/prerendered/unwrapped/prerendered`
    )
    await waitForNoRedbox(browser)

    await browser.loadPage(`${next.url}/complete/prerendered/unwrapped/novel`)
    await waitForNoRedbox(browser)

    await browser.loadPage(`${next.url}/complete/novel/unwrapped/novel`)
    await waitForNoRedbox(browser)
  })

  it('should warn about missing Suspense when accessing params if static params are partially known at build time', async () => {
    // when the params are partially complete we don't expect to see any errors awaiting the params that are known
    // but do expect errors awaiting the params that are not known if not inside a Suspense boundary.
    const browser = await next.browser(
      '/partial/prerendered/wrapped/prerendered'
    )
    await waitForNoRedbox(browser)

    await browser.loadPage(`${next.url}/partial/prerendered/wrapped/novel`)
    await waitForNoRedbox(browser)

    await browser.loadPage(`${next.url}/partial/novel/wrapped/novel`)
    await waitForNoRedbox(browser)

    await browser.loadPage(
      `${next.url}/partial/prerendered/unwrapped/prerendered`
    )
    if (isTurbopack) {
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
         "source": "app/partial/[top]/unwrapped/[bottom]/page.tsx (13:26) @ Page
       > 13 |       Top: {(await props.params).top}, Bottom: {(await props.params).bottom}
            |                          ^",
         "stack": [
           "Page app/partial/[top]/unwrapped/[bottom]/page.tsx (13:26)",
           "ReportValidation <anonymous>",
         ],
       }
      `)
    } else {
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
         "source": "app/partial/[top]/unwrapped/[bottom]/page.tsx (13:26) @ Page
       > 13 |       Top: {(await props.params).top}, Bottom: {(await props.params).bottom}
            |                          ^",
         "stack": [
           "Page app/partial/[top]/unwrapped/[bottom]/page.tsx (13:26)",
           "ReportValidation <anonymous>",
         ],
       }
      `)
    }

    await browser.loadPage(`${next.url}/partial/prerendered/unwrapped/novel`)
    if (isTurbopack) {
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
         "source": "app/partial/[top]/unwrapped/[bottom]/page.tsx (13:26) @ Page
       > 13 |       Top: {(await props.params).top}, Bottom: {(await props.params).bottom}
            |                          ^",
         "stack": [
           "Page app/partial/[top]/unwrapped/[bottom]/page.tsx (13:26)",
           "ReportValidation <anonymous>",
         ],
       }
      `)
    } else {
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
         "source": "app/partial/[top]/unwrapped/[bottom]/page.tsx (13:26) @ Page
       > 13 |       Top: {(await props.params).top}, Bottom: {(await props.params).bottom}
            |                          ^",
         "stack": [
           "Page app/partial/[top]/unwrapped/[bottom]/page.tsx (13:26)",
           "ReportValidation <anonymous>",
         ],
       }
      `)
    }

    await browser.loadPage(`${next.url}/partial/novel/unwrapped/novel`)
    if (isTurbopack) {
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
         "source": "app/partial/[top]/unwrapped/[bottom]/page.tsx (13:26) @ Page
       > 13 |       Top: {(await props.params).top}, Bottom: {(await props.params).bottom}
            |                          ^",
         "stack": [
           "Page app/partial/[top]/unwrapped/[bottom]/page.tsx (13:26)",
           "ReportValidation <anonymous>",
         ],
       }
      `)
    } else {
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
         "source": "app/partial/[top]/unwrapped/[bottom]/page.tsx (13:26) @ Page
       > 13 |       Top: {(await props.params).top}, Bottom: {(await props.params).bottom}
            |                          ^",
         "stack": [
           "Page app/partial/[top]/unwrapped/[bottom]/page.tsx (13:26)",
           "ReportValidation <anonymous>",
         ],
       }
      `)
    }
  })

  it('should warn about missing Suspense when accessing params if static params are entirely missing at build time', async () => {
    // when the params are partially complete we don't expect to see any errors awaiting the params that are known
    // but do expect errors awaiting the params that are not known if not inside a Suspense boundary.
    const browser = await next.browser('/none/prerendered/wrapped/prerendered')
    if (isTurbopack) {
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
         "source": "app/none/[top]/wrapped/layout.tsx (10:3) @ Layout
       > 10 |   await params
            |   ^",
         "stack": [
           "Layout app/none/[top]/wrapped/layout.tsx (10:3)",
           "ReportValidation <anonymous>",
         ],
       }
      `)
    } else {
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
         "source": "app/none/[top]/wrapped/layout.tsx (10:3) @ Layout
       > 10 |   await params
            |   ^",
         "stack": [
           "Layout app/none/[top]/wrapped/layout.tsx (10:3)",
           "ReportValidation <anonymous>",
         ],
       }
      `)
    }

    await browser.loadPage(`${next.url}/none/prerendered/wrapped/novel`)
    if (isTurbopack) {
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
         "source": "app/none/[top]/wrapped/layout.tsx (10:3) @ Layout
       > 10 |   await params
            |   ^",
         "stack": [
           "Layout app/none/[top]/wrapped/layout.tsx (10:3)",
           "ReportValidation <anonymous>",
         ],
       }
      `)
    } else {
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
         "source": "app/none/[top]/wrapped/layout.tsx (10:3) @ Layout
       > 10 |   await params
            |   ^",
         "stack": [
           "Layout app/none/[top]/wrapped/layout.tsx (10:3)",
           "ReportValidation <anonymous>",
         ],
       }
      `)
    }

    await browser.loadPage(`${next.url}/none/novel/wrapped/novel`)
    if (isTurbopack) {
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
         "source": "app/none/[top]/wrapped/layout.tsx (10:3) @ Layout
       > 10 |   await params
            |   ^",
         "stack": [
           "Layout app/none/[top]/wrapped/layout.tsx (10:3)",
           "ReportValidation <anonymous>",
         ],
       }
      `)
    } else {
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
         "source": "app/none/[top]/wrapped/layout.tsx (10:3) @ Layout
       > 10 |   await params
            |   ^",
         "stack": [
           "Layout app/none/[top]/wrapped/layout.tsx (10:3)",
           "ReportValidation <anonymous>",
         ],
       }
      `)
    }

    await browser.loadPage(`${next.url}/none/prerendered/unwrapped/prerendered`)
    if (isTurbopack) {
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
         "source": "app/none/[top]/unwrapped/layout.tsx (8:3) @ Layout
       >  8 |   await params
            |   ^",
         "stack": [
           "Layout app/none/[top]/unwrapped/layout.tsx (8:3)",
           "ReportValidation <anonymous>",
         ],
       }
      `)
    } else {
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
         "source": "app/none/[top]/unwrapped/layout.tsx (8:3) @ Layout
       >  8 |   await params
            |   ^",
         "stack": [
           "Layout app/none/[top]/unwrapped/layout.tsx (8:3)",
           "ReportValidation <anonymous>",
         ],
       }
      `)
    }

    await browser.loadPage(`${next.url}/none/prerendered/unwrapped/novel`)
    if (isTurbopack) {
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
         "source": "app/none/[top]/unwrapped/layout.tsx (8:3) @ Layout
       >  8 |   await params
            |   ^",
         "stack": [
           "Layout app/none/[top]/unwrapped/layout.tsx (8:3)",
           "ReportValidation <anonymous>",
         ],
       }
      `)
    } else {
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
         "source": "app/none/[top]/unwrapped/layout.tsx (8:3) @ Layout
       >  8 |   await params
            |   ^",
         "stack": [
           "Layout app/none/[top]/unwrapped/layout.tsx (8:3)",
           "ReportValidation <anonymous>",
         ],
       }
      `)
    }

    await browser.loadPage(`${next.url}/none/novel/unwrapped/novel`)
    if (isTurbopack) {
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
         "source": "app/none/[top]/unwrapped/layout.tsx (8:3) @ Layout
       >  8 |   await params
            |   ^",
         "stack": [
           "Layout app/none/[top]/unwrapped/layout.tsx (8:3)",
           "ReportValidation <anonymous>",
         ],
       }
      `)
    } else {
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
         "source": "app/none/[top]/unwrapped/layout.tsx (8:3) @ Layout
       >  8 |   await params
            |   ^",
         "stack": [
           "Layout app/none/[top]/unwrapped/layout.tsx (8:3)",
           "ReportValidation <anonymous>",
         ],
       }
      `)
    }
  })
})
