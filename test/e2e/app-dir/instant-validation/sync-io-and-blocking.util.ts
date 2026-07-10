import {
  expectNoBuildValidationErrors,
  extractBuildValidationError,
} from 'e2e-utils/instant-validation'
import { getDeterministicOutput } from '../cache-components-errors/utils'
import { type InstantValidationCaseContext } from './harness.util'

const partialPrefetching = !!process.env.__NEXT_PARTIAL_PREFETCHING

export function registerSyncIoAndBlockingTests(
  ctx: InstantValidationCaseContext
) {
  const { isNextDev, navigateTo, expectNoDevValidationErrors, prerender } = ctx

  describe('Sync IO', () => {
    it('sync IO after session data', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/sync-io/sync-io-after-cookies'
        )
        if (partialPrefetching) {
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "code": "E1295",
             "description": "Next.js encountered the unstable value Date.now() while prerendering.",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/suspense-in-root/sync-io/sync-io-after-cookies/page.tsx (29:15) @ SyncIOAfterCookies
           > 29 |   return Date.now()
                |               ^",
             "stack": [
               "SyncIOAfterCookies app/suspense-in-root/sync-io/sync-io-after-cookies/page.tsx (29:15)",
               "Page app/suspense-in-root/sync-io/sync-io-after-cookies/page.tsx (12:11)",
             ],
           }
          `)
        } else {
          await expectNoDevValidationErrors(browser, await browser.url())
        }
      } else {
        const result = await prerender(
          '/suspense-in-root/sync-io/sync-io-after-cookies'
        )
        if (partialPrefetching) {
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/sync-io/sync-io-after-cookies": Next.js encountered the unstable value \`Date.now()\` while prerendering.

           This value can change between renders, so it must be either prerendered or computed later.

           Ways to fix this:
             - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
               https://nextjs.org/docs/messages/blocking-prerender-current-time#generate-on-every-request
             - [cache] Prerender and cache the value with \`"use cache"\`
               https://nextjs.org/docs/messages/blocking-prerender-current-time#cache-the-timestamp
             - [client] Render the value on the client with \`"use client"\`
               https://nextjs.org/docs/messages/blocking-prerender-current-time#render-on-the-client
             - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
               https://nextjs.org/docs/messages/blocking-prerender-current-time#for-telemetry-use-a-timing-api
               at a (app/suspense-in-root/sync-io/sync-io-after-cookies/page.tsx:29:15)
             27 | async function SyncIOAfterCookies() {
             28 |   await cookies()
           > 29 |   return Date.now()
                |               ^
             30 | }
             31 |
           Build-time instant validation failed for route "/suspense-in-root/sync-io/sync-io-after-cookies".
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/sync-io/sync-io-after-cookies" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        } else {
          expectNoBuildValidationErrors(result)
        }
      }
    })

    it('sync IO after cache with session data input', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/sync-io/sync-io-after-cache-with-cookie-input'
        )
        if (partialPrefetching) {
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "code": "E1295",
             "description": "Next.js encountered the unstable value Date.now() while prerendering.",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/suspense-in-root/sync-io/sync-io-after-cache-with-cookie-input/page.tsx (49:15) @ SyncIOAfterCache
           > 49 |   return Date.now()
                |               ^",
             "stack": [
               "SyncIOAfterCache app/suspense-in-root/sync-io/sync-io-after-cache-with-cookie-input/page.tsx (49:15)",
               "Page app/suspense-in-root/sync-io/sync-io-after-cache-with-cookie-input/page.tsx (31:11)",
             ],
           }
          `)
        } else {
          await expectNoDevValidationErrors(browser, await browser.url())
        }
      } else {
        const result = await prerender(
          '/suspense-in-root/sync-io/sync-io-after-cache-with-cookie-input'
        )
        // TODO: This currently fails with the static-prerender sync-IO error on
        // Date.now(), not the instant-validation sync-IO error described above.
        // The cookies() promise hangs during the static shell, but the cache
        // body doesn't read it, so the cache resolves with 'cached result'
        // regardless and Date.now() runs before instant validation gets a
        // chance. When we add staged rendering to static prerendering too,
        // cookies should resolve at the runtime stage and the cache call should
        // defer until its args serialize, so the cache function (and the
        // Date.now() that follows) lands in the runtime stage.
        expect(
          getDeterministicOutput(result.cliOutput, {
            isMinified: true,
            startingLineMatch: 'Collecting page data',
          })
        ).toMatchInlineSnapshot(`
         "Error: Route "/suspense-in-root/sync-io/sync-io-after-cache-with-cookie-input": Next.js encountered the unstable value \`Date.now()\` while prerendering.

         This value can change between renders, so it must be either prerendered or computed later.

         Ways to fix this:
           - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
             https://nextjs.org/docs/messages/blocking-prerender-current-time#generate-on-every-request
           - [cache] Prerender and cache the value with \`"use cache"\`
             https://nextjs.org/docs/messages/blocking-prerender-current-time#cache-the-timestamp
           - [client] Render the value on the client with \`"use client"\`
             https://nextjs.org/docs/messages/blocking-prerender-current-time#render-on-the-client
           - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
             https://nextjs.org/docs/messages/blocking-prerender-current-time#for-telemetry-use-a-timing-api
             at a (app/suspense-in-root/sync-io/sync-io-after-cache-with-cookie-input/page.tsx:49:15)
           47 |   const cookiePromise = cookies().then((c) => c.get('testCookie')?.value ?? '')
           48 |   await cachedFn(cookiePromise)
         > 49 |   return Date.now()
              |               ^
           50 | }
           51 |
         To get a more detailed stack trace and pinpoint the issue, try one of the following:
           - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/sync-io/sync-io-after-cache-with-cookie-input" in your browser to investigate the error.
           - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
         Error occurred prerendering page "/suspense-in-root/sync-io/sync-io-after-cache-with-cookie-input". Read more: https://nextjs.org/docs/messages/prerender-error
         Export encountered an error on /suspense-in-root/sync-io/sync-io-after-cache-with-cookie-input/page: /suspense-in-root/sync-io/sync-io-after-cache-with-cookie-input, exiting the build."
        `)
        expect(result.exitCode).toBe(1)
      }
    })

    it('sync IO in generateMetadata', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/sync-io/sync-io-after-cookies-in-generate-metadata'
        )
        if (partialPrefetching) {
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "code": "E1295",
             "description": "Next.js encountered the unstable value Date.now() while prerendering.",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/suspense-in-root/sync-io/sync-io-after-cookies-in-generate-metadata/page.tsx (8:20) @ Module.generateMetadata
           >  8 |   const now = Date.now()
                |                    ^",
             "stack": [
               "Module.generateMetadata app/suspense-in-root/sync-io/sync-io-after-cookies-in-generate-metadata/page.tsx (8:20)",
               "Next.MetadataOutlet <anonymous>",
             ],
           }
          `)
        } else {
          await expectNoDevValidationErrors(browser, await browser.url())
        }
      } else {
        const result = await prerender(
          '/suspense-in-root/sync-io/sync-io-after-cookies-in-generate-metadata'
        )
        if (partialPrefetching) {
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/sync-io/sync-io-after-cookies-in-generate-metadata": Next.js encountered the unstable value \`Date.now()\` while prerendering.

           This value can change between renders, so it must be either prerendered or computed later.

           Ways to fix this:
             - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call
               https://nextjs.org/docs/messages/blocking-prerender-current-time#generate-on-every-request
             - [cache] Prerender and cache the value with \`"use cache"\`
               https://nextjs.org/docs/messages/blocking-prerender-current-time#cache-the-timestamp
             - [client] Render the value on the client with \`"use client"\`
               https://nextjs.org/docs/messages/blocking-prerender-current-time#render-on-the-client
             - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
               https://nextjs.org/docs/messages/blocking-prerender-current-time#for-telemetry-use-a-timing-api
               at Module.e [as generateMetadata] (app/suspense-in-root/sync-io/sync-io-after-cookies-in-generate-metadata/page.tsx:8:20)
              6 | export async function generateMetadata() {
              7 |   await cookies()
           >  8 |   const now = Date.now()
                |                    ^
              9 |   return {
             10 |     title: \`Sync IO in metadata: \${now}\`,
             11 |   }
           Build-time instant validation failed for route "/suspense-in-root/sync-io/sync-io-after-cookies-in-generate-metadata".
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/sync-io/sync-io-after-cookies-in-generate-metadata" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        } else {
          expectNoBuildValidationErrors(result)
        }
      }
    })

    it('valid - sync IO after io()', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/sync-io/sync-io-after-io'
        )
        await expectNoDevValidationErrors(browser, await browser.url())
      } else {
        const result = await prerender(
          '/suspense-in-root/sync-io/sync-io-after-io'
        )
        expectNoBuildValidationErrors(result)
      }
    })
  })

  describe('blocking', () => {
    it('valid - blocking layout with instant = false is allowed to block', async () => {
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
        if (partialPrefetching) {
          // This page uses a runtime shell, so it can use cookies
          // TODO(app-shells): missing "allow-runtime"
          await expectNoDevValidationErrors(browser, await browser.url())
        } else {
          await expect(browser).toDisplayCollapsedRedbox(`
             {
               "cause": [
                 {
                   "label": "Caused by: Instant Validation",
                   "source": "app/suspense-in-root/static/blocking-layout/missing-suspense-around-dynamic/page.tsx (3:24) @ instant
             > 3 | export const instant = { level: 'experimental-error' }
                 |                        ^",
                   "stack": [
                     "instant app/suspense-in-root/static/blocking-layout/missing-suspense-around-dynamic/page.tsx (3:24)",
                     "Set.forEach <anonymous>",
                   ],
                 },
               ],
               "code": "E1402",
               "description": "Next.js encountered runtime data during a navigation.",
               "environmentLabel": "Server",
               "label": "Instant",
               "source": "app/suspense-in-root/static/blocking-layout/missing-suspense-around-dynamic/page.tsx (6:16) @ Page
             > 6 |   await cookies()
                 |                ^",
               "stack": [
                 "Page app/suspense-in-root/static/blocking-layout/missing-suspense-around-dynamic/page.tsx (6:16)",
               ],
             }
            `)
        }
      } else {
        const result = await prerender(
          '/suspense-in-root/static/blocking-layout/missing-suspense-around-dynamic'
        )
        if (partialPrefetching) {
          // This page uses a runtime shell, so it can use cookies
          // TODO(app-shells): missing "allow-runtime"
          expectNoBuildValidationErrors(result)
        } else {
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
             "Error: Route "/suspense-in-root/static/blocking-layout/missing-suspense-around-dynamic": Next.js encountered runtime data during prerendering or a navigation.

             \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

             Ways to fix this:
               - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                 https://nextjs.org/docs/messages/blocking-prerender-runtime#wrap-in-or-move-into-suspense
               - [block] Set \`export const instant = false\` to allow a blocking route
                 https://nextjs.org/docs/messages/blocking-prerender-runtime#allow-blocking-route
                 at body (<anonymous>)
                 at html (<anonymous>)
                 at a (<anonymous>)
             Build-time instant validation failed for route "/suspense-in-root/static/blocking-layout/missing-suspense-around-dynamic".
             To get a more detailed stack trace and pinpoint the issue, try one of the following:
               - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/blocking-layout/missing-suspense-around-dynamic" in your browser to investigate the error.
               - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
             Stopping prerender due to instant validation errors."
            `)
          expect(result.exitCode).toBe(1)
        }
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
        if (partialPrefetching) {
          // This page uses a runtime shell, so it can use cookies
          // TODO(app-shells): missing "allow-runtime"
          await expectNoDevValidationErrors(browser, await browser.url())
        } else {
          await expect(browser).toDisplayCollapsedRedbox(`
             {
               "cause": [
                 {
                   "label": "Caused by: Instant Validation",
                   "source": "app/suspense-in-root/static/invalid-blocking-inside-static/layout.tsx (1:24) @ instant
             > 1 | export const instant = { level: 'experimental-error' }
                 |                        ^",
                   "stack": [
                     "instant app/suspense-in-root/static/invalid-blocking-inside-static/layout.tsx (1:24)",
                     "Set.forEach <anonymous>",
                   ],
                 },
               ],
               "code": "E1402",
               "description": "Next.js encountered runtime data during a navigation.",
               "environmentLabel": "Server",
               "label": "Instant",
               "source": "app/suspense-in-root/static/invalid-blocking-inside-static/page.tsx (6:16) @ BlockingPage
             > 6 |   await cookies()
                 |                ^",
               "stack": [
                 "BlockingPage app/suspense-in-root/static/invalid-blocking-inside-static/page.tsx (6:16)",
               ],
             }
            `)
        }
      } else {
        const result = await prerender(
          '/suspense-in-root/static/invalid-blocking-inside-static'
        )
        if (partialPrefetching) {
          // This page uses a runtime shell, so it can use cookies
          // TODO(app-shells): missing "allow-runtime"
          expectNoBuildValidationErrors(result)
        } else {
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
             "Error: Route "/suspense-in-root/static/invalid-blocking-inside-static": Next.js encountered runtime data during prerendering or a navigation.

             \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

             Ways to fix this:
               - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                 https://nextjs.org/docs/messages/blocking-prerender-runtime#wrap-in-or-move-into-suspense
               - [block] Set \`export const instant = false\` to allow a blocking route
                 https://nextjs.org/docs/messages/blocking-prerender-runtime#allow-blocking-route
                 at div (<anonymous>)
                 at body (<anonymous>)
                 at html (<anonymous>)
                 at a (<anonymous>)
             Build-time instant validation failed for route "/suspense-in-root/static/invalid-blocking-inside-static".
             To get a more detailed stack trace and pinpoint the issue, try one of the following:
               - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/invalid-blocking-inside-static" in your browser to investigate the error.
               - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
             Stopping prerender due to instant validation errors."
            `)
          expect(result.exitCode).toBe(1)
        }
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
                 "source": "app/suspense-in-root/runtime/invalid-blocking-inside-runtime/layout.tsx (3:24) @ instant
           > 3 | export const instant = { level: 'experimental-error' }
               |                        ^",
                 "stack": [
                   "instant app/suspense-in-root/runtime/invalid-blocking-inside-runtime/layout.tsx (3:24)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1398",
             "description": "Next.js encountered uncached data during a navigation.",
             "environmentLabel": "Server",
             "label": "Instant",
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
           "Error: Route "/suspense-in-root/runtime/invalid-blocking-inside-runtime": Next.js encountered uncached data during prerendering or a navigation.

           \`fetch(...)\` or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

           Ways to fix this:
             - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
               https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
             - [cache] Cache the data access with \`"use cache"\` (does not apply to \`connection()\`)
               https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
             - [block] Set \`export const instant = false\` to allow a blocking route
               https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
               at div (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
           Build-time instant validation failed for route "/suspense-in-root/runtime/invalid-blocking-inside-runtime".
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/runtime/invalid-blocking-inside-runtime" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
           Stopping prerender due to instant validation errors."
          `)
        expect(result.exitCode).toBe(1)
      }
    })
  })
}
