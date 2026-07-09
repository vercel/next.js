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

  it('invalid - runtime prefetch - sync IO after runtime API', async () => {
    if (isNextDev) {
      const browser = await navigateTo(
        '/suspense-in-root/runtime/invalid-sync-io'
      )
      await expect(browser).toDisplayCollapsedRedbox(`
         {
           "code": "E1295",
           "description": "Next.js encountered the unstable value Date.now() while prerendering.",
           "environmentLabel": "Server",
           "label": "Blocking Route",
           "source": "app/suspense-in-root/runtime/invalid-sync-io/page.tsx (8:20) @ Page
         >  8 |   const now = Date.now()
              |                    ^",
           "stack": [
             "Page app/suspense-in-root/runtime/invalid-sync-io/page.tsx (8:20)",
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
         "Error: Route "/suspense-in-root/runtime/invalid-sync-io": Next.js encountered the unstable value \`Date.now()\` while prerendering.

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
             at a (app/suspense-in-root/runtime/invalid-sync-io/page.tsx:8:20)
            6 | export default async function Page() {
            7 |   await cookies()
         >  8 |   const now = Date.now()
              |                    ^
            9 |   return (
           10 |     <main>
           11 |       <p>This page uses sync IO after awaiting cookies(): {now}</p>
         Build-time instant validation failed for route "/suspense-in-root/runtime/invalid-sync-io".
         To get a more detailed stack trace and pinpoint the issue, try one of the following:
           - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/runtime/invalid-sync-io" in your browser to investigate the error.
           - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
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
           "code": "E1295",
           "description": "Next.js encountered the unstable value Date.now() while prerendering.",
           "environmentLabel": "Server",
           "label": "Blocking Route",
           "source": "app/suspense-in-root/runtime/invalid-sync-io-in-runtime-with-valid-static-parent/page.tsx (12:20) @ Page
         > 12 |   const now = Date.now()
              |                    ^",
           "stack": [
             "Page app/suspense-in-root/runtime/invalid-sync-io-in-runtime-with-valid-static-parent/page.tsx (12:20)",
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
         "Error: Route "/suspense-in-root/runtime/invalid-sync-io-in-runtime-with-valid-static-parent": Next.js encountered the unstable value \`Date.now()\` while prerendering.

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
             at a (app/suspense-in-root/runtime/invalid-sync-io-in-runtime-with-valid-static-parent/page.tsx:12:20)
           10 | export default async function Page() {
           11 |   await cookies()
         > 12 |   const now = Date.now()
              |                    ^
           13 |   return (
           14 |     <main>
           15 |       <p>Runtime page with sync IO after cookies: {now}</p>
         Build-time instant validation failed for route "/suspense-in-root/runtime/invalid-sync-io-in-runtime-with-valid-static-parent".
         To get a more detailed stack trace and pinpoint the issue, try one of the following:
           - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/runtime/invalid-sync-io-in-runtime-with-valid-static-parent" in your browser to investigate the error.
           - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
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
           "code": "E1295",
           "description": "Next.js encountered the unstable value Date.now() while prerendering.",
           "environmentLabel": "Server",
           "label": "Blocking Route",
           "source": "app/suspense-in-root/runtime/invalid-sync-io-after-cache-with-cookie-input/page.tsx (28:20) @ Page
         > 28 |   const now = Date.now()
              |                    ^",
           "stack": [
             "Page app/suspense-in-root/runtime/invalid-sync-io-after-cache-with-cookie-input/page.tsx (28:20)",
             "Page <anonymous>",
           ],
         }
        `)
    } else {
      const result = await prerender(
        '/suspense-in-root/runtime/invalid-sync-io-after-cache-with-cookie-input'
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
         "Error: Route "/suspense-in-root/runtime/invalid-sync-io-after-cache-with-cookie-input": Next.js encountered the unstable value \`Date.now()\` while prerendering.

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
             at a (app/suspense-in-root/runtime/invalid-sync-io-after-cache-with-cookie-input/page.tsx:28:20)
           26 |   const cookiePromise = cookies().then((c) => c.get('testCookie')?.value ?? '')
           27 |   await cachedFn(cookiePromise)
         > 28 |   const now = Date.now()
              |                    ^
           29 |   return (
           30 |     <main>
           31 |       <p>Runtime page with sync IO after cache with cookie input: {now}</p>
         To get a more detailed stack trace and pinpoint the issue, try one of the following:
           - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/runtime/invalid-sync-io-after-cache-with-cookie-input" in your browser to investigate the error.
           - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
         Error occurred prerendering page "/suspense-in-root/runtime/invalid-sync-io-after-cache-with-cookie-input". Read more: https://nextjs.org/docs/messages/prerender-error
         Export encountered an error on /suspense-in-root/runtime/invalid-sync-io-after-cache-with-cookie-input/page: /suspense-in-root/runtime/invalid-sync-io-after-cache-with-cookie-input, exiting the build."
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
           "code": "E1295",
           "description": "Next.js encountered the unstable value Date.now() while prerendering.",
           "environmentLabel": "Server",
           "label": "Blocking Route",
           "source": "app/suspense-in-root/runtime/invalid-sync-io-in-generate-metadata/page.tsx (9:20) @ Module.generateMetadata
         >  9 |   const now = Date.now()
              |                    ^",
           "stack": [
             "Module.generateMetadata app/suspense-in-root/runtime/invalid-sync-io-in-generate-metadata/page.tsx (9:20)",
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
         "Error: Route "/suspense-in-root/runtime/invalid-sync-io-in-generate-metadata": Next.js encountered the unstable value \`Date.now()\` while prerendering.

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
             at Module.e [as generateMetadata] (app/suspense-in-root/runtime/invalid-sync-io-in-generate-metadata/page.tsx:9:20)
            7 | export async function generateMetadata() {
            8 |   await cookies()
         >  9 |   const now = Date.now()
              |                    ^
           10 |   return {
           11 |     title: \`Sync IO in metadata: \${now}\`,
           12 |   }
         Build-time instant validation failed for route "/suspense-in-root/runtime/invalid-sync-io-in-generate-metadata".
         To get a more detailed stack trace and pinpoint the issue, try one of the following:
           - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/runtime/invalid-sync-io-in-generate-metadata" in your browser to investigate the error.
           - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
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
           "code": "E1295",
           "description": "Next.js encountered the unstable value Date.now() while prerendering.",
           "environmentLabel": "Server",
           "label": "Blocking Route",
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
         "Error: Route "/suspense-in-root/runtime/invalid-sync-io-in-layout-generate-metadata": Next.js encountered the unstable value \`Date.now()\` while prerendering.

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
             at Module.d [as generateMetadata] (app/suspense-in-root/runtime/invalid-sync-io-in-layout-generate-metadata/layout.tsx:11:20)
            9 | export async function generateMetadata() {
           10 |   await cookies()
         > 11 |   const now = Date.now()
              |                    ^
           12 |   return {
           13 |     title: \`Layout metadata with sync IO: \${now}\`,
           14 |   }
         Build-time instant validation failed for route "/suspense-in-root/runtime/invalid-sync-io-in-layout-generate-metadata".
         To get a more detailed stack trace and pinpoint the issue, try one of the following:
           - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/runtime/invalid-sync-io-in-layout-generate-metadata" in your browser to investigate the error.
           - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
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
