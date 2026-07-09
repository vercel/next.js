import { isNextDev } from 'e2e-utils'
import {
  getRedboxDescription,
  retry,
  waitForNoErrorToast,
} from 'next-test-utils'
import { getPrerenderOutput } from './utils'
import type { CacheComponentsErrorsContext } from './shared.util'

export function registerErrorAttributionTests(
  ctx: CacheComponentsErrorsContext
) {
  const { next, isTurbopack, isDebugPrerender, prerender, skipped } = ctx

  let cliOutputLength: number
  beforeEach(() => {
    cliOutputLength = next.cliOutput.length
  })

  describe('Error Attribution with Sync IO', () => {
    describe('Guarded RSC with guarded Client sync IO', () => {
      const pathname = '/sync-attribution/guarded-async-guarded-clientsync'

      if (skipped) {
        return
      }

      if (isNextDev) {
        it('does not show a validation error in the dev overlay', async () => {
          const browser = await next.browser(pathname)
          await waitForNoErrorToast(browser)
        })
      } else {
        it('should not error the build sync IO is used inside a Suspense Boundary in a client Component and nothing else is dynamic', async () => {
          try {
            await prerender(pathname)
          } catch (error) {
            throw new Error('expected build not to fail', { cause: error })
          }

          expect(next.cliOutput).toContain(`◐ ${pathname}`)
        })
      }
    })

    describe('Guarded RSC with unguarded Client sync IO', () => {
      const pathname = '/sync-attribution/guarded-async-unguarded-clientsync'

      if (skipped) {
        return
      }

      if (isNextDev) {
        it('should show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)

          await expect(browser).toDisplayCollapsedRedbox(`
             {
               "code": "E1287",
               "description": "Next.js encountered the unstable value new Date() in a Client Component.",
               "environmentLabel": "Server",
               "label": "Blocking Route",
               "source": "app/sync-attribution/guarded-async-unguarded-clientsync/client.tsx (5:16) @ SyncIO
             > 5 |   const data = new Date().toISOString()
                 |                ^",
               "stack": [
                 "SyncIO app/sync-attribution/guarded-async-unguarded-clientsync/client.tsx (5:16)",
                 "Page app/sync-attribution/guarded-async-unguarded-clientsync/page.tsx (22:9)",
               ],
             }
            `)
        })
      } else {
        it('should error the build with a reason related to sync IO access', async () => {
          try {
            await prerender(pathname)
          } catch {
            // we expect the build to fail
          }

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          if (isDebugPrerender) {
            if (isTurbopack) {
              expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-attribution/guarded-async-unguarded-clientsync": Next.js encountered the unstable value \`new Date()\` in a Client Component.

                 This value would be evaluated during the prerender, instead of recomputed on each visit.

                 Ways to fix this:
                   - [stream] Wrap the Client Component in \`<Suspense fallback={...}>\`
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#wrap-in-or-move-into-suspense
                   - [defer] Move the read into a \`useEffect\` or event handler
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#move-into-effect-or-event-handler
                   - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#for-telemetry-use-a-timing-api
                     at SyncIO (app/sync-attribution/guarded-async-unguarded-clientsync/client.tsx:5:16)
                     at Page (app/sync-attribution/guarded-async-unguarded-clientsync/page.tsx:22:9)
                   3 | export function SyncIO() {
                   4 |   // This is a sync IO access that should not cause an error
                 > 5 |   const data = new Date().toISOString()
                     |                ^
                   6 |
                   7 |   return (
                   8 |     <main>
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-attribution/guarded-async-unguarded-clientsync" in your browser to investigate the error.
                 Error occurred prerendering page "/sync-attribution/guarded-async-unguarded-clientsync". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on 1 path:
                 	/sync-attribution/guarded-async-unguarded-clientsync/page: /sync-attribution/guarded-async-unguarded-clientsync"
                `)
            } else {
              expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-attribution/guarded-async-unguarded-clientsync": Next.js encountered the unstable value \`new Date()\` in a Client Component.

                 This value would be evaluated during the prerender, instead of recomputed on each visit.

                 Ways to fix this:
                   - [stream] Wrap the Client Component in \`<Suspense fallback={...}>\`
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#wrap-in-or-move-into-suspense
                   - [defer] Move the read into a \`useEffect\` or event handler
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#move-into-effect-or-event-handler
                   - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#for-telemetry-use-a-timing-api
                     at SyncIO (webpack:///app/sync-attribution/guarded-async-unguarded-clientsync/client.tsx:5:16)
                     at Page (webpack:///app/sync-attribution/guarded-async-unguarded-clientsync/page.tsx:22:9)
                   3 | export function SyncIO() {
                   4 |   // This is a sync IO access that should not cause an error
                 > 5 |   const data = new Date().toISOString()
                     |                ^
                   6 |
                   7 |   return (
                   8 |     <main>
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-attribution/guarded-async-unguarded-clientsync" in your browser to investigate the error.
                 Error occurred prerendering page "/sync-attribution/guarded-async-unguarded-clientsync". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on 1 path:
                 	/sync-attribution/guarded-async-unguarded-clientsync/page: /sync-attribution/guarded-async-unguarded-clientsync"
                `)
            }
          } else {
            if (isTurbopack) {
              expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-attribution/guarded-async-unguarded-clientsync": Next.js encountered the unstable value \`new Date()\` in a Client Component.

                 This value would be evaluated during the prerender, instead of recomputed on each visit.

                 Ways to fix this:
                   - [stream] Wrap the Client Component in \`<Suspense fallback={...}>\`
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#wrap-in-or-move-into-suspense
                   - [defer] Move the read into a \`useEffect\` or event handler
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#move-into-effect-or-event-handler
                   - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#for-telemetry-use-a-timing-api
                     at <unknown> (app/sync-attribution/guarded-async-unguarded-clientsync/client.tsx:5:16)
                   3 | export function SyncIO() {
                   4 |   // This is a sync IO access that should not cause an error
                 > 5 |   const data = new Date().toISOString()
                     |                ^
                   6 |
                   7 |   return (
                   8 |     <main>
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/sync-attribution/guarded-async-unguarded-clientsync" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/sync-attribution/guarded-async-unguarded-clientsync". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /sync-attribution/guarded-async-unguarded-clientsync/page: /sync-attribution/guarded-async-unguarded-clientsync, exiting the build."
                `)
            } else {
              expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-attribution/guarded-async-unguarded-clientsync": Next.js encountered the unstable value \`new Date()\` in a Client Component.

                 This value would be evaluated during the prerender, instead of recomputed on each visit.

                 Ways to fix this:
                   - [stream] Wrap the Client Component in \`<Suspense fallback={...}>\`
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#wrap-in-or-move-into-suspense
                   - [defer] Move the read into a \`useEffect\` or event handler
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#move-into-effect-or-event-handler
                   - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#for-telemetry-use-a-timing-api
                     at a (<next-dist-dir>)
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/sync-attribution/guarded-async-unguarded-clientsync" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/sync-attribution/guarded-async-unguarded-clientsync". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /sync-attribution/guarded-async-unguarded-clientsync/page: /sync-attribution/guarded-async-unguarded-clientsync, exiting the build."
                `)
            }
          }
        })
      }
    })

    describe('Unguarded RSC with guarded Client sync IO', () => {
      const pathname = '/sync-attribution/unguarded-async-guarded-clientsync'

      if (skipped) {
        return
      }

      if (isNextDev) {
        it('should show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)

          await expect(browser).toDisplayCollapsedRedbox(`
             {
               "code": "E1400",
               "description": "Next.js encountered runtime data during prerendering.",
               "environmentLabel": "Server",
               "label": "Blocking Route",
               "source": "app/sync-attribution/unguarded-async-guarded-clientsync/page.tsx (34:18) @ RequestData
             > 34 |   ;(await cookies()).get('foo')
                  |                  ^",
               "stack": [
                 "RequestData app/sync-attribution/unguarded-async-guarded-clientsync/page.tsx (34:18)",
                 "Page app/sync-attribution/unguarded-async-guarded-clientsync/page.tsx (27:9)",
               ],
             }
            `)
        })
      } else {
        it('should error the build with a reason related dynamic data', async () => {
          try {
            await prerender(pathname)
          } catch {
            // we expect the build to fail
          }

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          if (isTurbopack) {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-attribution/unguarded-async-guarded-clientsync": Next.js encountered uncached or runtime data during prerendering.

                 \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

                 Ways to fix this:
                   - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                   - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                   - [block] Set \`export const instant = false\` to allow a blocking route
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                     at RequestData (app/sync-attribution/unguarded-async-guarded-clientsync/page.tsx:34:18)
                     at Page (app/sync-attribution/unguarded-async-guarded-clientsync/page.tsx:27:9)
                   32 |
                   33 | async function RequestData() {
                 > 34 |   ;(await cookies()).get('foo')
                      |                  ^
                   35 |   return (
                   36 |     <div>
                   37 |       <h2>Request Data Access</h2>
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-attribution/unguarded-async-guarded-clientsync" in your browser to investigate the error.
                 Error occurred prerendering page "/sync-attribution/unguarded-async-guarded-clientsync". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on 1 path:
                 	/sync-attribution/unguarded-async-guarded-clientsync/page: /sync-attribution/unguarded-async-guarded-clientsync"
                `)
            } else {
              expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-attribution/unguarded-async-guarded-clientsync": Next.js encountered uncached or runtime data during prerendering.

                 \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

                 Ways to fix this:
                   - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                   - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                   - [block] Set \`export const instant = false\` to allow a blocking route
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                     at a (<anonymous>)
                     at main (<anonymous>)
                     at main (<anonymous>)
                     at body (<anonymous>)
                     at html (<anonymous>)
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/sync-attribution/unguarded-async-guarded-clientsync" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/sync-attribution/unguarded-async-guarded-clientsync". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /sync-attribution/unguarded-async-guarded-clientsync/page: /sync-attribution/unguarded-async-guarded-clientsync, exiting the build."
                `)
            }
          } else {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-attribution/unguarded-async-guarded-clientsync": Next.js encountered uncached or runtime data during prerendering.

                 \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

                 Ways to fix this:
                   - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                   - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                   - [block] Set \`export const instant = false\` to allow a blocking route
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                     at RequestData (webpack:///app/sync-attribution/unguarded-async-guarded-clientsync/page.tsx:34:18)
                     at Page (webpack:///app/sync-attribution/unguarded-async-guarded-clientsync/page.tsx:27:9)
                   32 |
                   33 | async function RequestData() {
                 > 34 |   ;(await cookies()).get('foo')
                      |                  ^
                   35 |   return (
                   36 |     <div>
                   37 |       <h2>Request Data Access</h2>
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-attribution/unguarded-async-guarded-clientsync" in your browser to investigate the error.
                 Error occurred prerendering page "/sync-attribution/unguarded-async-guarded-clientsync". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on 1 path:
                 	/sync-attribution/unguarded-async-guarded-clientsync/page: /sync-attribution/unguarded-async-guarded-clientsync"
                `)
            } else {
              // Webpack does not ignore the stack frames that point into
              // Next.js internals, and the resolved frames are flaky in
              // non-debug-prerender mode, so we don't assert on the stack
              // frames here.
              expect(output).toInclude(
                'Error: Route "/sync-attribution/unguarded-async-guarded-clientsync": Next.js encountered uncached or runtime data during prerendering.'
              )
            }
          }
        })
      }
    })

    describe('Unguarded RSC with Client sync IO in a microtask', () => {
      const pathname =
        '/sync-attribution/unguarded-async-client-microtask-syncio'

      if (skipped) {
        return
      }

      if (isNextDev) {
        it('should show request data rather than attribute a microtask sync IO access', async () => {
          const browser = await next.browser(pathname)

          await retry(async () => {
            const redbox = await getRedboxDescription(browser)
            expect(redbox).toContain(
              'Next.js encountered runtime data during prerendering.'
            )
            expect(redbox).not.toContain('new Date()')
          })
        })
      } else {
        it('should error for request data rather than attribute a microtask sync IO access', async () => {
          try {
            await prerender(pathname)
          } catch {
            // we expect the build to fail
          }

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          expect(output).toContain(
            `Error: Route "${pathname}": Next.js encountered uncached or runtime data during prerendering.`
          )
          expect(output).not.toContain(
            'Next.js encountered the unstable value `new Date()` in a Client Component.'
          )
        })
      }
    })

    describe('unguarded RSC with unguarded Client sync IO', () => {
      const pathname = '/sync-attribution/unguarded-async-unguarded-clientsync'

      if (skipped) {
        return
      }

      if (isNextDev) {
        it('should show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)

          await expect(browser).toDisplayCollapsedRedbox(`
             {
               "code": "E1287",
               "description": "Next.js encountered the unstable value new Date() in a Client Component.",
               "environmentLabel": "Server",
               "label": "Blocking Route",
               "source": "app/sync-attribution/unguarded-async-unguarded-clientsync/client.tsx (5:16) @ SyncIO
             > 5 |   const data = new Date().toISOString()
                 |                ^",
               "stack": [
                 "SyncIO app/sync-attribution/unguarded-async-unguarded-clientsync/client.tsx (5:16)",
                 "Page app/sync-attribution/unguarded-async-unguarded-clientsync/page.tsx (22:9)",
               ],
             }
            `)
        })
      } else {
        it('should error the build with a reason related to sync IO access', async () => {
          try {
            await prerender(pathname)
          } catch {
            // we expect the build to fail
          }

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          if (isDebugPrerender) {
            if (isTurbopack) {
              expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-attribution/unguarded-async-unguarded-clientsync": Next.js encountered the unstable value \`new Date()\` in a Client Component.

                 This value would be evaluated during the prerender, instead of recomputed on each visit.

                 Ways to fix this:
                   - [stream] Wrap the Client Component in \`<Suspense fallback={...}>\`
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#wrap-in-or-move-into-suspense
                   - [defer] Move the read into a \`useEffect\` or event handler
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#move-into-effect-or-event-handler
                   - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#for-telemetry-use-a-timing-api
                     at SyncIO (app/sync-attribution/unguarded-async-unguarded-clientsync/client.tsx:5:16)
                     at Page (app/sync-attribution/unguarded-async-unguarded-clientsync/page.tsx:22:9)
                   3 | export function SyncIO() {
                   4 |   // This is a sync IO access that should not cause an error
                 > 5 |   const data = new Date().toISOString()
                     |                ^
                   6 |
                   7 |   return (
                   8 |     <main>
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-attribution/unguarded-async-unguarded-clientsync" in your browser to investigate the error.
                 Error occurred prerendering page "/sync-attribution/unguarded-async-unguarded-clientsync". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on 1 path:
                 	/sync-attribution/unguarded-async-unguarded-clientsync/page: /sync-attribution/unguarded-async-unguarded-clientsync"
                `)
            } else {
              expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-attribution/unguarded-async-unguarded-clientsync": Next.js encountered the unstable value \`new Date()\` in a Client Component.

                 This value would be evaluated during the prerender, instead of recomputed on each visit.

                 Ways to fix this:
                   - [stream] Wrap the Client Component in \`<Suspense fallback={...}>\`
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#wrap-in-or-move-into-suspense
                   - [defer] Move the read into a \`useEffect\` or event handler
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#move-into-effect-or-event-handler
                   - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#for-telemetry-use-a-timing-api
                     at SyncIO (webpack:///app/sync-attribution/unguarded-async-unguarded-clientsync/client.tsx:5:16)
                     at Page (webpack:///app/sync-attribution/unguarded-async-unguarded-clientsync/page.tsx:22:9)
                   3 | export function SyncIO() {
                   4 |   // This is a sync IO access that should not cause an error
                 > 5 |   const data = new Date().toISOString()
                     |                ^
                   6 |
                   7 |   return (
                   8 |     <main>
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/sync-attribution/unguarded-async-unguarded-clientsync" in your browser to investigate the error.
                 Error occurred prerendering page "/sync-attribution/unguarded-async-unguarded-clientsync". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on 1 path:
                 	/sync-attribution/unguarded-async-unguarded-clientsync/page: /sync-attribution/unguarded-async-unguarded-clientsync"
                `)
            }
          } else {
            if (isTurbopack) {
              expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-attribution/unguarded-async-unguarded-clientsync": Next.js encountered the unstable value \`new Date()\` in a Client Component.

                 This value would be evaluated during the prerender, instead of recomputed on each visit.

                 Ways to fix this:
                   - [stream] Wrap the Client Component in \`<Suspense fallback={...}>\`
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#wrap-in-or-move-into-suspense
                   - [defer] Move the read into a \`useEffect\` or event handler
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#move-into-effect-or-event-handler
                   - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#for-telemetry-use-a-timing-api
                     at <unknown> (app/sync-attribution/unguarded-async-unguarded-clientsync/client.tsx:5:16)
                   3 | export function SyncIO() {
                   4 |   // This is a sync IO access that should not cause an error
                 > 5 |   const data = new Date().toISOString()
                     |                ^
                   6 |
                   7 |   return (
                   8 |     <main>
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/sync-attribution/unguarded-async-unguarded-clientsync" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/sync-attribution/unguarded-async-unguarded-clientsync". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /sync-attribution/unguarded-async-unguarded-clientsync/page: /sync-attribution/unguarded-async-unguarded-clientsync, exiting the build."
                `)
            } else {
              expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/sync-attribution/unguarded-async-unguarded-clientsync": Next.js encountered the unstable value \`new Date()\` in a Client Component.

                 This value would be evaluated during the prerender, instead of recomputed on each visit.

                 Ways to fix this:
                   - [stream] Wrap the Client Component in \`<Suspense fallback={...}>\`
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#wrap-in-or-move-into-suspense
                   - [defer] Move the read into a \`useEffect\` or event handler
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#move-into-effect-or-event-handler
                   - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#for-telemetry-use-a-timing-api
                     at a (<next-dist-dir>)
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/sync-attribution/unguarded-async-unguarded-clientsync" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/sync-attribution/unguarded-async-unguarded-clientsync". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /sync-attribution/unguarded-async-unguarded-clientsync/page: /sync-attribution/unguarded-async-unguarded-clientsync, exiting the build."
                `)
            }
          }
        })
      }
    })
  })

  // TODO(restart-on-cache-miss): Figure out how to test this without flakiness
  describe.skip('Unhandled Rejection Suppression', () => {
    const pathname = '/unhandled-rejection'

    if (isNextDev) {
      it('should suppress unhandled rejections during prerender validation in dev', async () => {
        const browser = await next.browser(pathname)

        await expect(browser).toDisplayCollapsedRedbox(`
           [
             {
               "description": "BOOM",
               "environmentLabel": "Prerender",
               "label": "Console Error",
               "source": null,
               "stack": [
                 "Page <anonymous>",
               ],
             },
             {
               "description": "⨯ "unhandledRejection:" "BOOM"",
               "environmentLabel": "Prerender",
               "label": "Console Error",
               "source": null,
               "stack": [
                 "Page <anonymous>",
               ],
             },
             {
               "description": "⨯ "unhandledRejection: " "BOOM"",
               "environmentLabel": "Prerender",
               "label": "Console Error",
               "source": null,
               "stack": [
                 "Page <anonymous>",
               ],
             },
             {
               "description": "BAM",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": null,
               "stack": [
                 "Page <anonymous>",
               ],
             },
             {
               "description": "⨯ "unhandledRejection:" "BAM"",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": null,
               "stack": [
                 "Page <anonymous>",
               ],
             },
             {
               "description": "⨯ "unhandledRejection: " "BAM"",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": null,
               "stack": [
                 "Page <anonymous>",
               ],
             },
           ]
          `)
      })
    } else {
      it('should suppress unhandled rejections after prerender abort', async () => {
        try {
          await prerender(pathname)
        } catch {}

        const output = getPrerenderOutput(
          next.cliOutput.slice(cliOutputLength),
          { isMinified: !isDebugPrerender }
        )

        expect(output).toMatchInlineSnapshot(`
             "BOOM
             BOOM"
            `)
      })
    }
  })
}
