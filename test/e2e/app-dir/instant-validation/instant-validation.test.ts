import { describeInstantValidationTests } from './instant-validation-test-utils'

describeInstantValidationTests(
  ({
    isNextDev,
    navigateTo,
    expectNoDevValidationErrors,
    prerender,
    expectNoBuildValidationErrors,
    extractBuildValidationError,
  }) => {
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
               "source": "app/suspense-in-root/static/missing-suspense-around-runtime/page.tsx (3:24) @ instant
         > 3 | export const instant = { level: 'experimental-error' }
             |                        ^",
               "stack": [
                 "instant app/suspense-in-root/static/missing-suspense-around-runtime/page.tsx (3:24)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
           "code": "E1319",
           "description": "Next.js encountered runtime data during a navigation.",
           "environmentLabel": "Server",
           "label": "Instant",
           "source": "app/suspense-in-root/static/missing-suspense-around-runtime/page.tsx (6:16) @ Page
         > 6 |   await cookies()
             |                ^",
           "stack": [
             "Page app/suspense-in-root/static/missing-suspense-around-runtime/page.tsx (6:16)",
           ],
         }
        `)
      } else {
        const result = await prerender(
          '/suspense-in-root/static/missing-suspense-around-runtime'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
         "Error: Route "/suspense-in-root/static/missing-suspense-around-runtime": Next.js encountered runtime data during prerendering or a navigation.

         \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

         Ways to fix this:
           - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
             https://nextjs.org/docs/messages/blocking-prerender-runtime#wrap-in-or-move-into-suspense
           - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
             https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
           - [block] Set \`export const instant = false\` to silence this warning and allow a blocking route
             https://nextjs.org/docs/messages/blocking-prerender-runtime#allow-blocking-route
             at body (<anonymous>)
             at html (<anonymous>)
             at a (<anonymous>)
         Build-time instant validation failed for route "/suspense-in-root/static/missing-suspense-around-runtime".
         To get a more detailed stack trace and pinpoint the issue, try one of the following:
           - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/missing-suspense-around-runtime" in your browser to investigate the error.
           - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
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
               "source": "app/suspense-in-root/static/missing-suspense-around-dynamic/page.tsx (3:24) @ instant
         > 3 | export const instant = { level: 'experimental-error' }
             |                        ^",
               "stack": [
                 "instant app/suspense-in-root/static/missing-suspense-around-dynamic/page.tsx (3:24)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
           "code": "E1317",
           "description": "Next.js encountered uncached data during a navigation.",
           "environmentLabel": "Server",
           "label": "Instant",
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
         "Error: Route "/suspense-in-root/static/missing-suspense-around-dynamic": Next.js encountered uncached data during prerendering or a navigation.

         \`fetch(...)\` or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

         Ways to fix this:
           - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
             https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
           - [cache] Cache the data access with \`"use cache"\`
             https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
           - [block] Set \`export const instant = false\` to silence this warning and allow a blocking route
             https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
             at body (<anonymous>)
             at html (<anonymous>)
             at a (<anonymous>)
         Build-time instant validation failed for route "/suspense-in-root/static/missing-suspense-around-dynamic".
         To get a more detailed stack trace and pinpoint the issue, try one of the following:
           - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/missing-suspense-around-dynamic" in your browser to investigate the error.
           - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
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
               "source": "app/suspense-in-root/runtime/missing-suspense-around-dynamic/page.tsx (4:24) @ instant
         > 4 | export const instant = { level: 'experimental-error' }
             |                        ^",
               "stack": [
                 "instant app/suspense-in-root/runtime/missing-suspense-around-dynamic/page.tsx (4:24)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
           "code": "E1317",
           "description": "Next.js encountered uncached data during a navigation.",
           "environmentLabel": "Server",
           "label": "Instant",
           "source": "app/suspense-in-root/runtime/missing-suspense-around-dynamic/page.tsx (23:19) @ Dynamic
         > 23 |   await connection()
              |                   ^",
           "stack": [
             "Dynamic app/suspense-in-root/runtime/missing-suspense-around-dynamic/page.tsx (23:19)",
             "Page app/suspense-in-root/runtime/missing-suspense-around-dynamic/page.tsx (16:9)",
           ],
         }
        `)
      } else {
        const result = await prerender(
          '/suspense-in-root/runtime/missing-suspense-around-dynamic'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
         "Error: Route "/suspense-in-root/runtime/missing-suspense-around-dynamic": Next.js encountered uncached data during prerendering or a navigation.

         \`fetch(...)\` or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

         Ways to fix this:
           - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
             https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
           - [cache] Cache the data access with \`"use cache"\`
             https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
           - [block] Set \`export const instant = false\` to silence this warning and allow a blocking route
             https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
             at div (<anonymous>)
             at main (<anonymous>)
             at body (<anonymous>)
             at html (<anonymous>)
             at a (<anonymous>)
         Build-time instant validation failed for route "/suspense-in-root/runtime/missing-suspense-around-dynamic".
         To get a more detailed stack trace and pinpoint the issue, try one of the following:
           - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/runtime/missing-suspense-around-dynamic" in your browser to investigate the error.
           - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
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
               "source": "app/suspense-in-root/static/missing-suspense-around-dynamic-layout/layout.tsx (4:24) @ instant
         > 4 | export const instant = { level: 'experimental-error' }
             |                        ^",
               "stack": [
                 "instant app/suspense-in-root/static/missing-suspense-around-dynamic-layout/layout.tsx (4:24)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
           "code": "E1319",
           "description": "Next.js encountered runtime data during a navigation.",
           "environmentLabel": "Server",
           "label": "Instant",
           "source": "app/suspense-in-root/static/missing-suspense-around-dynamic-layout/layout.tsx (7:16) @ Layout
         >  7 |   await cookies()
              |                ^",
           "stack": [
             "Layout app/suspense-in-root/static/missing-suspense-around-dynamic-layout/layout.tsx (7:16)",
           ],
         }
        `)
      } else {
        const result = await prerender(
          '/suspense-in-root/static/missing-suspense-around-dynamic-layout'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
         "Error: Route "/suspense-in-root/static/missing-suspense-around-dynamic-layout": Next.js encountered runtime data during prerendering or a navigation.

         \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

         Ways to fix this:
           - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
             https://nextjs.org/docs/messages/blocking-prerender-runtime#wrap-in-or-move-into-suspense
           - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
             https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
           - [block] Set \`export const instant = false\` to silence this warning and allow a blocking route
             https://nextjs.org/docs/messages/blocking-prerender-runtime#allow-blocking-route
             at body (<anonymous>)
             at html (<anonymous>)
             at a (<anonymous>)
         Build-time instant validation failed for route "/suspense-in-root/static/missing-suspense-around-dynamic-layout".
         To get a more detailed stack trace and pinpoint the issue, try one of the following:
           - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/missing-suspense-around-dynamic-layout" in your browser to investigate the error.
           - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
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
               "source": "app/suspense-in-root/runtime/missing-suspense-around-dynamic-layout/layout.tsx (4:24) @ instant
         > 4 | export const instant = { level: 'experimental-error' }
             |                        ^",
               "stack": [
                 "instant app/suspense-in-root/runtime/missing-suspense-around-dynamic-layout/layout.tsx (4:24)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
           "code": "E1317",
           "description": "Next.js encountered uncached data during a navigation.",
           "environmentLabel": "Server",
           "label": "Instant",
           "source": "app/suspense-in-root/runtime/missing-suspense-around-dynamic-layout/layout.tsx (8:19) @ Layout
         >  8 |   await connection()
              |                   ^",
           "stack": [
             "Layout app/suspense-in-root/runtime/missing-suspense-around-dynamic-layout/layout.tsx (8:19)",
           ],
         }
        `)
      } else {
        const result = await prerender(
          '/suspense-in-root/runtime/missing-suspense-around-dynamic-layout'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
         "Error: Route "/suspense-in-root/runtime/missing-suspense-around-dynamic-layout": Next.js encountered uncached data during prerendering or a navigation.

         \`fetch(...)\` or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

         Ways to fix this:
           - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
             https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
           - [cache] Cache the data access with \`"use cache"\`
             https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
           - [block] Set \`export const instant = false\` to silence this warning and allow a blocking route
             https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
             at body (<anonymous>)
             at html (<anonymous>)
             at a (<anonymous>)
         Build-time instant validation failed for route "/suspense-in-root/runtime/missing-suspense-around-dynamic-layout".
         To get a more detailed stack trace and pinpoint the issue, try one of the following:
           - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/runtime/missing-suspense-around-dynamic-layout" in your browser to investigate the error.
           - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
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
             "source": "app/suspense-in-root/static/missing-suspense-around-params/[param]/page.tsx (1:24) @ instant
       > 1 | export const instant = {
           |                        ^",
             "stack": [
               "instant app/suspense-in-root/static/missing-suspense-around-params/[param]/page.tsx (1:24)",
               "Set.forEach <anonymous>",
             ],
           },
         ],
         "code": "E1319",
         "description": "Next.js encountered runtime data during a navigation.",
         "environmentLabel": "Server",
         "label": "Instant",
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
               "source": "app/suspense-in-root/static/missing-suspense-around-search-params/page.tsx (1:24) @ instant
         > 1 | export const instant = {
             |                        ^",
               "stack": [
                 "instant app/suspense-in-root/static/missing-suspense-around-search-params/page.tsx (1:24)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
           "code": "E1319",
           "description": "Next.js encountered runtime data during a navigation.",
           "environmentLabel": "Server",
           "label": "Instant",
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
         "Error: Route "/suspense-in-root/static/missing-suspense-around-search-params": Next.js encountered runtime data during prerendering or a navigation.

         \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

         Ways to fix this:
           - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
             https://nextjs.org/docs/messages/blocking-prerender-runtime#wrap-in-or-move-into-suspense
           - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
             https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
           - [block] Set \`export const instant = false\` to silence this warning and allow a blocking route
             https://nextjs.org/docs/messages/blocking-prerender-runtime#allow-blocking-route
             at body (<anonymous>)
             at html (<anonymous>)
             at a (<anonymous>)
         Build-time instant validation failed for route "/suspense-in-root/static/missing-suspense-around-search-params".
         To get a more detailed stack trace and pinpoint the issue, try one of the following:
           - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/missing-suspense-around-search-params" in your browser to investigate the error.
           - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
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
               "source": "app/suspense-in-root/static/suspense-too-high/page.tsx (3:24) @ instant
         > 3 | export const instant = { level: 'experimental-error' }
             |                        ^",
               "stack": [
                 "instant app/suspense-in-root/static/suspense-too-high/page.tsx (3:24)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
           "code": "E1319",
           "description": "Next.js encountered runtime data during a navigation.",
           "environmentLabel": "Server",
           "label": "Instant",
           "source": "app/suspense-in-root/static/suspense-too-high/page.tsx (6:16) @ Page
         > 6 |   await cookies()
             |                ^",
           "stack": [
             "Page app/suspense-in-root/static/suspense-too-high/page.tsx (6:16)",
           ],
         }
        `)
      } else {
        const result = await prerender(
          '/suspense-in-root/static/suspense-too-high'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
         "Error: Route "/suspense-in-root/static/suspense-too-high": Next.js encountered runtime data during prerendering or a navigation.

         \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

         Ways to fix this:
           - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
             https://nextjs.org/docs/messages/blocking-prerender-runtime#wrap-in-or-move-into-suspense
           - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
             https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
           - [block] Set \`export const instant = false\` to silence this warning and allow a blocking route
             https://nextjs.org/docs/messages/blocking-prerender-runtime#allow-blocking-route
             at a (<anonymous>)
             at div (<anonymous>)
             at div (<anonymous>)
             at body (<anonymous>)
             at html (<anonymous>)
             at b (<anonymous>)
         Build-time instant validation failed for route "/suspense-in-root/static/suspense-too-high".
         To get a more detailed stack trace and pinpoint the issue, try one of the following:
           - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/suspense-too-high" in your browser to investigate the error.
           - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
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
               "source": "app/suspense-in-root/runtime/suspense-too-high/page.tsx (4:24) @ instant
         > 4 | export const instant = { level: 'experimental-error' }
             |                        ^",
               "stack": [
                 "instant app/suspense-in-root/runtime/suspense-too-high/page.tsx (4:24)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
           "code": "E1317",
           "description": "Next.js encountered uncached data during a navigation.",
           "environmentLabel": "Server",
           "label": "Instant",
           "source": "app/suspense-in-root/runtime/suspense-too-high/page.tsx (24:19) @ Dynamic
         > 24 |   await connection()
              |                   ^",
           "stack": [
             "Dynamic app/suspense-in-root/runtime/suspense-too-high/page.tsx (24:19)",
             "Page app/suspense-in-root/runtime/suspense-too-high/page.tsx (17:9)",
           ],
         }
        `)
      } else {
        const result = await prerender(
          '/suspense-in-root/runtime/suspense-too-high'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
         "Error: Route "/suspense-in-root/runtime/suspense-too-high": Next.js encountered uncached data during prerendering or a navigation.

         \`fetch(...)\` or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

         Ways to fix this:
           - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
             https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
           - [cache] Cache the data access with \`"use cache"\`
             https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
           - [block] Set \`export const instant = false\` to silence this warning and allow a blocking route
             https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
             at div (<anonymous>)
             at main (<anonymous>)
             at a (<anonymous>)
             at body (<anonymous>)
             at html (<anonymous>)
             at b (<anonymous>)
         Build-time instant validation failed for route "/suspense-in-root/runtime/suspense-too-high".
         To get a more detailed stack trace and pinpoint the issue, try one of the following:
           - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/runtime/suspense-too-high" in your browser to investigate the error.
           - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
         Stopping prerender due to instant validation errors."
        `)
        expect(result.exitCode).toBe(1)
      }
    })
  }
)
