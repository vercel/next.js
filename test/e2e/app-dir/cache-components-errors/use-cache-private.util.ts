import { isNextDev } from 'e2e-utils'
import { getPrerenderOutput } from './utils'
import type { CacheComponentsErrorsContext } from './shared.util'

export function registerUseCachePrivateTests(
  ctx: CacheComponentsErrorsContext
) {
  const { next, isTurbopack, isDebugPrerender, prerender } = ctx

  let cliOutputLength: number
  beforeEach(() => {
    cliOutputLength = next.cliOutput.length
  })

  describe('With `use cache: private`', () => {
    describe('in `unstable_cache`', () => {
      if (isNextDev) {
        it('should show a redbox error', async () => {
          const browser = await next.browser(
            '/use-cache-private-in-unstable-cache'
          )

          if (isTurbopack) {
            await expect(browser).toDisplayRedbox(`
               {
                 "code": "E1016",
                 "description": ""use cache: private" must not be used within \`unstable_cache()\`.",
                 "environmentLabel": "Server",
                 "label": "Runtime Error",
                 "source": "app/use-cache-private-in-unstable-cache/page.tsx (21:38) @ <anonymous>
               > 21 | const getCachedData = unstable_cache(async () => {
                    |                                      ^",
                 "stack": [
                   "<anonymous> app/use-cache-private-in-unstable-cache/page.tsx (21:38)",
                   "ComponentWithCachedData app/use-cache-private-in-unstable-cache/page.tsx (16:16)",
                 ],
               }
              `)
          } else {
            await expect(browser).toDisplayRedbox(`
               {
                 "code": "E1016",
                 "description": ""use cache: private" must not be used within \`unstable_cache()\`.",
                 "environmentLabel": "Server",
                 "label": "Runtime Error",
                 "source": "app/use-cache-private-in-unstable-cache/page.tsx (21:38) @ eval
               > 21 | const getCachedData = unstable_cache(async () => {
                    |                                      ^",
                 "stack": [
                   "eval app/use-cache-private-in-unstable-cache/page.tsx (21:38)",
                   "ComponentWithCachedData app/use-cache-private-in-unstable-cache/page.tsx (16:16)",
                 ],
               }
              `)
          }
        })
      } else {
        it('should error the build', async () => {
          try {
            await prerender('/use-cache-private-in-unstable-cache')
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
                 "Error: "use cache: private" must not be used within \`unstable_cache()\`.
                     at <unknown> (app/use-cache-private-in-unstable-cache/page.tsx:21:38)
                     at async ComponentWithCachedData (app/use-cache-private-in-unstable-cache/page.tsx:16:16)
                   19 | }
                   20 |
                 > 21 | const getCachedData = unstable_cache(async () => {
                      |                                      ^
                   22 |   'use cache: private'
                   23 |
                   24 |   return fetch('https://next-data-api-endpoint.vercel.app/api/random').then(
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-private-in-unstable-cache" in your browser to investigate the error.
                 Error occurred prerendering page "/use-cache-private-in-unstable-cache". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on 1 path:
                 	/use-cache-private-in-unstable-cache/page: /use-cache-private-in-unstable-cache"
                `)
            } else {
              expect(output).toMatchInlineSnapshot(`
                 "Error: "use cache: private" must not be used within \`unstable_cache()\`.
                     at <unknown> (webpack:///app/use-cache-private-in-unstable-cache/page.tsx:21:38)
                     at async ComponentWithCachedData (webpack:///app/use-cache-private-in-unstable-cache/page.tsx:16:16)
                   19 | }
                   20 |
                 > 21 | const getCachedData = unstable_cache(async () => {
                      |                                      ^
                   22 |   'use cache: private'
                   23 |
                   24 |   return fetch('https://next-data-api-endpoint.vercel.app/api/random').then(
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-private-in-unstable-cache" in your browser to investigate the error.
                 Error occurred prerendering page "/use-cache-private-in-unstable-cache". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on 1 path:
                 	/use-cache-private-in-unstable-cache/page: /use-cache-private-in-unstable-cache"
                `)
            }
          } else {
            if (isTurbopack) {
              expect(output).toMatchInlineSnapshot(`
                 "Error: "use cache: private" must not be used within \`unstable_cache()\`.
                     at <unknown> (app/use-cache-private-in-unstable-cache/page.tsx:21:38)
                     at async g (app/use-cache-private-in-unstable-cache/page.tsx:16:16)
                   19 | }
                   20 |
                 > 21 | const getCachedData = unstable_cache(async () => {
                      |                                      ^
                   22 |   'use cache: private'
                   23 |
                   24 |   return fetch('https://next-data-api-endpoint.vercel.app/api/random').then(
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/use-cache-private-in-unstable-cache" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/use-cache-private-in-unstable-cache". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /use-cache-private-in-unstable-cache/page: /use-cache-private-in-unstable-cache, exiting the build."
                `)
            } else {
              expect(output).toMatchInlineSnapshot(`
                 "Error: "use cache: private" must not be used within \`unstable_cache()\`.
                     at a (<next-dist-dir>)
                     at b (<next-dist-dir>)
                     at c (<next-dist-dir>)
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/use-cache-private-in-unstable-cache" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/use-cache-private-in-unstable-cache". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /use-cache-private-in-unstable-cache/page: /use-cache-private-in-unstable-cache, exiting the build."
                `)
            }
          }
        })
      }
    })

    describe('in `use cache`', () => {
      if (isNextDev) {
        it('should show a redbox error', async () => {
          const browser = await next.browser('/use-cache-private-in-use-cache')

          await expect(browser).toDisplayRedbox(`
             {
               "code": "E1001",
               "description": ""use cache: private" must not be used within "use cache". It can only be nested inside of another "use cache: private".",
               "environmentLabel": "Cache",
               "label": "Runtime Error",
               "source": "app/use-cache-private-in-use-cache/page.tsx (15:1) @ Private
             > 15 | async function Private() {
                  | ^",
               "stack": [
                 "Private app/use-cache-private-in-use-cache/page.tsx (15:1)",
               ],
             }
            `)
        })
      } else {
        it('should error the build', async () => {
          try {
            await prerender('/use-cache-private-in-use-cache')
          } catch {
            // we expect the build to fail
          }

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          // TODO: Ideally, the error should only be shown once.
          if (isDebugPrerender) {
            if (isTurbopack) {
              expect(output).toMatchInlineSnapshot(`
                 "Error: "use cache: private" must not be used within "use cache". It can only be nested inside of another "use cache: private".
                     at Private (app/use-cache-private-in-use-cache/page.tsx:15:1)
                   13 | }
                   14 |
                 > 15 | async function Private() {
                      | ^
                   16 |   'use cache: private'
                   17 |
                   18 |   return <p>Private</p> {
                   digest: '<error-digest>'
                 }
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-private-in-use-cache" in your browser to investigate the error.
                 Error occurred prerendering page "/use-cache-private-in-use-cache". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on 1 path:
                 	/use-cache-private-in-use-cache/page: /use-cache-private-in-use-cache"
                `)
            } else
              expect(output).toMatchInlineSnapshot(`
                 "Error: "use cache: private" must not be used within "use cache". It can only be nested inside of another "use cache: private".
                     at Private (webpack:///app/use-cache-private-in-use-cache/page.tsx:15:1)
                   13 | }
                   14 |
                 > 15 | async function Private() {
                      | ^
                   16 |   'use cache: private'
                   17 |
                   18 |   return <p>Private</p> {
                   digest: '<error-digest>'
                 }
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-private-in-use-cache" in your browser to investigate the error.
                 Error occurred prerendering page "/use-cache-private-in-use-cache". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on 1 path:
                 	/use-cache-private-in-use-cache/page: /use-cache-private-in-use-cache"
                `)
          } else {
            if (isTurbopack) {
              expect(output).toMatchInlineSnapshot(`
                 "⨯ Error: "use cache: private" must not be used within "use cache". It can only be nested inside of another "use cache: private".
                     at <unknown> (app/use-cache-private-in-use-cache/page.tsx:15:1)
                   13 | }
                   14 |
                 > 15 | async function Private() {
                      | ^
                   16 |   'use cache: private'
                   17 |
                   18 |   return <p>Private</p> {
                   digest: '<error-digest>'
                 }
                 Error: "use cache: private" must not be used within "use cache". It can only be nested inside of another "use cache: private".
                     at <unknown> (app/use-cache-private-in-use-cache/page.tsx:15:1)
                   13 | }
                   14 |
                 > 15 | async function Private() {
                      | ^
                   16 |   'use cache: private'
                   17 |
                   18 |   return <p>Private</p> {
                   digest: '<error-digest>'
                 }
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/use-cache-private-in-use-cache" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/use-cache-private-in-use-cache". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /use-cache-private-in-use-cache/page: /use-cache-private-in-use-cache, exiting the build."
                `)
            } else {
              expect(output).toMatchInlineSnapshot(`
                 "⨯ Error: "use cache: private" must not be used within "use cache". It can only be nested inside of another "use cache: private".
                     at a (<next-dist-dir>) {
                   digest: '<error-digest>'
                 }
                 Error: "use cache: private" must not be used within "use cache". It can only be nested inside of another "use cache: private".
                     at b (<next-dist-dir>) {
                   digest: '<error-digest>'
                 }
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/use-cache-private-in-use-cache" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/use-cache-private-in-use-cache". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /use-cache-private-in-use-cache/page: /use-cache-private-in-use-cache, exiting the build."
                `)
            }
          }
        })
      }
    })

    describe('without Suspense', () => {
      if (isNextDev) {
        it('should show a redbox error', async () => {
          const browser = await next.browser(
            '/use-cache-private-without-suspense'
          )

          await expect(browser).toDisplayCollapsedRedbox(`
             {
               "code": "E1400",
               "description": "Next.js encountered runtime data during prerendering.",
               "environmentLabel": "Server",
               "label": "Blocking Route",
               "source": "app/use-cache-private-without-suspense/page.tsx (15:1) @ Private
             > 15 | async function Private() {
                  | ^",
               "stack": [
                 "Private app/use-cache-private-without-suspense/page.tsx (15:1)",
                 "Page app/use-cache-private-without-suspense/page.tsx (10:7)",
               ],
             }
            `)
        })
      } else {
        it('should error the build', async () => {
          try {
            await prerender('/use-cache-private-without-suspense')
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
                 "Error: Route "/use-cache-private-without-suspense": Next.js encountered uncached or runtime data during prerendering.

                 \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

                 Ways to fix this:
                   - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                   - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                   - [block] Set \`export const instant = false\` to allow a blocking route
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                     at Private (app/use-cache-private-without-suspense/page.tsx:15:1)
                     at Page (app/use-cache-private-without-suspense/page.tsx:10:7)
                   13 | }
                   14 |
                 > 15 | async function Private() {
                      | ^
                   16 |   'use cache: private'
                   17 |
                   18 |   return <p>Private</p>
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/use-cache-private-without-suspense" in your browser to investigate the error.
                 Error occurred prerendering page "/use-cache-private-without-suspense". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on 1 path:
                 	/use-cache-private-without-suspense/page: /use-cache-private-without-suspense"
                `)
            } else {
              expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/use-cache-private-without-suspense": Next.js encountered uncached or runtime data during prerendering.

                 \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

                 Ways to fix this:
                   - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                   - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                   - [block] Set \`export const instant = false\` to allow a blocking route
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                     at main (<anonymous>)
                     at body (<anonymous>)
                     at html (<anonymous>)
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/use-cache-private-without-suspense" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/use-cache-private-without-suspense". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /use-cache-private-without-suspense/page: /use-cache-private-without-suspense, exiting the build."
                `)
            }
          } else {
            if (isDebugPrerender) {
              // Webpack does not ignore the stack frame that points into
              // Next.js internals, and is also flaky on resolving the exact
              // location, so we don't assert on the stack frames here.
              expect(output).toInclude(
                `Error: Route "/use-cache-private-without-suspense": Next.js encountered uncached or runtime data during prerendering.

\`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

Ways to fix this:
  - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
  - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
  - [block] Set \`export const instant = false\` to allow a blocking route
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route`
              )
            } else {
              expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/use-cache-private-without-suspense": Next.js encountered uncached or runtime data during prerendering.

                 \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

                 Ways to fix this:
                   - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                   - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                   - [block] Set \`export const instant = false\` to allow a blocking route
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                     at a (<next-dist-dir>)
                     at b (<next-dist-dir>)
                     at c (<next-dist-dir>)
                     at d (<next-dist-dir>)
                     at e (<next-dist-dir>)
                     at f (<next-dist-dir>)
                     at g (<next-dist-dir>)
                     at h (<next-dist-dir>)
                     at i (<next-dist-dir>)
                     at j (<next-dist-dir>)
                     at main (<anonymous>)
                     at body (<anonymous>)
                     at html (<anonymous>)
                     at k (<next-dist-dir>)
                     at l (<next-dist-dir>)
                     at m (<next-dist-dir>)
                     at n (<next-dist-dir>)
                     at o (<next-dist-dir>)
                     at p (<next-dist-dir>)
                     at q (<next-dist-dir>)
                     at r (<next-dist-dir>)
                     at s (<next-dist-dir>)
                     at t (<next-dist-dir>)
                     at u (<next-dist-dir>)
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/use-cache-private-without-suspense" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/use-cache-private-without-suspense". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /use-cache-private-without-suspense/page: /use-cache-private-without-suspense, exiting the build."
                `)
            }
          }
        })
      }
    })

    describe('with `connection()`', () => {
      if (isNextDev) {
        // TODO(restart-on-cache-miss): This error is written to `workStore.invalidDynamicUsageError`.
        // There's currently a race on whether these show up as
        // - a runtime error (thrown from `renderToHTMLOrFlightImpl`, after the RSC render)
        // - a console error (from inside `spawnDynamicValidationInDev`)
        // - nothing (if the error happens after SSR starts and after the prospective validation render finishes)
        // Ideally, these would always be a runtime error, but some recent timing changes break it.
        it.skip('should show a redbox error', async () => {
          const browser = await next.browser('/use-cache-private-connection')

          await expect(browser).toDisplayCollapsedRedbox(`
               {
                 "description": "Route /use-cache-private-connection used \`connection()\` inside "use cache: private". The \`connection()\` function is used to indicate the subsequent code must only run when there is an actual navigation request, but caches must be able to be produced before a navigation request, so this function is not allowed in this scope. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache",
                 "environmentLabel": null,
                 "label": "Runtime Error",
                 "source": "app/use-cache-private-connection/page.tsx (25:21) @ Private
               > 25 |     await connection()
                    |                     ^",
                 "stack": [
                   "Private app/use-cache-private-connection/page.tsx (25:21)",
                 ],
               }
              `)
        })
      } else {
        // TODO: With prefetch sentinels this should yield a build error.
        it('should not fail the build and show no runtime error (caught in userland)', async () => {
          await prerender('/use-cache-private-connection')
          await next.start({ skipBuild: true })

          const browser = await next.browser('/use-cache-private-connection', {
            pushErrorAsConsoleLog: true,
          })

          expect(await browser.elementById('private').text()).toBe('Private')

          expect(await browser.log()).not.toContainEqual(
            expect.objectContaining({ source: 'error' })
          )

          expect(next.cliOutput.slice(cliOutputLength)).not.toInclude('Error')
        })
      }
    })
  })
}
