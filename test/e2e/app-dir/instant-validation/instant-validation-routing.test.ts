import { describeInstantValidationTests } from './instant-validation-test-utils'

describeInstantValidationTests(
  ({
    isNextDev,
    navigateTo,
    expectNoDevValidationErrors,
    prerender,
    expectNoBuildValidationErrors,
    expectBuildValidationSkipped,
    extractBuildValidationError,
  }) => {
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
                 "source": "app/suspense-in-root/head/invalid-runtime-viewport-in-static/page.tsx (8:24) @ instant
           >  8 | export const instant = { level: 'experimental-error' }
                |                        ^",
                 "stack": [
                   "instant app/suspense-in-root/head/invalid-runtime-viewport-in-static/page.tsx (8:24)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1293",
             "description": "Next.js encountered runtime data in generateViewport().",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/suspense-in-root/head/invalid-runtime-viewport-in-static/page.tsx (11:16) @ Module.generateViewport
           > 11 |   await cookies()
                |                ^",
             "stack": [
               "Module.generateViewport app/suspense-in-root/head/invalid-runtime-viewport-in-static/page.tsx (11:16)",
             ],
           }
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/head/invalid-runtime-viewport-in-static'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/head/invalid-runtime-viewport-in-static": Next.js encountered runtime data in \`generateViewport()\`.

           \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` in \`generateViewport()\` prevents the page from being prerendered, leading to a slower user experience.

           Ways to fix this:
             - [static] Use a static viewport export instead of \`generateViewport()\`
               https://nextjs.org/docs/messages/blocking-prerender-viewport-runtime#use-static-viewport
             - [block] Set \`export const instant = false\` to silence this warning and allow a blocking route
               https://nextjs.org/docs/messages/blocking-prerender-viewport-runtime#allow-blocking-route
               at ignore-listed frames
           Build-time instant validation failed for route "/suspense-in-root/head/invalid-runtime-viewport-in-static".
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/head/invalid-runtime-viewport-in-static" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
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
                 "source": "app/suspense-in-root/head/invalid-dynamic-viewport-in-runtime/page.tsx (6:24) @ instant
           > 6 | export const instant = { level: 'experimental-error' }
               |                        ^",
                 "stack": [
                   "instant app/suspense-in-root/head/invalid-dynamic-viewport-in-runtime/page.tsx (6:24)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1352",
             "description": "Next.js encountered uncached data in generateViewport().",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/suspense-in-root/head/invalid-dynamic-viewport-in-runtime/page.tsx (11:19) @ Module.generateViewport
           > 11 |   await connection()
                |                   ^",
             "stack": [
               "Module.generateViewport app/suspense-in-root/head/invalid-dynamic-viewport-in-runtime/page.tsx (11:19)",
             ],
           }
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/head/invalid-dynamic-viewport-in-runtime'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/head/invalid-dynamic-viewport-in-runtime": Next.js encountered uncached data in \`generateViewport()\`.

           \`fetch(...)\` or \`connection()\` in \`generateViewport()\` prevents the page from being prerendered, leading to a slower user experience.

           Ways to fix this:
             - [cache] Cache the viewport data with \`"use cache"\` in \`generateViewport()\`
               https://nextjs.org/docs/messages/blocking-prerender-viewport-dynamic#cache-the-viewport-data
             - [block] Set \`export const instant = false\` to silence this warning and allow a blocking route
               https://nextjs.org/docs/messages/blocking-prerender-viewport-dynamic#allow-blocking-route
               at ignore-listed frames
           Build-time instant validation failed for route "/suspense-in-root/head/invalid-dynamic-viewport-in-runtime".
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/head/invalid-dynamic-viewport-in-runtime" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
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
          // assertion on the parent layout, it should still fail.
          const browser = await navigateTo(
            '/suspense-in-root/head/invalid-dynamic-viewport-in-blocking-inside-static'
          )
          // TODO(instant-validation): why aren't we pointing to `await connection()` here?
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/head/invalid-dynamic-viewport-in-blocking-inside-static/layout.tsx (3:24) @ instant
           > 3 | export const instant = { level: 'experimental-error' }
               |                        ^",
                 "stack": [
                   "instant app/suspense-in-root/head/invalid-dynamic-viewport-in-blocking-inside-static/layout.tsx (3:24)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1352",
             "description": "Next.js encountered uncached data in generateViewport().",
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
           "Error: Route "/suspense-in-root/head/invalid-dynamic-viewport-in-blocking-inside-static": Next.js encountered uncached data in \`generateViewport()\`.

           \`fetch(...)\` or \`connection()\` in \`generateViewport()\` prevents the page from being prerendered, leading to a slower user experience.

           Ways to fix this:
             - [cache] Cache the viewport data with \`"use cache"\` in \`generateViewport()\`
               https://nextjs.org/docs/messages/blocking-prerender-viewport-dynamic#cache-the-viewport-data
             - [block] Set \`export const instant = false\` to silence this warning and allow a blocking route
               https://nextjs.org/docs/messages/blocking-prerender-viewport-dynamic#allow-blocking-route
               at ignore-listed frames
           Build-time instant validation failed for route "/suspense-in-root/head/invalid-dynamic-viewport-in-blocking-inside-static".
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/head/invalid-dynamic-viewport-in-blocking-inside-static" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
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
                 "source": "app/suspense-in-root/static/route-group-config-only/(group)/layout.tsx (3:24) @ instant
           > 3 | export const instant = { level: 'experimental-error' }
               |                        ^",
                 "stack": [
                   "instant app/suspense-in-root/static/route-group-config-only/(group)/layout.tsx (3:24)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1319",
             "description": "Next.js encountered runtime data during a navigation.",
             "environmentLabel": "Server",
             "label": "Instant",
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
           "Error: Route "/suspense-in-root/static/route-group-config-only": Next.js encountered runtime data during prerendering or a navigation.

           \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

           Ways to fix this:
             - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
               https://nextjs.org/docs/messages/blocking-prerender-runtime#wrap-in-or-move-into-suspense
             - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
               https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
             - [block] Set \`export const instant = false\` to silence this warning and allow a blocking route
               https://nextjs.org/docs/messages/blocking-prerender-runtime#allow-blocking-route
               at div (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
           Build-time instant validation failed for route "/suspense-in-root/static/route-group-config-only".
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/route-group-config-only" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
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
                 "source": "app/suspense-in-root/static/route-group-config-and-segment-config/(group)/layout.tsx (3:24) @ instant
           > 3 | export const instant = { level: 'experimental-error' }
               |                        ^",
                 "stack": [
                   "instant app/suspense-in-root/static/route-group-config-and-segment-config/(group)/layout.tsx (3:24)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1319",
             "description": "Next.js encountered runtime data during a navigation.",
             "environmentLabel": "Server",
             "label": "Instant",
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
           "Error: Route "/suspense-in-root/static/route-group-config-and-segment-config": Next.js encountered runtime data during prerendering or a navigation.

           \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

           Ways to fix this:
             - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
               https://nextjs.org/docs/messages/blocking-prerender-runtime#wrap-in-or-move-into-suspense
             - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
               https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
             - [block] Set \`export const instant = false\` to silence this warning and allow a blocking route
               https://nextjs.org/docs/messages/blocking-prerender-runtime#allow-blocking-route
               at div (<anonymous>)
               at div (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
           Build-time instant validation failed for route "/suspense-in-root/static/route-group-config-and-segment-config".
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/route-group-config-and-segment-config" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
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
                 "source": "app/suspense-in-root/static/route-group-segment-config-only/layout.tsx (3:24) @ instant
           > 3 | export const instant = { level: 'experimental-error' }
               |                        ^",
                 "stack": [
                   "instant app/suspense-in-root/static/route-group-segment-config-only/layout.tsx (3:24)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1319",
             "description": "Next.js encountered runtime data during a navigation.",
             "environmentLabel": "Server",
             "label": "Instant",
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
           "Error: Route "/suspense-in-root/static/route-group-segment-config-only": Next.js encountered runtime data during prerendering or a navigation.

           \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

           Ways to fix this:
             - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
               https://nextjs.org/docs/messages/blocking-prerender-runtime#wrap-in-or-move-into-suspense
             - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
               https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
             - [block] Set \`export const instant = false\` to silence this warning and allow a blocking route
               https://nextjs.org/docs/messages/blocking-prerender-runtime#allow-blocking-route
               at div (<anonymous>)
               at div (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
           Build-time instant validation failed for route "/suspense-in-root/static/route-group-segment-config-only".
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/route-group-segment-config-only" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
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
                 "source": "app/suspense-in-root/static/route-group-config-with-deeper-segment/(group)/layout.tsx (3:24) @ instant
           > 3 | export const instant = { level: 'experimental-error' }
               |                        ^",
                 "stack": [
                   "instant app/suspense-in-root/static/route-group-config-with-deeper-segment/(group)/layout.tsx (3:24)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1319",
             "description": "Next.js encountered runtime data during a navigation.",
             "environmentLabel": "Server",
             "label": "Instant",
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
           "Error: Route "/suspense-in-root/static/route-group-config-with-deeper-segment/inner": Next.js encountered runtime data during prerendering or a navigation.

           \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

           Ways to fix this:
             - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
               https://nextjs.org/docs/messages/blocking-prerender-runtime#wrap-in-or-move-into-suspense
             - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
               https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
             - [block] Set \`export const instant = false\` to silence this warning and allow a blocking route
               https://nextjs.org/docs/messages/blocking-prerender-runtime#allow-blocking-route
               at div (<anonymous>)
               at div (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
           Build-time instant validation failed for route "/suspense-in-root/static/route-group-config-with-deeper-segment/inner".
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/route-group-config-with-deeper-segment/inner" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
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
                 "source": "app/suspense-in-root/static/route-group-deeper-segment-config/(group)/inner/layout.tsx (3:24) @ instant
           > 3 | export const instant = { level: 'experimental-error' }
               |                        ^",
                 "stack": [
                   "instant app/suspense-in-root/static/route-group-deeper-segment-config/(group)/inner/layout.tsx (3:24)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1319",
             "description": "Next.js encountered runtime data during a navigation.",
             "environmentLabel": "Server",
             "label": "Instant",
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
           "Error: Route "/suspense-in-root/static/route-group-deeper-segment-config/inner": Next.js encountered runtime data during prerendering or a navigation.

           \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

           Ways to fix this:
             - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
               https://nextjs.org/docs/messages/blocking-prerender-runtime#wrap-in-or-move-into-suspense
             - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
               https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
             - [block] Set \`export const instant = false\` to silence this warning and allow a blocking route
               https://nextjs.org/docs/messages/blocking-prerender-runtime#allow-blocking-route
               at div (<anonymous>)
               at div (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
           Build-time instant validation failed for route "/suspense-in-root/static/route-group-deeper-segment-config/inner".
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/route-group-deeper-segment-config/inner" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
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
                 "source": "app/suspense-in-root/static/route-group-shared-boundary/(outer)/(inner)/page.tsx (6:24) @ instant
           > 6 | export const instant = { level: 'experimental-error' }
               |                        ^",
                 "stack": [
                   "instant app/suspense-in-root/static/route-group-shared-boundary/(outer)/(inner)/page.tsx (6:24)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1319",
             "description": "Next.js encountered runtime data during a navigation.",
             "environmentLabel": "Server",
             "label": "Instant",
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
           "Error: Route "/suspense-in-root/static/route-group-shared-boundary": Next.js encountered runtime data during prerendering or a navigation.

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
               at body (<anonymous>)
               at html (<anonymous>)
               at b (<anonymous>)
           Build-time instant validation failed for route "/suspense-in-root/static/route-group-shared-boundary".
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/route-group-shared-boundary" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
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
                 "source": "app/suspense-in-root/static/parallel-group-depths-deep-slot-hole/@slot/(g1)/(g2)/(g3)/page.tsx (1:24) @ instant
           > 1 | export const instant = { level: 'experimental-error' }
               |                        ^",
                 "stack": [
                   "instant app/suspense-in-root/static/parallel-group-depths-deep-slot-hole/@slot/(g1)/(g2)/(g3)/page.tsx (1:24)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1319",
             "description": "Next.js encountered runtime data during a navigation.",
             "environmentLabel": "Server",
             "label": "Instant",
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
           "Error: Route "/suspense-in-root/static/parallel-group-depths-deep-slot-hole": Next.js encountered runtime data during prerendering or a navigation.

           \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

           Ways to fix this:
             - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
               https://nextjs.org/docs/messages/blocking-prerender-runtime#wrap-in-or-move-into-suspense
             - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
               https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
             - [block] Set \`export const instant = false\` to silence this warning and allow a blocking route
               https://nextjs.org/docs/messages/blocking-prerender-runtime#allow-blocking-route
               at div (<anonymous>)
               at div (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
           Build-time instant validation failed for route "/suspense-in-root/static/parallel-group-depths-deep-slot-hole".
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/parallel-group-depths-deep-slot-hole" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
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
                 "source": "app/suspense-in-root/static/parallel-group-depths-shallow-slot-hole/(b1)/(b2)/page.tsx (1:24) @ instant
           > 1 | export const instant = { level: 'experimental-error' }
               |                        ^",
                 "stack": [
                   "instant app/suspense-in-root/static/parallel-group-depths-shallow-slot-hole/(b1)/(b2)/page.tsx (1:24)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1319",
             "description": "Next.js encountered runtime data during a navigation.",
             "environmentLabel": "Server",
             "label": "Instant",
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
           "Error: Route "/suspense-in-root/static/parallel-group-depths-shallow-slot-hole": Next.js encountered runtime data during prerendering or a navigation.

           \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

           Ways to fix this:
             - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
               https://nextjs.org/docs/messages/blocking-prerender-runtime#wrap-in-or-move-into-suspense
             - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
               https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
             - [block] Set \`export const instant = false\` to silence this warning and allow a blocking route
               https://nextjs.org/docs/messages/blocking-prerender-runtime#allow-blocking-route
               at div (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
           Build-time instant validation failed for route "/suspense-in-root/static/parallel-group-depths-shallow-slot-hole".
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/parallel-group-depths-shallow-slot-hole" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
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
               "source": "app/suspense-in-root/runtime/static-layout-above-runtime-config/inner/layout.tsx (6:24) @ instant
         > 6 | export const instant = { level: 'experimental-error' }
             |                        ^",
               "stack": [
                 "instant app/suspense-in-root/runtime/static-layout-above-runtime-config/inner/layout.tsx (6:24)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
           "code": "E1319",
           "description": "Next.js encountered runtime data during a navigation.",
           "environmentLabel": "Server",
           "label": "Instant",
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
         "Error: Route "/suspense-in-root/runtime/static-layout-above-runtime-config/inner": Next.js encountered runtime data during prerendering or a navigation.

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
         Build-time instant validation failed for route "/suspense-in-root/runtime/static-layout-above-runtime-config/inner".
         To get a more detailed stack trace and pinpoint the issue, try one of the following:
           - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/runtime/static-layout-above-runtime-config/inner" in your browser to investigate the error.
           - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
         Stopping prerender due to instant validation errors."
        `)
        expect(result.exitCode).toBe(1)
      }
    })
  }
)
