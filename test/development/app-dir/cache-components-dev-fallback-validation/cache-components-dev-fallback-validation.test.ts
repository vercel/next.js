import { nextTestSetup } from 'e2e-utils'
import { assertNoRedbox } from 'next-test-utils'

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
    await assertNoRedbox(browser)

    await browser.loadPage(`${next.url}/complete/prerendered/wrapped/novel`)
    await assertNoRedbox(browser)

    await browser.loadPage(`${next.url}/complete/novel/wrapped/novel`)
    await assertNoRedbox(browser)

    await browser.loadPage(
      `${next.url}/complete/prerendered/unwrapped/prerendered`
    )
    await assertNoRedbox(browser)

    await browser.loadPage(`${next.url}/complete/prerendered/unwrapped/novel`)
    await assertNoRedbox(browser)

    await browser.loadPage(`${next.url}/complete/novel/unwrapped/novel`)
    await assertNoRedbox(browser)
  })

  it('should warn about missing Suspense when accessing params if static params are partially known at build time', async () => {
    // when the params are partially complete we don't expect to see any errors awaiting the params that are known
    // but do expect errors awaiting the params that are not known if not inside a Suspense boundary.
    const browser = await next.browser(
      '/partial/prerendered/wrapped/prerendered'
    )
    await assertNoRedbox(browser)

    await browser.loadPage(`${next.url}/partial/prerendered/wrapped/novel`)
    await assertNoRedbox(browser)

    await browser.loadPage(`${next.url}/partial/novel/wrapped/novel`)
    await assertNoRedbox(browser)

    await browser.loadPage(
      `${next.url}/partial/prerendered/unwrapped/prerendered`
    )
    if (isTurbopack) {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "description": "Route "/partial/[top]/unwrapped/[bottom]": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
         "environmentLabel": "Server",
         "label": "Console Error",
         "source": "app/partial/[top]/unwrapped/[bottom]/page.tsx (6:26) @ Page
       > 6 |       Top: {(await props.params).top}, Bottom: {(await props.params).bottom}
           |                          ^",
         "stack": [
           "Page app/partial/[top]/unwrapped/[bottom]/page.tsx (6:26)",
           "LogSafely <anonymous>",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "description": "Route "/partial/[top]/unwrapped/[bottom]": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
         "environmentLabel": "Server",
         "label": "Console Error",
         "source": "app/partial/[top]/unwrapped/[bottom]/page.tsx (6:26) @ Page
       > 6 |       Top: {(await props.params).top}, Bottom: {(await props.params).bottom}
           |                          ^",
         "stack": [
           "Page app/partial/[top]/unwrapped/[bottom]/page.tsx (6:26)",
           "LogSafely <anonymous>",
         ],
       }
      `)
    }

    await browser.loadPage(`${next.url}/partial/prerendered/unwrapped/novel`)
    if (isTurbopack) {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "description": "Route "/partial/[top]/unwrapped/[bottom]": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
         "environmentLabel": "Server",
         "label": "Console Error",
         "source": "app/partial/[top]/unwrapped/[bottom]/page.tsx (6:26) @ Page
       > 6 |       Top: {(await props.params).top}, Bottom: {(await props.params).bottom}
           |                          ^",
         "stack": [
           "Page app/partial/[top]/unwrapped/[bottom]/page.tsx (6:26)",
           "LogSafely <anonymous>",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "description": "Route "/partial/[top]/unwrapped/[bottom]": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
         "environmentLabel": "Server",
         "label": "Console Error",
         "source": "app/partial/[top]/unwrapped/[bottom]/page.tsx (6:26) @ Page
       > 6 |       Top: {(await props.params).top}, Bottom: {(await props.params).bottom}
           |                          ^",
         "stack": [
           "Page app/partial/[top]/unwrapped/[bottom]/page.tsx (6:26)",
           "LogSafely <anonymous>",
         ],
       }
      `)
    }

    await browser.loadPage(`${next.url}/partial/novel/unwrapped/novel`)
    if (isTurbopack) {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "description": "Route "/partial/[top]/unwrapped/[bottom]": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
         "environmentLabel": "Server",
         "label": "Console Error",
         "source": "app/partial/[top]/unwrapped/[bottom]/page.tsx (6:26) @ Page
       > 6 |       Top: {(await props.params).top}, Bottom: {(await props.params).bottom}
           |                          ^",
         "stack": [
           "Page app/partial/[top]/unwrapped/[bottom]/page.tsx (6:26)",
           "LogSafely <anonymous>",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "description": "Route "/partial/[top]/unwrapped/[bottom]": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
         "environmentLabel": "Server",
         "label": "Console Error",
         "source": "app/partial/[top]/unwrapped/[bottom]/page.tsx (6:26) @ Page
       > 6 |       Top: {(await props.params).top}, Bottom: {(await props.params).bottom}
           |                          ^",
         "stack": [
           "Page app/partial/[top]/unwrapped/[bottom]/page.tsx (6:26)",
           "LogSafely <anonymous>",
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
         "description": "Route "/none/[top]/wrapped/[bottom]": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
         "environmentLabel": "Server",
         "label": "Console Error",
         "source": "app/none/[top]/wrapped/layout.tsx (10:3) @ Layout
       > 10 |   await params
            |   ^",
         "stack": [
           "Layout app/none/[top]/wrapped/layout.tsx (10:3)",
           "LogSafely <anonymous>",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "description": "Route "/none/[top]/wrapped/[bottom]": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
         "environmentLabel": "Server",
         "label": "Console Error",
         "source": "app/none/[top]/wrapped/layout.tsx (10:3) @ Layout
       > 10 |   await params
            |   ^",
         "stack": [
           "Layout app/none/[top]/wrapped/layout.tsx (10:3)",
           "LogSafely <anonymous>",
         ],
       }
      `)
    }

    await browser.loadPage(`${next.url}/none/prerendered/wrapped/novel`)
    if (isTurbopack) {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "description": "Route "/none/[top]/wrapped/[bottom]": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
         "environmentLabel": "Server",
         "label": "Console Error",
         "source": "app/none/[top]/wrapped/layout.tsx (10:3) @ Layout
       > 10 |   await params
            |   ^",
         "stack": [
           "Layout app/none/[top]/wrapped/layout.tsx (10:3)",
           "LogSafely <anonymous>",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "description": "Route "/none/[top]/wrapped/[bottom]": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
         "environmentLabel": "Server",
         "label": "Console Error",
         "source": "app/none/[top]/wrapped/layout.tsx (10:3) @ Layout
       > 10 |   await params
            |   ^",
         "stack": [
           "Layout app/none/[top]/wrapped/layout.tsx (10:3)",
           "LogSafely <anonymous>",
         ],
       }
      `)
    }

    await browser.loadPage(`${next.url}/none/novel/wrapped/novel`)
    if (isTurbopack) {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "description": "Route "/none/[top]/wrapped/[bottom]": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
         "environmentLabel": "Server",
         "label": "Console Error",
         "source": "app/none/[top]/wrapped/layout.tsx (10:3) @ Layout
       > 10 |   await params
            |   ^",
         "stack": [
           "Layout app/none/[top]/wrapped/layout.tsx (10:3)",
           "LogSafely <anonymous>",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "description": "Route "/none/[top]/wrapped/[bottom]": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
         "environmentLabel": "Server",
         "label": "Console Error",
         "source": "app/none/[top]/wrapped/layout.tsx (10:3) @ Layout
       > 10 |   await params
            |   ^",
         "stack": [
           "Layout app/none/[top]/wrapped/layout.tsx (10:3)",
           "LogSafely <anonymous>",
         ],
       }
      `)
    }

    await browser.loadPage(`${next.url}/none/prerendered/unwrapped/prerendered`)
    if (isTurbopack) {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "description": "Route "/none/[top]/unwrapped/[bottom]": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
         "environmentLabel": "Server",
         "label": "Console Error",
         "source": "app/none/[top]/unwrapped/layout.tsx (8:3) @ Layout
       >  8 |   await params
            |   ^",
         "stack": [
           "Layout app/none/[top]/unwrapped/layout.tsx (8:3)",
           "LogSafely <anonymous>",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "description": "Route "/none/[top]/unwrapped/[bottom]": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
         "environmentLabel": "Server",
         "label": "Console Error",
         "source": "app/none/[top]/unwrapped/layout.tsx (8:3) @ Layout
       >  8 |   await params
            |   ^",
         "stack": [
           "Layout app/none/[top]/unwrapped/layout.tsx (8:3)",
           "LogSafely <anonymous>",
         ],
       }
      `)
    }

    await browser.loadPage(`${next.url}/none/prerendered/unwrapped/novel`)
    if (isTurbopack) {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "description": "Route "/none/[top]/unwrapped/[bottom]": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
         "environmentLabel": "Server",
         "label": "Console Error",
         "source": "app/none/[top]/unwrapped/layout.tsx (8:3) @ Layout
       >  8 |   await params
            |   ^",
         "stack": [
           "Layout app/none/[top]/unwrapped/layout.tsx (8:3)",
           "LogSafely <anonymous>",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "description": "Route "/none/[top]/unwrapped/[bottom]": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
         "environmentLabel": "Server",
         "label": "Console Error",
         "source": "app/none/[top]/unwrapped/layout.tsx (8:3) @ Layout
       >  8 |   await params
            |   ^",
         "stack": [
           "Layout app/none/[top]/unwrapped/layout.tsx (8:3)",
           "LogSafely <anonymous>",
         ],
       }
      `)
    }

    await browser.loadPage(`${next.url}/none/novel/unwrapped/novel`)
    if (isTurbopack) {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "description": "Route "/none/[top]/unwrapped/[bottom]": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
         "environmentLabel": "Server",
         "label": "Console Error",
         "source": "app/none/[top]/unwrapped/layout.tsx (8:3) @ Layout
       >  8 |   await params
            |   ^",
         "stack": [
           "Layout app/none/[top]/unwrapped/layout.tsx (8:3)",
           "LogSafely <anonymous>",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "description": "Route "/none/[top]/unwrapped/[bottom]": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
         "environmentLabel": "Server",
         "label": "Console Error",
         "source": "app/none/[top]/unwrapped/layout.tsx (8:3) @ Layout
       >  8 |   await params
            |   ^",
         "stack": [
           "Layout app/none/[top]/unwrapped/layout.tsx (8:3)",
           "LogSafely <anonymous>",
         ],
       }
      `)
    }
  })
})
