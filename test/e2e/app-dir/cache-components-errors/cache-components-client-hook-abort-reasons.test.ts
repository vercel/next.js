import { isNextDev, nextTestSetup } from 'e2e-utils'
import { getPrerenderOutput } from './utils'

describe('Cache Components Errors - Client Hook Abort Reasons', () => {
  const { next, isTurbopack, isNextStart, skipped } = nextTestSetup({
    files: __dirname + '/fixtures/client-hook-abort-reasons',
    skipStart: !isNextDev,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  let cliOutputLength: number

  beforeEach(async () => {
    cliOutputLength = next.cliOutput.length
  })

  afterEach(async () => {
    if (isNextStart) {
      await next.stop()
    }
  })

  const testCases: { isDebugPrerender: boolean; name: string }[] = []

  if (isNextDev) {
    testCases.push({ isDebugPrerender: false, name: 'Dev' })
  } else {
    const prerenderMode = process.env.NEXT_TEST_DEBUG_PRERENDER

    if (!prerenderMode || prerenderMode === 'true') {
      testCases.push({
        isDebugPrerender: true,
        name: 'Build With --debug-prerender',
      })
    }

    if (!prerenderMode || prerenderMode === 'false') {
      testCases.push({
        isDebugPrerender: false,
        name: 'Build Without --debug-prerender',
      })
    }
  }

  describe.each(testCases)('$name', ({ isDebugPrerender }) => {
    beforeAll(async () => {
      if (isNextStart) {
        const args = ['--experimental-build-mode', 'compile']

        if (isDebugPrerender) {
          args.push('--debug-prerender')
        }

        await next.build({ args })
      }
    })

    const prerender = async (pathname: string) => {
      const args = [
        '--experimental-build-mode',
        'generate',
        '--debug-build-paths',
        `app${pathname}/page.tsx`,
      ]

      if (isDebugPrerender) {
        args.push('--debug-prerender')
      }

      await next.build({ args })
    }

    const getFocusedPrerenderOutput = async (pathname: string) => {
      try {
        await prerender(pathname)
      } catch {
        // we expect the build to fail
      }

      return getPrerenderOutput(next.cliOutput.slice(cliOutputLength), {
        isMinified: !isDebugPrerender,
      })
    }

    describe('focused client hook abort reasons', () => {
      describe('normal aborting', () => {
        if (isNextDev) {
          it('should report useSearchParams after the data slot', async () => {
            const browser = await next.browser(
              '/client-hook-abort-reasons/normal/use-search-params/some-id'
            )

            await expect(browser).toDisplayCollapsedRedbox(`
             [
               {
                 "code": "E1316",
                 "description": "Next.js encountered URL data useSearchParams() in a Client Component outside of Suspense.",
                 "environmentLabel": "Server",
                 "label": "Blocking Route",
                 "source": "app/client-hook-abort-reasons/client.tsx (27:18) @ UseSearchParams
             > 27 |   useSearchParams()
                  |                  ^",
                 "stack": [
                   "UseSearchParams app/client-hook-abort-reasons/client.tsx (27:18)",
                   "Page app/client-hook-abort-reasons/normal/use-search-params/[id]/page.tsx (8:7)",
                 ],
               },
               {
                 "code": "E1318",
                 "description": "Next.js encountered uncached data during prerendering.",
                 "environmentLabel": "Server",
                 "label": "Blocking Route",
                 "source": "app/client-hook-abort-reasons/data.tsx (2:9) @ DataSlot
             > 2 |   await new Promise((resolve) => setTimeout(resolve, 0))
                 |         ^",
                 "stack": [
                   "DataSlot app/client-hook-abort-reasons/data.tsx (2:9)",
                   "Page app/client-hook-abort-reasons/normal/use-search-params/[id]/page.tsx (7:7)",
                 ],
               },
             ]
            `)
          })

          it('should report usePathname before the data slot', async () => {
            const browser = await next.browser(
              '/client-hook-abort-reasons/normal/use-pathname/some-id'
            )

            await expect(browser).toDisplayCollapsedRedbox(`
             [
               {
                 "code": "E1315",
                 "description": "Next.js encountered URL data usePathname() in a Client Component outside of Suspense.",
                 "environmentLabel": "Server",
                 "label": "Blocking Route",
                 "source": "app/client-hook-abort-reasons/client.tsx (22:14) @ UsePathname
             > 22 |   usePathname()
                  |              ^",
                 "stack": [
                   "UsePathname app/client-hook-abort-reasons/client.tsx (22:14)",
                   "Page app/client-hook-abort-reasons/normal/use-pathname/[id]/page.tsx (7:7)",
                 ],
               },
               {
                 "code": "E1318",
                 "description": "Next.js encountered uncached data during prerendering.",
                 "environmentLabel": "Server",
                 "label": "Blocking Route",
                 "source": "app/client-hook-abort-reasons/data.tsx (2:9) @ DataSlot
             > 2 |   await new Promise((resolve) => setTimeout(resolve, 0))
                 |         ^",
                 "stack": [
                   "DataSlot app/client-hook-abort-reasons/data.tsx (2:9)",
                   "Page app/client-hook-abort-reasons/normal/use-pathname/[id]/page.tsx (8:7)",
                 ],
               },
             ]
            `)
          })

          it('should report useParams after the data slot', async () => {
            const browser = await next.browser(
              '/client-hook-abort-reasons/normal/use-params/some-id'
            )

            await expect(browser).toDisplayCollapsedRedbox(`
             [
               {
                 "code": "E1315",
                 "description": "Next.js encountered URL data useParams() in a Client Component outside of Suspense.",
                 "environmentLabel": "Server",
                 "label": "Blocking Route",
                 "source": "app/client-hook-abort-reasons/client.tsx (17:12) @ UseParams
             > 17 |   useParams()
                  |            ^",
                 "stack": [
                   "UseParams app/client-hook-abort-reasons/client.tsx (17:12)",
                   "Page app/client-hook-abort-reasons/normal/use-params/[id]/page.tsx (8:7)",
                 ],
               },
               {
                 "code": "E1318",
                 "description": "Next.js encountered uncached data during prerendering.",
                 "environmentLabel": "Server",
                 "label": "Blocking Route",
                 "source": "app/client-hook-abort-reasons/data.tsx (2:9) @ DataSlot
             > 2 |   await new Promise((resolve) => setTimeout(resolve, 0))
                 |         ^",
                 "stack": [
                   "DataSlot app/client-hook-abort-reasons/data.tsx (2:9)",
                   "Page app/client-hook-abort-reasons/normal/use-params/[id]/page.tsx (7:7)",
                 ],
               },
             ]
            `)
          })

          it('should report useSelectedLayoutSegments before the data slot', async () => {
            const browser = await next.browser(
              '/client-hook-abort-reasons/normal/use-selected-layout-segments/some-id'
            )

            await expect(browser).toDisplayCollapsedRedbox(`
             [
               {
                 "code": "E1315",
                 "description": "Next.js encountered URL data useSelectedLayoutSegments() in a Client Component outside of Suspense.",
                 "environmentLabel": "Server",
                 "label": "Blocking Route",
                 "source": "app/client-hook-abort-reasons/client.tsx (37:28) @ UseSelectedLayoutSegments
             > 37 |   useSelectedLayoutSegments()
                  |                            ^",
                 "stack": [
                   "UseSelectedLayoutSegments app/client-hook-abort-reasons/client.tsx (37:28)",
                   "Page app/client-hook-abort-reasons/normal/use-selected-layout-segments/[id]/page.tsx (7:7)",
                 ],
               },
               {
                 "code": "E1318",
                 "description": "Next.js encountered uncached data during prerendering.",
                 "environmentLabel": "Server",
                 "label": "Blocking Route",
                 "source": "app/client-hook-abort-reasons/data.tsx (2:9) @ DataSlot
             > 2 |   await new Promise((resolve) => setTimeout(resolve, 0))
                 |         ^",
                 "stack": [
                   "DataSlot app/client-hook-abort-reasons/data.tsx (2:9)",
                   "Page app/client-hook-abort-reasons/normal/use-selected-layout-segments/[id]/page.tsx (8:7)",
                 ],
               },
             ]
            `)
          })

          it('should report useSelectedLayoutSegment after the data slot', async () => {
            const browser = await next.browser(
              '/client-hook-abort-reasons/normal/use-selected-layout-segment/some-id'
            )

            await expect(browser).toDisplayCollapsedRedbox(`
             [
               {
                 "code": "E1315",
                 "description": "Next.js encountered URL data useSelectedLayoutSegment() in a Client Component outside of Suspense.",
                 "environmentLabel": "Server",
                 "label": "Blocking Route",
                 "source": "app/client-hook-abort-reasons/client.tsx (32:27) @ UseSelectedLayoutSegment
             > 32 |   useSelectedLayoutSegment()
                  |                           ^",
                 "stack": [
                   "UseSelectedLayoutSegment app/client-hook-abort-reasons/client.tsx (32:27)",
                   "Page app/client-hook-abort-reasons/normal/use-selected-layout-segment/[id]/page.tsx (8:7)",
                 ],
               },
               {
                 "code": "E1318",
                 "description": "Next.js encountered uncached data during prerendering.",
                 "environmentLabel": "Server",
                 "label": "Blocking Route",
                 "source": "app/client-hook-abort-reasons/data.tsx (2:9) @ DataSlot
             > 2 |   await new Promise((resolve) => setTimeout(resolve, 0))
                 |         ^",
                 "stack": [
                   "DataSlot app/client-hook-abort-reasons/data.tsx (2:9)",
                   "Page app/client-hook-abort-reasons/normal/use-selected-layout-segment/[id]/page.tsx (7:7)",
                 ],
               },
             ]
            `)
          })
        } else {
          // TODO(veil): Webpack's source map loader drops `ignoreList`, so the
          // debug-prerender snapshots include Next.js internals and select the
          // internal `React.use()` frame for the codeframe instead of the user
          // hook callsite. Filter those framework frames before selecting the
          // codeframe.
          it('should capture useSearchParams after the data slot', async () => {
            const output = await getFocusedPrerenderOutput(
              '/client-hook-abort-reasons/normal/use-search-params/[id]'
            )

            if (!isTurbopack) {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/client-hook-abort-reasons/normal/use-search-params/[id]": Next.js encountered uncached or runtime data during prerendering.

                 \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

                 Ways to fix this:
                   - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                   - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\`
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                   - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
                     https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
                   - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                     at DataSlot (webpack:///app/client-hook-abort-reasons/data.tsx:1:23)
                     at Page (webpack:///app/client-hook-abort-reasons/normal/use-search-params/[id]/page.tsx:7:7)
                 > 1 | export async function DataSlot() {
                     |                       ^
                   2 |   await new Promise((resolve) => setTimeout(resolve, 0))
                   3 |   return <p>data slot</p>
                   4 | }
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-search-params/[id]" in your browser to investigate the error.
                 Error: Route "/client-hook-abort-reasons/normal/use-search-params/[id]": Next.js encountered URL data \`useSearchParams()\` in a Client Component outside of \`<Suspense>\`.

                 This blocks prerendering because the value is only available at runtime.

                 Ways to fix this:
                   - [stream] Wrap the component in \`<Suspense fallback={...}>\` so the hook value streams in after prerendering
                     https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense
                   - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                     https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route
                     at useDynamicSearchParams (webpack:///<next-src>)
                     at useSearchParams (webpack:///<next-src>)
                     at UseSearchParams (webpack:///app/client-hook-abort-reasons/client.tsx:27:18)
                     at Page (webpack:///app/client-hook-abort-reasons/normal/use-search-params/[id]/page.tsx:8:7)
                   708 |       return
                   709 |     case 'prerender-client': {
                 > 710 |       React.use(
                       |             ^
                   711 |         makeClientHookHangingPromise(
                   712 |           workUnitStore.renderSignal,
                   713 |           new ClientHookDynamicError(workStore.route, expression) {
                   digest: 'CLIENT_HOOK_DYNAMIC'
                 }
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-search-params/[id]" in your browser to investigate the error.
                 Error occurred prerendering page "/client-hook-abort-reasons/normal/use-search-params/[id]". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on 1 path:
                 	/client-hook-abort-reasons/normal/use-search-params/[id]/page: /client-hook-abort-reasons/normal/use-search-params/[id]"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/client-hook-abort-reasons/normal/use-search-params/[id]": Next.js encountered URL data \`useSearchParams()\` in a Client Component outside of \`<Suspense>\`.

                 This blocks prerendering because the value is only available at runtime.

                 Ways to fix this:
                   - [stream] Wrap the component in \`<Suspense fallback={...}>\` so the hook value streams in after prerendering
                     https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense
                   - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                     https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route
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
                     at v (<next-dist-dir>)
                     at w (<next-dist-dir>)
                     at x (<next-dist-dir>)
                     at y (<next-dist-dir>)
                     at z (<next-dist-dir>)
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
                     at v (<next-dist-dir>)
                     at w (<next-dist-dir>)
                     at x (<next-dist-dir>)
                     at y (<next-dist-dir>)
                     at z (<next-dist-dir>)
                     at body (<anonymous>)
                     at html (<anonymous>) {
                   digest: 'CLIENT_HOOK_DYNAMIC'
                 }
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-search-params/[id]" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error: Route "/client-hook-abort-reasons/normal/use-search-params/[id]": Next.js encountered uncached or runtime data during prerendering.

                 \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

                 Ways to fix this:
                   - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                   - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\`
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                   - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
                     https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
                   - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
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
                     at v (<next-dist-dir>)
                     at w (<next-dist-dir>)
                     at x (<next-dist-dir>)
                     at y (<next-dist-dir>)
                     at z (<next-dist-dir>)
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
                     at v (<next-dist-dir>)
                     at w (<next-dist-dir>)
                     at x (<next-dist-dir>)
                     at y (<next-dist-dir>)
                     at body (<anonymous>)
                     at html (<anonymous>)
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-search-params/[id]" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/client-hook-abort-reasons/normal/use-search-params/[id]". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /client-hook-abort-reasons/normal/use-search-params/[id]/page: /client-hook-abort-reasons/normal/use-search-params/[id], exiting the build."
                `)
              }
              return
            }

            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/client-hook-abort-reasons/normal/use-search-params/[id]": Next.js encountered uncached or runtime data during prerendering.

               \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

               Ways to fix this:
                 - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                 - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                 - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
                   https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
                 - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                   at DataSlot (app/client-hook-abort-reasons/data.tsx:1:23)
                   at Page (app/client-hook-abort-reasons/normal/use-search-params/[id]/page.tsx:7:7)
               > 1 | export async function DataSlot() {
                   |                       ^
                 2 |   await new Promise((resolve) => setTimeout(resolve, 0))
                 3 |   return <p>data slot</p>
                 4 | }
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-search-params/[id]" in your browser to investigate the error.
               Error: Route "/client-hook-abort-reasons/normal/use-search-params/[id]": Next.js encountered URL data \`useSearchParams()\` in a Client Component outside of \`<Suspense>\`.

               This blocks prerendering because the value is only available at runtime.

               Ways to fix this:
                 - [stream] Wrap the component in \`<Suspense fallback={...}>\` so the hook value streams in after prerendering
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense
                 - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route
                   at UseSearchParams (app/client-hook-abort-reasons/client.tsx:27:18)
                   at Page (app/client-hook-abort-reasons/normal/use-search-params/[id]/page.tsx:8:7)
                 25 |
                 26 | export function UseSearchParams() {
               > 27 |   useSearchParams()
                    |                  ^
                 28 |   return <p>hook slot: useSearchParams</p>
                 29 | }
                 30 | {
                 digest: 'CLIENT_HOOK_DYNAMIC'
               }
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-search-params/[id]" in your browser to investigate the error.
               Error occurred prerendering page "/client-hook-abort-reasons/normal/use-search-params/[id]". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/client-hook-abort-reasons/normal/use-search-params/[id]/page: /client-hook-abort-reasons/normal/use-search-params/[id]"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/client-hook-abort-reasons/normal/use-search-params/[id]": Next.js encountered URL data \`useSearchParams()\` in a Client Component outside of \`<Suspense>\`.

               This blocks prerendering because the value is only available at runtime.

               Ways to fix this:
                 - [stream] Wrap the component in \`<Suspense fallback={...}>\` so the hook value streams in after prerendering
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense
                 - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route
                   at <unknown> (app/client-hook-abort-reasons/client.tsx:27:3)
                   at body (<anonymous>)
                   at html (<anonymous>)
                 25 |
                 26 | export function UseSearchParams() {
               > 27 |   useSearchParams()
                    |   ^
                 28 |   return <p>hook slot: useSearchParams</p>
                 29 | }
                 30 | {
                 digest: 'CLIENT_HOOK_DYNAMIC'
               }
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-search-params/[id]" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error: Route "/client-hook-abort-reasons/normal/use-search-params/[id]": Next.js encountered uncached or runtime data during prerendering.

               \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

               Ways to fix this:
                 - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                 - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                 - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
                   https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
                 - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                   at body (<anonymous>)
                   at html (<anonymous>)
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-search-params/[id]" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/client-hook-abort-reasons/normal/use-search-params/[id]". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /client-hook-abort-reasons/normal/use-search-params/[id]/page: /client-hook-abort-reasons/normal/use-search-params/[id], exiting the build."
              `)
            }
          })

          it('should capture usePathname before the data slot', async () => {
            const output = await getFocusedPrerenderOutput(
              '/client-hook-abort-reasons/normal/use-pathname/[id]'
            )

            if (!isTurbopack) {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/client-hook-abort-reasons/normal/use-pathname/[id]": Next.js encountered uncached or runtime data during prerendering.

                 \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

                 Ways to fix this:
                   - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                   - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\`
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                   - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
                     https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
                   - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                     at DataSlot (webpack:///app/client-hook-abort-reasons/data.tsx:1:23)
                     at Page (webpack:///app/client-hook-abort-reasons/normal/use-pathname/[id]/page.tsx:8:7)
                 > 1 | export async function DataSlot() {
                     |                       ^
                   2 |   await new Promise((resolve) => setTimeout(resolve, 0))
                   3 |   return <p>data slot</p>
                   4 | }
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-pathname/[id]" in your browser to investigate the error.
                 Error: Route "/client-hook-abort-reasons/normal/use-pathname/[id]": Next.js encountered URL data \`usePathname()\` in a Client Component outside of \`<Suspense>\`.

                 This blocks prerendering because the value is only available at runtime.

                 Ways to fix this:
                   - [stream] Wrap the component in \`<Suspense fallback={...}>\` so the hook value streams in after prerendering
                     https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense
                   - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                     https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route
                     at useDynamicRouteParams (webpack:///<next-src>)
                     at usePathname (webpack:///<next-src>)
                     at UsePathname (webpack:///app/client-hook-abort-reasons/client.tsx:22:14)
                     at Page (webpack:///app/client-hook-abort-reasons/normal/use-pathname/[id]/page.tsx:7:7)
                   637 |           // hang here and never resolve. This will cause the currently
                   638 |           // rendering component to effectively be a dynamic hole.
                 > 639 |           React.use(
                       |                 ^
                   640 |             makeClientHookHangingPromise(
                   641 |               workUnitStore.renderSignal,
                   642 |               new ParamClientHookDynamicError(workStore.route, expression) {
                   digest: 'CLIENT_HOOK_DYNAMIC'
                 }
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-pathname/[id]" in your browser to investigate the error.
                 Error occurred prerendering page "/client-hook-abort-reasons/normal/use-pathname/[id]". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on 1 path:
                 	/client-hook-abort-reasons/normal/use-pathname/[id]/page: /client-hook-abort-reasons/normal/use-pathname/[id]"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/client-hook-abort-reasons/normal/use-pathname/[id]": Next.js encountered URL data \`usePathname()\` in a Client Component outside of \`<Suspense>\`.

                 This blocks prerendering because the value is only available at runtime.

                 Ways to fix this:
                   - [stream] Wrap the component in \`<Suspense fallback={...}>\` so the hook value streams in after prerendering
                     https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense
                   - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                     https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route
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
                     at v (<next-dist-dir>)
                     at w (<next-dist-dir>)
                     at x (<next-dist-dir>)
                     at y (<next-dist-dir>)
                     at z (<next-dist-dir>)
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
                     at v (<next-dist-dir>)
                     at w (<next-dist-dir>)
                     at x (<next-dist-dir>)
                     at y (<next-dist-dir>)
                     at z (<next-dist-dir>)
                     at body (<anonymous>)
                     at html (<anonymous>) {
                   digest: 'CLIENT_HOOK_DYNAMIC'
                 }
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-pathname/[id]" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error: Route "/client-hook-abort-reasons/normal/use-pathname/[id]": Next.js encountered uncached or runtime data during prerendering.

                 \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

                 Ways to fix this:
                   - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                   - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\`
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                   - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
                     https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
                   - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
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
                     at v (<next-dist-dir>)
                     at w (<next-dist-dir>)
                     at x (<next-dist-dir>)
                     at y (<next-dist-dir>)
                     at z (<next-dist-dir>)
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
                     at v (<next-dist-dir>)
                     at w (<next-dist-dir>)
                     at x (<next-dist-dir>)
                     at y (<next-dist-dir>)
                     at body (<anonymous>)
                     at html (<anonymous>)
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-pathname/[id]" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/client-hook-abort-reasons/normal/use-pathname/[id]". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /client-hook-abort-reasons/normal/use-pathname/[id]/page: /client-hook-abort-reasons/normal/use-pathname/[id], exiting the build."
                `)
              }
              return
            }

            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/client-hook-abort-reasons/normal/use-pathname/[id]": Next.js encountered uncached or runtime data during prerendering.

               \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

               Ways to fix this:
                 - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                 - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                 - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
                   https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
                 - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                   at DataSlot (app/client-hook-abort-reasons/data.tsx:1:23)
                   at Page (app/client-hook-abort-reasons/normal/use-pathname/[id]/page.tsx:8:7)
               > 1 | export async function DataSlot() {
                   |                       ^
                 2 |   await new Promise((resolve) => setTimeout(resolve, 0))
                 3 |   return <p>data slot</p>
                 4 | }
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-pathname/[id]" in your browser to investigate the error.
               Error: Route "/client-hook-abort-reasons/normal/use-pathname/[id]": Next.js encountered URL data \`usePathname()\` in a Client Component outside of \`<Suspense>\`.

               This blocks prerendering because the value is only available at runtime.

               Ways to fix this:
                 - [stream] Wrap the component in \`<Suspense fallback={...}>\` so the hook value streams in after prerendering
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense
                 - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route
                   at UsePathname (app/client-hook-abort-reasons/client.tsx:22:14)
                   at Page (app/client-hook-abort-reasons/normal/use-pathname/[id]/page.tsx:7:7)
                 20 |
                 21 | export function UsePathname() {
               > 22 |   usePathname()
                    |              ^
                 23 |   return <p>hook slot: usePathname</p>
                 24 | }
                 25 | {
                 digest: 'CLIENT_HOOK_DYNAMIC'
               }
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-pathname/[id]" in your browser to investigate the error.
               Error occurred prerendering page "/client-hook-abort-reasons/normal/use-pathname/[id]". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/client-hook-abort-reasons/normal/use-pathname/[id]/page: /client-hook-abort-reasons/normal/use-pathname/[id]"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/client-hook-abort-reasons/normal/use-pathname/[id]": Next.js encountered URL data \`usePathname()\` in a Client Component outside of \`<Suspense>\`.

               This blocks prerendering because the value is only available at runtime.

               Ways to fix this:
                 - [stream] Wrap the component in \`<Suspense fallback={...}>\` so the hook value streams in after prerendering
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense
                 - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route
                   at <unknown> (app/client-hook-abort-reasons/client.tsx:22:3)
                   at body (<anonymous>)
                   at html (<anonymous>)
                 20 |
                 21 | export function UsePathname() {
               > 22 |   usePathname()
                    |   ^
                 23 |   return <p>hook slot: usePathname</p>
                 24 | }
                 25 | {
                 digest: 'CLIENT_HOOK_DYNAMIC'
               }
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-pathname/[id]" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error: Route "/client-hook-abort-reasons/normal/use-pathname/[id]": Next.js encountered uncached or runtime data during prerendering.

               \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

               Ways to fix this:
                 - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                 - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                 - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
                   https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
                 - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                   at body (<anonymous>)
                   at html (<anonymous>)
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-pathname/[id]" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/client-hook-abort-reasons/normal/use-pathname/[id]". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /client-hook-abort-reasons/normal/use-pathname/[id]/page: /client-hook-abort-reasons/normal/use-pathname/[id], exiting the build."
              `)
            }
          })

          it('should capture useParams after the data slot', async () => {
            const output = await getFocusedPrerenderOutput(
              '/client-hook-abort-reasons/normal/use-params/[id]'
            )

            if (!isTurbopack) {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/client-hook-abort-reasons/normal/use-params/[id]": Next.js encountered uncached or runtime data during prerendering.

                 \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

                 Ways to fix this:
                   - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                   - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\`
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                   - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
                     https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
                   - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                     at DataSlot (webpack:///app/client-hook-abort-reasons/data.tsx:1:23)
                     at Page (webpack:///app/client-hook-abort-reasons/normal/use-params/[id]/page.tsx:7:7)
                 > 1 | export async function DataSlot() {
                     |                       ^
                   2 |   await new Promise((resolve) => setTimeout(resolve, 0))
                   3 |   return <p>data slot</p>
                   4 | }
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-params/[id]" in your browser to investigate the error.
                 Error: Route "/client-hook-abort-reasons/normal/use-params/[id]": Next.js encountered URL data \`useParams()\` in a Client Component outside of \`<Suspense>\`.

                 This blocks prerendering because the value is only available at runtime.

                 Ways to fix this:
                   - [stream] Wrap the component in \`<Suspense fallback={...}>\` so the hook value streams in after prerendering
                     https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense
                   - [cache] For known params, prerender them with \`generateStaticParams\`
                     https://nextjs.org/docs/messages/blocking-prerender-client-hook#for-known-params-prerender
                   - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                     https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route
                     at useDynamicRouteParams (webpack:///<next-src>)
                     at useParams (webpack:///<next-src>)
                     at UseParams (webpack:///app/client-hook-abort-reasons/client.tsx:17:12)
                     at Page (webpack:///app/client-hook-abort-reasons/normal/use-params/[id]/page.tsx:8:7)
                   637 |           // hang here and never resolve. This will cause the currently
                   638 |           // rendering component to effectively be a dynamic hole.
                 > 639 |           React.use(
                       |                 ^
                   640 |             makeClientHookHangingPromise(
                   641 |               workUnitStore.renderSignal,
                   642 |               new ParamClientHookDynamicError(workStore.route, expression) {
                   digest: 'CLIENT_HOOK_DYNAMIC'
                 }
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-params/[id]" in your browser to investigate the error.
                 Error occurred prerendering page "/client-hook-abort-reasons/normal/use-params/[id]". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on 1 path:
                 	/client-hook-abort-reasons/normal/use-params/[id]/page: /client-hook-abort-reasons/normal/use-params/[id]"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/client-hook-abort-reasons/normal/use-params/[id]": Next.js encountered URL data \`useParams()\` in a Client Component outside of \`<Suspense>\`.

                 This blocks prerendering because the value is only available at runtime.

                 Ways to fix this:
                   - [stream] Wrap the component in \`<Suspense fallback={...}>\` so the hook value streams in after prerendering
                     https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense
                   - [cache] For known params, prerender them with \`generateStaticParams\`
                     https://nextjs.org/docs/messages/blocking-prerender-client-hook#for-known-params-prerender
                   - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                     https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route
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
                     at v (<next-dist-dir>)
                     at w (<next-dist-dir>)
                     at x (<next-dist-dir>)
                     at y (<next-dist-dir>)
                     at z (<next-dist-dir>)
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
                     at v (<next-dist-dir>)
                     at w (<next-dist-dir>)
                     at x (<next-dist-dir>)
                     at y (<next-dist-dir>)
                     at z (<next-dist-dir>)
                     at body (<anonymous>)
                     at html (<anonymous>) {
                   digest: 'CLIENT_HOOK_DYNAMIC'
                 }
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-params/[id]" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error: Route "/client-hook-abort-reasons/normal/use-params/[id]": Next.js encountered uncached or runtime data during prerendering.

                 \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

                 Ways to fix this:
                   - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                   - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\`
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                   - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
                     https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
                   - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
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
                     at v (<next-dist-dir>)
                     at w (<next-dist-dir>)
                     at x (<next-dist-dir>)
                     at y (<next-dist-dir>)
                     at z (<next-dist-dir>)
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
                     at v (<next-dist-dir>)
                     at w (<next-dist-dir>)
                     at x (<next-dist-dir>)
                     at y (<next-dist-dir>)
                     at body (<anonymous>)
                     at html (<anonymous>)
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-params/[id]" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/client-hook-abort-reasons/normal/use-params/[id]". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /client-hook-abort-reasons/normal/use-params/[id]/page: /client-hook-abort-reasons/normal/use-params/[id], exiting the build."
                `)
              }
              return
            }

            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/client-hook-abort-reasons/normal/use-params/[id]": Next.js encountered uncached or runtime data during prerendering.

               \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

               Ways to fix this:
                 - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                 - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                 - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
                   https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
                 - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                   at DataSlot (app/client-hook-abort-reasons/data.tsx:1:23)
                   at Page (app/client-hook-abort-reasons/normal/use-params/[id]/page.tsx:7:7)
               > 1 | export async function DataSlot() {
                   |                       ^
                 2 |   await new Promise((resolve) => setTimeout(resolve, 0))
                 3 |   return <p>data slot</p>
                 4 | }
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-params/[id]" in your browser to investigate the error.
               Error: Route "/client-hook-abort-reasons/normal/use-params/[id]": Next.js encountered URL data \`useParams()\` in a Client Component outside of \`<Suspense>\`.

               This blocks prerendering because the value is only available at runtime.

               Ways to fix this:
                 - [stream] Wrap the component in \`<Suspense fallback={...}>\` so the hook value streams in after prerendering
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense
                 - [cache] For known params, prerender them with \`generateStaticParams\`
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#for-known-params-prerender
                 - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route
                   at UseParams (app/client-hook-abort-reasons/client.tsx:17:12)
                   at Page (app/client-hook-abort-reasons/normal/use-params/[id]/page.tsx:8:7)
                 15 |
                 16 | export function UseParams() {
               > 17 |   useParams()
                    |            ^
                 18 |   return <p>hook slot: useParams</p>
                 19 | }
                 20 | {
                 digest: 'CLIENT_HOOK_DYNAMIC'
               }
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-params/[id]" in your browser to investigate the error.
               Error occurred prerendering page "/client-hook-abort-reasons/normal/use-params/[id]". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/client-hook-abort-reasons/normal/use-params/[id]/page: /client-hook-abort-reasons/normal/use-params/[id]"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/client-hook-abort-reasons/normal/use-params/[id]": Next.js encountered URL data \`useParams()\` in a Client Component outside of \`<Suspense>\`.

               This blocks prerendering because the value is only available at runtime.

               Ways to fix this:
                 - [stream] Wrap the component in \`<Suspense fallback={...}>\` so the hook value streams in after prerendering
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense
                 - [cache] For known params, prerender them with \`generateStaticParams\`
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#for-known-params-prerender
                 - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route
                   at <unknown> (app/client-hook-abort-reasons/client.tsx:17:3)
                   at body (<anonymous>)
                   at html (<anonymous>)
                 15 |
                 16 | export function UseParams() {
               > 17 |   useParams()
                    |   ^
                 18 |   return <p>hook slot: useParams</p>
                 19 | }
                 20 | {
                 digest: 'CLIENT_HOOK_DYNAMIC'
               }
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-params/[id]" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error: Route "/client-hook-abort-reasons/normal/use-params/[id]": Next.js encountered uncached or runtime data during prerendering.

               \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

               Ways to fix this:
                 - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                 - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                 - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
                   https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
                 - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                   at body (<anonymous>)
                   at html (<anonymous>)
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-params/[id]" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/client-hook-abort-reasons/normal/use-params/[id]". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /client-hook-abort-reasons/normal/use-params/[id]/page: /client-hook-abort-reasons/normal/use-params/[id], exiting the build."
              `)
            }
          })

          it('should capture useSelectedLayoutSegments before the data slot', async () => {
            const output = await getFocusedPrerenderOutput(
              '/client-hook-abort-reasons/normal/use-selected-layout-segments/[id]'
            )

            if (!isTurbopack) {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/client-hook-abort-reasons/normal/use-selected-layout-segments/[id]": Next.js encountered uncached or runtime data during prerendering.

                 \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

                 Ways to fix this:
                   - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                   - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\`
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                   - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
                     https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
                   - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                     at DataSlot (webpack:///app/client-hook-abort-reasons/data.tsx:1:23)
                     at Page (webpack:///app/client-hook-abort-reasons/normal/use-selected-layout-segments/[id]/page.tsx:8:7)
                 > 1 | export async function DataSlot() {
                     |                       ^
                   2 |   await new Promise((resolve) => setTimeout(resolve, 0))
                   3 |   return <p>data slot</p>
                   4 | }
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-selected-layout-segments/[id]" in your browser to investigate the error.
                 Error: Route "/client-hook-abort-reasons/normal/use-selected-layout-segments/[id]": Next.js encountered URL data \`useSelectedLayoutSegments()\` in a Client Component outside of \`<Suspense>\`.

                 This blocks prerendering because the value is only available at runtime.

                 Ways to fix this:
                   - [stream] Wrap the component in \`<Suspense fallback={...}>\` so the hook value streams in after prerendering
                     https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense
                   - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                     https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route
                     at useDynamicRouteParams (webpack:///<next-src>)
                     at useSelectedLayoutSegments (webpack:///<next-src>)
                     at UseSelectedLayoutSegments (webpack:///app/client-hook-abort-reasons/client.tsx:37:28)
                     at Page (webpack:///app/client-hook-abort-reasons/normal/use-selected-layout-segments/[id]/page.tsx:7:7)
                   637 |           // hang here and never resolve. This will cause the currently
                   638 |           // rendering component to effectively be a dynamic hole.
                 > 639 |           React.use(
                       |                 ^
                   640 |             makeClientHookHangingPromise(
                   641 |               workUnitStore.renderSignal,
                   642 |               new ParamClientHookDynamicError(workStore.route, expression) {
                   digest: 'CLIENT_HOOK_DYNAMIC'
                 }
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-selected-layout-segments/[id]" in your browser to investigate the error.
                 Error occurred prerendering page "/client-hook-abort-reasons/normal/use-selected-layout-segments/[id]". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on 1 path:
                 	/client-hook-abort-reasons/normal/use-selected-layout-segments/[id]/page: /client-hook-abort-reasons/normal/use-selected-layout-segments/[id]"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/client-hook-abort-reasons/normal/use-selected-layout-segments/[id]": Next.js encountered URL data \`useSelectedLayoutSegments()\` in a Client Component outside of \`<Suspense>\`.

                 This blocks prerendering because the value is only available at runtime.

                 Ways to fix this:
                   - [stream] Wrap the component in \`<Suspense fallback={...}>\` so the hook value streams in after prerendering
                     https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense
                   - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                     https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route
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
                     at v (<next-dist-dir>)
                     at w (<next-dist-dir>)
                     at x (<next-dist-dir>)
                     at y (<next-dist-dir>)
                     at z (<next-dist-dir>)
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
                     at v (<next-dist-dir>)
                     at w (<next-dist-dir>)
                     at x (<next-dist-dir>)
                     at y (<next-dist-dir>)
                     at z (<next-dist-dir>)
                     at body (<anonymous>)
                     at html (<anonymous>) {
                   digest: 'CLIENT_HOOK_DYNAMIC'
                 }
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-selected-layout-segments/[id]" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error: Route "/client-hook-abort-reasons/normal/use-selected-layout-segments/[id]": Next.js encountered uncached or runtime data during prerendering.

                 \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

                 Ways to fix this:
                   - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                   - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\`
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                   - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
                     https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
                   - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
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
                     at v (<next-dist-dir>)
                     at w (<next-dist-dir>)
                     at x (<next-dist-dir>)
                     at y (<next-dist-dir>)
                     at z (<next-dist-dir>)
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
                     at v (<next-dist-dir>)
                     at w (<next-dist-dir>)
                     at x (<next-dist-dir>)
                     at y (<next-dist-dir>)
                     at body (<anonymous>)
                     at html (<anonymous>)
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-selected-layout-segments/[id]" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/client-hook-abort-reasons/normal/use-selected-layout-segments/[id]". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /client-hook-abort-reasons/normal/use-selected-layout-segments/[id]/page: /client-hook-abort-reasons/normal/use-selected-layout-segments/[id], exiting the build."
                `)
              }
              return
            }

            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/client-hook-abort-reasons/normal/use-selected-layout-segments/[id]": Next.js encountered uncached or runtime data during prerendering.

               \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

               Ways to fix this:
                 - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                 - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                 - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
                   https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
                 - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                   at DataSlot (app/client-hook-abort-reasons/data.tsx:1:23)
                   at Page (app/client-hook-abort-reasons/normal/use-selected-layout-segments/[id]/page.tsx:8:7)
               > 1 | export async function DataSlot() {
                   |                       ^
                 2 |   await new Promise((resolve) => setTimeout(resolve, 0))
                 3 |   return <p>data slot</p>
                 4 | }
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-selected-layout-segments/[id]" in your browser to investigate the error.
               Error: Route "/client-hook-abort-reasons/normal/use-selected-layout-segments/[id]": Next.js encountered URL data \`useSelectedLayoutSegments()\` in a Client Component outside of \`<Suspense>\`.

               This blocks prerendering because the value is only available at runtime.

               Ways to fix this:
                 - [stream] Wrap the component in \`<Suspense fallback={...}>\` so the hook value streams in after prerendering
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense
                 - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route
                   at UseSelectedLayoutSegments (app/client-hook-abort-reasons/client.tsx:37:28)
                   at Page (app/client-hook-abort-reasons/normal/use-selected-layout-segments/[id]/page.tsx:7:7)
                 35 |
                 36 | export function UseSelectedLayoutSegments() {
               > 37 |   useSelectedLayoutSegments()
                    |                            ^
                 38 |   return <p>hook slot: useSelectedLayoutSegments</p>
                 39 | }
                 40 | {
                 digest: 'CLIENT_HOOK_DYNAMIC'
               }
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-selected-layout-segments/[id]" in your browser to investigate the error.
               Error occurred prerendering page "/client-hook-abort-reasons/normal/use-selected-layout-segments/[id]". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/client-hook-abort-reasons/normal/use-selected-layout-segments/[id]/page: /client-hook-abort-reasons/normal/use-selected-layout-segments/[id]"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/client-hook-abort-reasons/normal/use-selected-layout-segments/[id]": Next.js encountered URL data \`useSelectedLayoutSegments()\` in a Client Component outside of \`<Suspense>\`.

               This blocks prerendering because the value is only available at runtime.

               Ways to fix this:
                 - [stream] Wrap the component in \`<Suspense fallback={...}>\` so the hook value streams in after prerendering
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense
                 - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route
                   at <unknown> (app/client-hook-abort-reasons/client.tsx:37:3)
                   at body (<anonymous>)
                   at html (<anonymous>)
                 35 |
                 36 | export function UseSelectedLayoutSegments() {
               > 37 |   useSelectedLayoutSegments()
                    |   ^
                 38 |   return <p>hook slot: useSelectedLayoutSegments</p>
                 39 | }
                 40 | {
                 digest: 'CLIENT_HOOK_DYNAMIC'
               }
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-selected-layout-segments/[id]" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error: Route "/client-hook-abort-reasons/normal/use-selected-layout-segments/[id]": Next.js encountered uncached or runtime data during prerendering.

               \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

               Ways to fix this:
                 - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                 - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                 - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
                   https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
                 - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                   at body (<anonymous>)
                   at html (<anonymous>)
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-selected-layout-segments/[id]" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/client-hook-abort-reasons/normal/use-selected-layout-segments/[id]". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /client-hook-abort-reasons/normal/use-selected-layout-segments/[id]/page: /client-hook-abort-reasons/normal/use-selected-layout-segments/[id], exiting the build."
              `)
            }
          })

          it('should capture useSelectedLayoutSegment after the data slot', async () => {
            const output = await getFocusedPrerenderOutput(
              '/client-hook-abort-reasons/normal/use-selected-layout-segment/[id]'
            )

            if (!isTurbopack) {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/client-hook-abort-reasons/normal/use-selected-layout-segment/[id]": Next.js encountered uncached or runtime data during prerendering.

                 \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

                 Ways to fix this:
                   - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                   - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\`
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                   - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
                     https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
                   - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                     at DataSlot (webpack:///app/client-hook-abort-reasons/data.tsx:1:23)
                     at Page (webpack:///app/client-hook-abort-reasons/normal/use-selected-layout-segment/[id]/page.tsx:7:7)
                 > 1 | export async function DataSlot() {
                     |                       ^
                   2 |   await new Promise((resolve) => setTimeout(resolve, 0))
                   3 |   return <p>data slot</p>
                   4 | }
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-selected-layout-segment/[id]" in your browser to investigate the error.
                 Error: Route "/client-hook-abort-reasons/normal/use-selected-layout-segment/[id]": Next.js encountered URL data \`useSelectedLayoutSegment()\` in a Client Component outside of \`<Suspense>\`.

                 This blocks prerendering because the value is only available at runtime.

                 Ways to fix this:
                   - [stream] Wrap the component in \`<Suspense fallback={...}>\` so the hook value streams in after prerendering
                     https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense
                   - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                     https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route
                     at useDynamicRouteParams (webpack:///<next-src>)
                     at useSelectedLayoutSegment (webpack:///<next-src>)
                     at UseSelectedLayoutSegment (webpack:///app/client-hook-abort-reasons/client.tsx:32:27)
                     at Page (webpack:///app/client-hook-abort-reasons/normal/use-selected-layout-segment/[id]/page.tsx:8:7)
                   637 |           // hang here and never resolve. This will cause the currently
                   638 |           // rendering component to effectively be a dynamic hole.
                 > 639 |           React.use(
                       |                 ^
                   640 |             makeClientHookHangingPromise(
                   641 |               workUnitStore.renderSignal,
                   642 |               new ParamClientHookDynamicError(workStore.route, expression) {
                   digest: 'CLIENT_HOOK_DYNAMIC'
                 }
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-selected-layout-segment/[id]" in your browser to investigate the error.
                 Error occurred prerendering page "/client-hook-abort-reasons/normal/use-selected-layout-segment/[id]". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on 1 path:
                 	/client-hook-abort-reasons/normal/use-selected-layout-segment/[id]/page: /client-hook-abort-reasons/normal/use-selected-layout-segment/[id]"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/client-hook-abort-reasons/normal/use-selected-layout-segment/[id]": Next.js encountered URL data \`useSelectedLayoutSegment()\` in a Client Component outside of \`<Suspense>\`.

                 This blocks prerendering because the value is only available at runtime.

                 Ways to fix this:
                   - [stream] Wrap the component in \`<Suspense fallback={...}>\` so the hook value streams in after prerendering
                     https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense
                   - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                     https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route
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
                     at v (<next-dist-dir>)
                     at w (<next-dist-dir>)
                     at x (<next-dist-dir>)
                     at y (<next-dist-dir>)
                     at z (<next-dist-dir>)
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
                     at v (<next-dist-dir>)
                     at w (<next-dist-dir>)
                     at x (<next-dist-dir>)
                     at y (<next-dist-dir>)
                     at z (<next-dist-dir>)
                     at body (<anonymous>)
                     at html (<anonymous>) {
                   digest: 'CLIENT_HOOK_DYNAMIC'
                 }
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-selected-layout-segment/[id]" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error: Route "/client-hook-abort-reasons/normal/use-selected-layout-segment/[id]": Next.js encountered uncached or runtime data during prerendering.

                 \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

                 Ways to fix this:
                   - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                   - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\`
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                   - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
                     https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
                   - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
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
                     at v (<next-dist-dir>)
                     at w (<next-dist-dir>)
                     at x (<next-dist-dir>)
                     at y (<next-dist-dir>)
                     at z (<next-dist-dir>)
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
                     at v (<next-dist-dir>)
                     at w (<next-dist-dir>)
                     at x (<next-dist-dir>)
                     at y (<next-dist-dir>)
                     at body (<anonymous>)
                     at html (<anonymous>)
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-selected-layout-segment/[id]" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/client-hook-abort-reasons/normal/use-selected-layout-segment/[id]". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /client-hook-abort-reasons/normal/use-selected-layout-segment/[id]/page: /client-hook-abort-reasons/normal/use-selected-layout-segment/[id], exiting the build."
                `)
              }
              return
            }

            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/client-hook-abort-reasons/normal/use-selected-layout-segment/[id]": Next.js encountered uncached or runtime data during prerendering.

               \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

               Ways to fix this:
                 - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                 - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                 - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
                   https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
                 - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                   at DataSlot (app/client-hook-abort-reasons/data.tsx:1:23)
                   at Page (app/client-hook-abort-reasons/normal/use-selected-layout-segment/[id]/page.tsx:7:7)
               > 1 | export async function DataSlot() {
                   |                       ^
                 2 |   await new Promise((resolve) => setTimeout(resolve, 0))
                 3 |   return <p>data slot</p>
                 4 | }
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-selected-layout-segment/[id]" in your browser to investigate the error.
               Error: Route "/client-hook-abort-reasons/normal/use-selected-layout-segment/[id]": Next.js encountered URL data \`useSelectedLayoutSegment()\` in a Client Component outside of \`<Suspense>\`.

               This blocks prerendering because the value is only available at runtime.

               Ways to fix this:
                 - [stream] Wrap the component in \`<Suspense fallback={...}>\` so the hook value streams in after prerendering
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense
                 - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route
                   at UseSelectedLayoutSegment (app/client-hook-abort-reasons/client.tsx:32:27)
                   at Page (app/client-hook-abort-reasons/normal/use-selected-layout-segment/[id]/page.tsx:8:7)
                 30 |
                 31 | export function UseSelectedLayoutSegment() {
               > 32 |   useSelectedLayoutSegment()
                    |                           ^
                 33 |   return <p>hook slot: useSelectedLayoutSegment</p>
                 34 | }
                 35 | {
                 digest: 'CLIENT_HOOK_DYNAMIC'
               }
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-selected-layout-segment/[id]" in your browser to investigate the error.
               Error occurred prerendering page "/client-hook-abort-reasons/normal/use-selected-layout-segment/[id]". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/client-hook-abort-reasons/normal/use-selected-layout-segment/[id]/page: /client-hook-abort-reasons/normal/use-selected-layout-segment/[id]"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/client-hook-abort-reasons/normal/use-selected-layout-segment/[id]": Next.js encountered URL data \`useSelectedLayoutSegment()\` in a Client Component outside of \`<Suspense>\`.

               This blocks prerendering because the value is only available at runtime.

               Ways to fix this:
                 - [stream] Wrap the component in \`<Suspense fallback={...}>\` so the hook value streams in after prerendering
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense
                 - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route
                   at <unknown> (app/client-hook-abort-reasons/client.tsx:32:3)
                   at body (<anonymous>)
                   at html (<anonymous>)
                 30 |
                 31 | export function UseSelectedLayoutSegment() {
               > 32 |   useSelectedLayoutSegment()
                    |   ^
                 33 |   return <p>hook slot: useSelectedLayoutSegment</p>
                 34 | }
                 35 | {
                 digest: 'CLIENT_HOOK_DYNAMIC'
               }
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-selected-layout-segment/[id]" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error: Route "/client-hook-abort-reasons/normal/use-selected-layout-segment/[id]": Next.js encountered uncached or runtime data during prerendering.

               \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

               Ways to fix this:
                 - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                 - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                 - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
                   https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
                 - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                   at body (<anonymous>)
                   at html (<anonymous>)
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/normal/use-selected-layout-segment/[id]" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/client-hook-abort-reasons/normal/use-selected-layout-segment/[id]". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /client-hook-abort-reasons/normal/use-selected-layout-segment/[id]/page: /client-hook-abort-reasons/normal/use-selected-layout-segment/[id], exiting the build."
              `)
            }
          })
        }
      })

      describe('sync IO aborting', () => {
        if (isNextDev) {
          it('should report sync IO before useSearchParams and data', async () => {
            const browser = await next.browser(
              '/client-hook-abort-reasons/sync-io/use-search-params/some-id'
            )

            // Ideally we'd show everything, but sync IO prevents us from
            // reasoning about later parts of the prerender too much. In the
            // future, if we get clever and figure it out, we'll have to change
            // the snapshots.
            await expect(browser).toDisplayCollapsedRedbox(`
             {
               "code": "E1287",
               "description": "Next.js encountered the unstable value Date.now() in a Client Component.",
               "environmentLabel": "Server",
               "label": "Blocking Route",
               "source": "app/client-hook-abort-reasons/client.tsx (12:8) @ SyncIO
             > 12 |   Date.now()
                  |        ^",
               "stack": [
                 "SyncIO app/client-hook-abort-reasons/client.tsx (12:8)",
                 "Page app/client-hook-abort-reasons/sync-io/use-search-params/[id]/page.tsx (7:7)",
               ],
             }
            `)
          })

          it('should report sync IO before data and usePathname', async () => {
            const browser = await next.browser(
              '/client-hook-abort-reasons/sync-io/use-pathname/some-id'
            )

            // Ideally we'd show everything, but sync IO prevents us from
            // reasoning about later parts of the prerender too much. In the
            // future, if we get clever and figure it out, we'll have to change
            // the snapshots.
            await expect(browser).toDisplayCollapsedRedbox(`
             {
               "code": "E1287",
               "description": "Next.js encountered the unstable value Date.now() in a Client Component.",
               "environmentLabel": "Server",
               "label": "Blocking Route",
               "source": "app/client-hook-abort-reasons/client.tsx (12:8) @ SyncIO
             > 12 |   Date.now()
                  |        ^",
               "stack": [
                 "SyncIO app/client-hook-abort-reasons/client.tsx (12:8)",
                 "Page app/client-hook-abort-reasons/sync-io/use-pathname/[id]/page.tsx (7:7)",
               ],
             }
            `)
          })

          it('should report useParams before sync IO and data', async () => {
            const browser = await next.browser(
              '/client-hook-abort-reasons/sync-io/use-params/some-id'
            )

            // Ideally we'd show everything, but sync IO prevents us from
            // reasoning about later parts of the prerender too much. In the
            // future, if we get clever and figure it out, we'll have to change
            // the snapshots.
            await expect(browser).toDisplayCollapsedRedbox(`
             [
               {
                 "code": "E1287",
                 "description": "Next.js encountered the unstable value Date.now() in a Client Component.",
                 "environmentLabel": "Server",
                 "label": "Blocking Route",
                 "source": "app/client-hook-abort-reasons/client.tsx (12:8) @ SyncIO
             > 12 |   Date.now()
                  |        ^",
                 "stack": [
                   "SyncIO app/client-hook-abort-reasons/client.tsx (12:8)",
                   "Page app/client-hook-abort-reasons/sync-io/use-params/[id]/page.tsx (8:7)",
                 ],
               },
               {
                 "code": "E1315",
                 "description": "Next.js encountered URL data useParams() in a Client Component outside of Suspense.",
                 "environmentLabel": "Server",
                 "label": "Blocking Route",
                 "source": "app/client-hook-abort-reasons/client.tsx (17:12) @ UseParams
             > 17 |   useParams()
                  |            ^",
                 "stack": [
                   "UseParams app/client-hook-abort-reasons/client.tsx (17:12)",
                   "Page app/client-hook-abort-reasons/sync-io/use-params/[id]/page.tsx (7:7)",
                 ],
               },
             ]
            `)
          })

          it('should report data before sync IO and useSelectedLayoutSegments', async () => {
            const browser = await next.browser(
              '/client-hook-abort-reasons/sync-io/use-selected-layout-segments/some-id'
            )

            // Ideally we'd show everything, but sync IO prevents us from
            // reasoning about later parts of the prerender too much. In the
            // future, if we get clever and figure it out, we'll have to change
            // the snapshots.
            await expect(browser).toDisplayCollapsedRedbox(`
             [
               {
                 "code": "E1287",
                 "description": "Next.js encountered the unstable value Date.now() in a Client Component.",
                 "environmentLabel": "Server",
                 "label": "Blocking Route",
                 "source": "app/client-hook-abort-reasons/client.tsx (12:8) @ SyncIO
             > 12 |   Date.now()
                  |        ^",
                 "stack": [
                   "SyncIO app/client-hook-abort-reasons/client.tsx (12:8)",
                   "Page app/client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id]/page.tsx (8:7)",
                 ],
               },
               {
                 "code": "E1318",
                 "description": "Next.js encountered uncached data during prerendering.",
                 "environmentLabel": "Server",
                 "label": "Blocking Route",
                 "source": "app/client-hook-abort-reasons/data.tsx (2:9) @ DataSlot
             > 2 |   await new Promise((resolve) => setTimeout(resolve, 0))
                 |         ^",
                 "stack": [
                   "DataSlot app/client-hook-abort-reasons/data.tsx (2:9)",
                   "Page app/client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id]/page.tsx (7:7)",
                 ],
               },
             ]
            `)
          })

          it('should report data and useSelectedLayoutSegment before sync IO', async () => {
            const browser = await next.browser(
              '/client-hook-abort-reasons/sync-io/use-selected-layout-segment/some-id'
            )

            await expect(browser).toDisplayCollapsedRedbox(`
             [
               {
                 "code": "E1287",
                 "description": "Next.js encountered the unstable value Date.now() in a Client Component.",
                 "environmentLabel": "Server",
                 "label": "Blocking Route",
                 "source": "app/client-hook-abort-reasons/client.tsx (12:8) @ SyncIO
             > 12 |   Date.now()
                  |        ^",
                 "stack": [
                   "SyncIO app/client-hook-abort-reasons/client.tsx (12:8)",
                   "Page app/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]/page.tsx (9:7)",
                 ],
               },
               {
                 "code": "E1315",
                 "description": "Next.js encountered URL data useSelectedLayoutSegment() in a Client Component outside of Suspense.",
                 "environmentLabel": "Server",
                 "label": "Blocking Route",
                 "source": "app/client-hook-abort-reasons/client.tsx (32:27) @ UseSelectedLayoutSegment
             > 32 |   useSelectedLayoutSegment()
                  |                           ^",
                 "stack": [
                   "UseSelectedLayoutSegment app/client-hook-abort-reasons/client.tsx (32:27)",
                   "Page app/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]/page.tsx (8:7)",
                 ],
               },
               {
                 "code": "E1318",
                 "description": "Next.js encountered uncached data during prerendering.",
                 "environmentLabel": "Server",
                 "label": "Blocking Route",
                 "source": "app/client-hook-abort-reasons/data.tsx (2:9) @ DataSlot
             > 2 |   await new Promise((resolve) => setTimeout(resolve, 0))
                 |         ^",
                 "stack": [
                   "DataSlot app/client-hook-abort-reasons/data.tsx (2:9)",
                   "Page app/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]/page.tsx (7:7)",
                 ],
               },
             ]
            `)
          })
        } else {
          // TODO(veil): Webpack's source map loader drops `ignoreList`, so
          // specialized hook errors in debug-prerender include Next.js
          // internals and select the internal `React.use()` frame for the
          // codeframe instead of the user hook callsite.
          it('should capture sync IO before useSearchParams and data', async () => {
            const output = await getFocusedPrerenderOutput(
              '/client-hook-abort-reasons/sync-io/use-search-params/[id]'
            )

            // Ideally we'd show everything, but sync IO prevents us from
            // reasoning about later parts of the prerender too much. In the
            // future, if we get clever and figure it out, we'll have to change
            // the snapshots.
            if (!isTurbopack) {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/client-hook-abort-reasons/sync-io/use-search-params/[id]": Next.js encountered the unstable value \`Date.now()\` in a Client Component.

                 This value would be evaluated during the prerender, instead of recomputed on each visit.

                 Ways to fix this:
                   - [stream] Wrap the Client Component in \`<Suspense fallback={...}>\`
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#wrap-in-or-move-into-suspense
                   - [defer] Move the read into a \`useEffect\` or event handler
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#move-into-effect-or-event-handler
                   - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#for-telemetry-use-a-timing-api
                     at SyncIO (webpack:///app/client-hook-abort-reasons/client.tsx:12:8)
                     at Page (webpack:///app/client-hook-abort-reasons/sync-io/use-search-params/[id]/page.tsx:7:7)
                   10 |
                   11 | export function SyncIO() {
                 > 12 |   Date.now()
                      |        ^
                   13 |   return <p>sync IO slot</p>
                   14 | }
                   15 |
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-search-params/[id]" in your browser to investigate the error.
                 Error occurred prerendering page "/client-hook-abort-reasons/sync-io/use-search-params/[id]". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on 1 path:
                 	/client-hook-abort-reasons/sync-io/use-search-params/[id]/page: /client-hook-abort-reasons/sync-io/use-search-params/[id]"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/client-hook-abort-reasons/sync-io/use-search-params/[id]": Next.js encountered the unstable value \`Date.now()\` in a Client Component.

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
                   - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-search-params/[id]" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/client-hook-abort-reasons/sync-io/use-search-params/[id]". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /client-hook-abort-reasons/sync-io/use-search-params/[id]/page: /client-hook-abort-reasons/sync-io/use-search-params/[id], exiting the build."
                `)
              }
              return
            }

            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/client-hook-abort-reasons/sync-io/use-search-params/[id]": Next.js encountered the unstable value \`Date.now()\` in a Client Component.

               This value would be evaluated during the prerender, instead of recomputed on each visit.

               Ways to fix this:
                 - [stream] Wrap the Client Component in \`<Suspense fallback={...}>\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time-client#wrap-in-or-move-into-suspense
                 - [defer] Move the read into a \`useEffect\` or event handler
                   https://nextjs.org/docs/messages/blocking-prerender-current-time-client#move-into-effect-or-event-handler
                 - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time-client#for-telemetry-use-a-timing-api
                   at SyncIO (app/client-hook-abort-reasons/client.tsx:12:8)
                   at Page (app/client-hook-abort-reasons/sync-io/use-search-params/[id]/page.tsx:7:7)
                 10 |
                 11 | export function SyncIO() {
               > 12 |   Date.now()
                    |        ^
                 13 |   return <p>sync IO slot</p>
                 14 | }
                 15 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-search-params/[id]" in your browser to investigate the error.
               Error occurred prerendering page "/client-hook-abort-reasons/sync-io/use-search-params/[id]". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/client-hook-abort-reasons/sync-io/use-search-params/[id]/page: /client-hook-abort-reasons/sync-io/use-search-params/[id]"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/client-hook-abort-reasons/sync-io/use-search-params/[id]": Next.js encountered the unstable value \`Date.now()\` in a Client Component.

               This value would be evaluated during the prerender, instead of recomputed on each visit.

               Ways to fix this:
                 - [stream] Wrap the Client Component in \`<Suspense fallback={...}>\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time-client#wrap-in-or-move-into-suspense
                 - [defer] Move the read into a \`useEffect\` or event handler
                   https://nextjs.org/docs/messages/blocking-prerender-current-time-client#move-into-effect-or-event-handler
                 - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time-client#for-telemetry-use-a-timing-api
                   at <unknown> (app/client-hook-abort-reasons/client.tsx:12:8)
                 10 |
                 11 | export function SyncIO() {
               > 12 |   Date.now()
                    |        ^
                 13 |   return <p>sync IO slot</p>
                 14 | }
                 15 |
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-search-params/[id]" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/client-hook-abort-reasons/sync-io/use-search-params/[id]". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /client-hook-abort-reasons/sync-io/use-search-params/[id]/page: /client-hook-abort-reasons/sync-io/use-search-params/[id], exiting the build."
              `)
            }
          })

          it('should capture sync IO before data and usePathname', async () => {
            const output = await getFocusedPrerenderOutput(
              '/client-hook-abort-reasons/sync-io/use-pathname/[id]'
            )

            // Ideally we'd show everything, but sync IO prevents us from
            // reasoning about later parts of the prerender too much. In the
            // future, if we get clever and figure it out, we'll have to change
            // the snapshots.
            if (!isTurbopack) {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/client-hook-abort-reasons/sync-io/use-pathname/[id]": Next.js encountered the unstable value \`Date.now()\` in a Client Component.

                 This value would be evaluated during the prerender, instead of recomputed on each visit.

                 Ways to fix this:
                   - [stream] Wrap the Client Component in \`<Suspense fallback={...}>\`
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#wrap-in-or-move-into-suspense
                   - [defer] Move the read into a \`useEffect\` or event handler
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#move-into-effect-or-event-handler
                   - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#for-telemetry-use-a-timing-api
                     at SyncIO (webpack:///app/client-hook-abort-reasons/client.tsx:12:8)
                     at Page (webpack:///app/client-hook-abort-reasons/sync-io/use-pathname/[id]/page.tsx:7:7)
                   10 |
                   11 | export function SyncIO() {
                 > 12 |   Date.now()
                      |        ^
                   13 |   return <p>sync IO slot</p>
                   14 | }
                   15 |
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-pathname/[id]" in your browser to investigate the error.
                 Error occurred prerendering page "/client-hook-abort-reasons/sync-io/use-pathname/[id]". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on 1 path:
                 	/client-hook-abort-reasons/sync-io/use-pathname/[id]/page: /client-hook-abort-reasons/sync-io/use-pathname/[id]"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/client-hook-abort-reasons/sync-io/use-pathname/[id]": Next.js encountered the unstable value \`Date.now()\` in a Client Component.

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
                   - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-pathname/[id]" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/client-hook-abort-reasons/sync-io/use-pathname/[id]". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /client-hook-abort-reasons/sync-io/use-pathname/[id]/page: /client-hook-abort-reasons/sync-io/use-pathname/[id], exiting the build."
                `)
              }
              return
            }

            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/client-hook-abort-reasons/sync-io/use-pathname/[id]": Next.js encountered the unstable value \`Date.now()\` in a Client Component.

               This value would be evaluated during the prerender, instead of recomputed on each visit.

               Ways to fix this:
                 - [stream] Wrap the Client Component in \`<Suspense fallback={...}>\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time-client#wrap-in-or-move-into-suspense
                 - [defer] Move the read into a \`useEffect\` or event handler
                   https://nextjs.org/docs/messages/blocking-prerender-current-time-client#move-into-effect-or-event-handler
                 - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time-client#for-telemetry-use-a-timing-api
                   at SyncIO (app/client-hook-abort-reasons/client.tsx:12:8)
                   at Page (app/client-hook-abort-reasons/sync-io/use-pathname/[id]/page.tsx:7:7)
                 10 |
                 11 | export function SyncIO() {
               > 12 |   Date.now()
                    |        ^
                 13 |   return <p>sync IO slot</p>
                 14 | }
                 15 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-pathname/[id]" in your browser to investigate the error.
               Error occurred prerendering page "/client-hook-abort-reasons/sync-io/use-pathname/[id]". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/client-hook-abort-reasons/sync-io/use-pathname/[id]/page: /client-hook-abort-reasons/sync-io/use-pathname/[id]"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/client-hook-abort-reasons/sync-io/use-pathname/[id]": Next.js encountered the unstable value \`Date.now()\` in a Client Component.

               This value would be evaluated during the prerender, instead of recomputed on each visit.

               Ways to fix this:
                 - [stream] Wrap the Client Component in \`<Suspense fallback={...}>\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time-client#wrap-in-or-move-into-suspense
                 - [defer] Move the read into a \`useEffect\` or event handler
                   https://nextjs.org/docs/messages/blocking-prerender-current-time-client#move-into-effect-or-event-handler
                 - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time-client#for-telemetry-use-a-timing-api
                   at <unknown> (app/client-hook-abort-reasons/client.tsx:12:8)
                 10 |
                 11 | export function SyncIO() {
               > 12 |   Date.now()
                    |        ^
                 13 |   return <p>sync IO slot</p>
                 14 | }
                 15 |
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-pathname/[id]" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/client-hook-abort-reasons/sync-io/use-pathname/[id]". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /client-hook-abort-reasons/sync-io/use-pathname/[id]/page: /client-hook-abort-reasons/sync-io/use-pathname/[id], exiting the build."
              `)
            }
          })

          it('should capture useParams before sync IO and data', async () => {
            const output = await getFocusedPrerenderOutput(
              '/client-hook-abort-reasons/sync-io/use-params/[id]'
            )

            // Ideally we'd show everything, but sync IO prevents us from
            // reasoning about later parts of the prerender too much. In the
            // future, if we get clever and figure it out, we'll have to change
            // the snapshots.
            if (!isTurbopack) {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/client-hook-abort-reasons/sync-io/use-params/[id]": Next.js encountered the unstable value \`Date.now()\` in a Client Component.

                 This value would be evaluated during the prerender, instead of recomputed on each visit.

                 Ways to fix this:
                   - [stream] Wrap the Client Component in \`<Suspense fallback={...}>\`
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#wrap-in-or-move-into-suspense
                   - [defer] Move the read into a \`useEffect\` or event handler
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#move-into-effect-or-event-handler
                   - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#for-telemetry-use-a-timing-api
                     at SyncIO (webpack:///app/client-hook-abort-reasons/client.tsx:12:8)
                     at Page (webpack:///app/client-hook-abort-reasons/sync-io/use-params/[id]/page.tsx:8:7)
                   10 |
                   11 | export function SyncIO() {
                 > 12 |   Date.now()
                      |        ^
                   13 |   return <p>sync IO slot</p>
                   14 | }
                   15 |
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-params/[id]" in your browser to investigate the error.
                 Error: Route "/client-hook-abort-reasons/sync-io/use-params/[id]": Next.js encountered URL data \`useParams()\` in a Client Component outside of \`<Suspense>\`.

                 This blocks prerendering because the value is only available at runtime.

                 Ways to fix this:
                   - [stream] Wrap the component in \`<Suspense fallback={...}>\` so the hook value streams in after prerendering
                     https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense
                   - [cache] For known params, prerender them with \`generateStaticParams\`
                     https://nextjs.org/docs/messages/blocking-prerender-client-hook#for-known-params-prerender
                   - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                     https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route
                     at useDynamicRouteParams (webpack:///<next-src>)
                     at useParams (webpack:///<next-src>)
                     at UseParams (webpack:///app/client-hook-abort-reasons/client.tsx:17:12)
                     at Page (webpack:///app/client-hook-abort-reasons/sync-io/use-params/[id]/page.tsx:7:7)
                   637 |           // hang here and never resolve. This will cause the currently
                   638 |           // rendering component to effectively be a dynamic hole.
                 > 639 |           React.use(
                       |                 ^
                   640 |             makeClientHookHangingPromise(
                   641 |               workUnitStore.renderSignal,
                   642 |               new ParamClientHookDynamicError(workStore.route, expression) {
                   digest: 'CLIENT_HOOK_DYNAMIC'
                 }
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-params/[id]" in your browser to investigate the error.
                 Error occurred prerendering page "/client-hook-abort-reasons/sync-io/use-params/[id]". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on 1 path:
                 	/client-hook-abort-reasons/sync-io/use-params/[id]/page: /client-hook-abort-reasons/sync-io/use-params/[id]"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/client-hook-abort-reasons/sync-io/use-params/[id]": Next.js encountered the unstable value \`Date.now()\` in a Client Component.

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
                   - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-params/[id]" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error: Route "/client-hook-abort-reasons/sync-io/use-params/[id]": Next.js encountered URL data \`useParams()\` in a Client Component outside of \`<Suspense>\`.

                 This blocks prerendering because the value is only available at runtime.

                 Ways to fix this:
                   - [stream] Wrap the component in \`<Suspense fallback={...}>\` so the hook value streams in after prerendering
                     https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense
                   - [cache] For known params, prerender them with \`generateStaticParams\`
                     https://nextjs.org/docs/messages/blocking-prerender-client-hook#for-known-params-prerender
                   - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                     https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route
                     at b (<next-dist-dir>)
                     at c (<next-dist-dir>)
                     at d (<next-dist-dir>)
                     at e (<next-dist-dir>)
                     at f (<next-dist-dir>)
                     at g (<next-dist-dir>)
                     at h (<next-dist-dir>)
                     at i (<next-dist-dir>)
                     at j (<next-dist-dir>)
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
                     at v (<next-dist-dir>)
                     at w (<next-dist-dir>)
                     at x (<next-dist-dir>)
                     at y (<next-dist-dir>)
                     at z (<next-dist-dir>)
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
                     at v (<next-dist-dir>)
                     at w (<next-dist-dir>)
                     at x (<next-dist-dir>)
                     at y (<next-dist-dir>)
                     at z (<next-dist-dir>)
                     at a (<next-dist-dir>)
                     at body (<anonymous>)
                     at html (<anonymous>) {
                   digest: 'CLIENT_HOOK_DYNAMIC'
                 }
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-params/[id]" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/client-hook-abort-reasons/sync-io/use-params/[id]". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /client-hook-abort-reasons/sync-io/use-params/[id]/page: /client-hook-abort-reasons/sync-io/use-params/[id], exiting the build."
                `)
              }
              return
            }

            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/client-hook-abort-reasons/sync-io/use-params/[id]": Next.js encountered the unstable value \`Date.now()\` in a Client Component.

               This value would be evaluated during the prerender, instead of recomputed on each visit.

               Ways to fix this:
                 - [stream] Wrap the Client Component in \`<Suspense fallback={...}>\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time-client#wrap-in-or-move-into-suspense
                 - [defer] Move the read into a \`useEffect\` or event handler
                   https://nextjs.org/docs/messages/blocking-prerender-current-time-client#move-into-effect-or-event-handler
                 - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time-client#for-telemetry-use-a-timing-api
                   at SyncIO (app/client-hook-abort-reasons/client.tsx:12:8)
                   at Page (app/client-hook-abort-reasons/sync-io/use-params/[id]/page.tsx:8:7)
                 10 |
                 11 | export function SyncIO() {
               > 12 |   Date.now()
                    |        ^
                 13 |   return <p>sync IO slot</p>
                 14 | }
                 15 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-params/[id]" in your browser to investigate the error.
               Error: Route "/client-hook-abort-reasons/sync-io/use-params/[id]": Next.js encountered URL data \`useParams()\` in a Client Component outside of \`<Suspense>\`.

               This blocks prerendering because the value is only available at runtime.

               Ways to fix this:
                 - [stream] Wrap the component in \`<Suspense fallback={...}>\` so the hook value streams in after prerendering
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense
                 - [cache] For known params, prerender them with \`generateStaticParams\`
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#for-known-params-prerender
                 - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route
                   at UseParams (app/client-hook-abort-reasons/client.tsx:17:12)
                   at Page (app/client-hook-abort-reasons/sync-io/use-params/[id]/page.tsx:7:7)
                 15 |
                 16 | export function UseParams() {
               > 17 |   useParams()
                    |            ^
                 18 |   return <p>hook slot: useParams</p>
                 19 | }
                 20 | {
                 digest: 'CLIENT_HOOK_DYNAMIC'
               }
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-params/[id]" in your browser to investigate the error.
               Error occurred prerendering page "/client-hook-abort-reasons/sync-io/use-params/[id]". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/client-hook-abort-reasons/sync-io/use-params/[id]/page: /client-hook-abort-reasons/sync-io/use-params/[id]"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/client-hook-abort-reasons/sync-io/use-params/[id]": Next.js encountered the unstable value \`Date.now()\` in a Client Component.

               This value would be evaluated during the prerender, instead of recomputed on each visit.

               Ways to fix this:
                 - [stream] Wrap the Client Component in \`<Suspense fallback={...}>\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time-client#wrap-in-or-move-into-suspense
                 - [defer] Move the read into a \`useEffect\` or event handler
                   https://nextjs.org/docs/messages/blocking-prerender-current-time-client#move-into-effect-or-event-handler
                 - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time-client#for-telemetry-use-a-timing-api
                   at <unknown> (app/client-hook-abort-reasons/client.tsx:12:8)
                 10 |
                 11 | export function SyncIO() {
               > 12 |   Date.now()
                    |        ^
                 13 |   return <p>sync IO slot</p>
                 14 | }
                 15 |
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-params/[id]" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error: Route "/client-hook-abort-reasons/sync-io/use-params/[id]": Next.js encountered URL data \`useParams()\` in a Client Component outside of \`<Suspense>\`.

               This blocks prerendering because the value is only available at runtime.

               Ways to fix this:
                 - [stream] Wrap the component in \`<Suspense fallback={...}>\` so the hook value streams in after prerendering
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense
                 - [cache] For known params, prerender them with \`generateStaticParams\`
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#for-known-params-prerender
                 - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route
                   at <unknown> (app/client-hook-abort-reasons/client.tsx:17:3)
                   at body (<anonymous>)
                   at html (<anonymous>)
                 15 |
                 16 | export function UseParams() {
               > 17 |   useParams()
                    |   ^
                 18 |   return <p>hook slot: useParams</p>
                 19 | }
                 20 | {
                 digest: 'CLIENT_HOOK_DYNAMIC'
               }
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-params/[id]" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/client-hook-abort-reasons/sync-io/use-params/[id]". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /client-hook-abort-reasons/sync-io/use-params/[id]/page: /client-hook-abort-reasons/sync-io/use-params/[id], exiting the build."
              `)
            }
          })

          it('should capture data before sync IO and useSelectedLayoutSegments', async () => {
            const output = await getFocusedPrerenderOutput(
              '/client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id]'
            )

            // Ideally we'd show everything, but sync IO prevents us from
            // reasoning about later parts of the prerender too much. In the
            // future, if we get clever and figure it out, we'll have to change
            // the snapshots.
            if (!isTurbopack) {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id]": Next.js encountered the unstable value \`Date.now()\` in a Client Component.

                 This value would be evaluated during the prerender, instead of recomputed on each visit.

                 Ways to fix this:
                   - [stream] Wrap the Client Component in \`<Suspense fallback={...}>\`
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#wrap-in-or-move-into-suspense
                   - [defer] Move the read into a \`useEffect\` or event handler
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#move-into-effect-or-event-handler
                   - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#for-telemetry-use-a-timing-api
                     at SyncIO (webpack:///app/client-hook-abort-reasons/client.tsx:12:8)
                     at Page (webpack:///app/client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id]/page.tsx:8:7)
                   10 |
                   11 | export function SyncIO() {
                 > 12 |   Date.now()
                      |        ^
                   13 |   return <p>sync IO slot</p>
                   14 | }
                   15 |
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id]" in your browser to investigate the error.
                 Error: Route "/client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id]": Next.js encountered uncached or runtime data during prerendering.

                 \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

                 Ways to fix this:
                   - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                   - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\`
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                   - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
                     https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
                   - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                     at DataSlot (webpack:///app/client-hook-abort-reasons/data.tsx:1:23)
                     at Page (webpack:///app/client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id]/page.tsx:7:7)
                 > 1 | export async function DataSlot() {
                     |                       ^
                   2 |   await new Promise((resolve) => setTimeout(resolve, 0))
                   3 |   return <p>data slot</p>
                   4 | }
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id]" in your browser to investigate the error.
                 Error occurred prerendering page "/client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id]". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on 1 path:
                 	/client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id]/page: /client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id]"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id]": Next.js encountered the unstable value \`Date.now()\` in a Client Component.

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
                   - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id]" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error: Route "/client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id]": Next.js encountered uncached or runtime data during prerendering.

                 \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

                 Ways to fix this:
                   - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                   - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\`
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                   - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
                     https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
                   - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                     at b (<next-dist-dir>)
                     at c (<next-dist-dir>)
                     at d (<next-dist-dir>)
                     at e (<next-dist-dir>)
                     at f (<next-dist-dir>)
                     at g (<next-dist-dir>)
                     at h (<next-dist-dir>)
                     at i (<next-dist-dir>)
                     at j (<next-dist-dir>)
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
                     at v (<next-dist-dir>)
                     at w (<next-dist-dir>)
                     at x (<next-dist-dir>)
                     at y (<next-dist-dir>)
                     at z (<next-dist-dir>)
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
                     at v (<next-dist-dir>)
                     at w (<next-dist-dir>)
                     at x (<next-dist-dir>)
                     at y (<next-dist-dir>)
                     at z (<next-dist-dir>)
                     at body (<anonymous>)
                     at html (<anonymous>)
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id]" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id]". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id]/page: /client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id], exiting the build."
                `)
              }
              return
            }

            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id]": Next.js encountered the unstable value \`Date.now()\` in a Client Component.

               This value would be evaluated during the prerender, instead of recomputed on each visit.

               Ways to fix this:
                 - [stream] Wrap the Client Component in \`<Suspense fallback={...}>\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time-client#wrap-in-or-move-into-suspense
                 - [defer] Move the read into a \`useEffect\` or event handler
                   https://nextjs.org/docs/messages/blocking-prerender-current-time-client#move-into-effect-or-event-handler
                 - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time-client#for-telemetry-use-a-timing-api
                   at SyncIO (app/client-hook-abort-reasons/client.tsx:12:8)
                   at Page (app/client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id]/page.tsx:8:7)
                 10 |
                 11 | export function SyncIO() {
               > 12 |   Date.now()
                    |        ^
                 13 |   return <p>sync IO slot</p>
                 14 | }
                 15 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id]" in your browser to investigate the error.
               Error: Route "/client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id]": Next.js encountered uncached or runtime data during prerendering.

               \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

               Ways to fix this:
                 - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                 - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                 - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
                   https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
                 - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                   at DataSlot (app/client-hook-abort-reasons/data.tsx:1:23)
                   at Page (app/client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id]/page.tsx:7:7)
               > 1 | export async function DataSlot() {
                   |                       ^
                 2 |   await new Promise((resolve) => setTimeout(resolve, 0))
                 3 |   return <p>data slot</p>
                 4 | }
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id]" in your browser to investigate the error.
               Error occurred prerendering page "/client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id]". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id]/page: /client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id]"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id]": Next.js encountered the unstable value \`Date.now()\` in a Client Component.

               This value would be evaluated during the prerender, instead of recomputed on each visit.

               Ways to fix this:
                 - [stream] Wrap the Client Component in \`<Suspense fallback={...}>\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time-client#wrap-in-or-move-into-suspense
                 - [defer] Move the read into a \`useEffect\` or event handler
                   https://nextjs.org/docs/messages/blocking-prerender-current-time-client#move-into-effect-or-event-handler
                 - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time-client#for-telemetry-use-a-timing-api
                   at <unknown> (app/client-hook-abort-reasons/client.tsx:12:8)
                 10 |
                 11 | export function SyncIO() {
               > 12 |   Date.now()
                    |        ^
                 13 |   return <p>sync IO slot</p>
                 14 | }
                 15 |
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id]" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error: Route "/client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id]": Next.js encountered uncached or runtime data during prerendering.

               \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

               Ways to fix this:
                 - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                 - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                 - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
                   https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
                 - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                   at body (<anonymous>)
                   at html (<anonymous>)
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id]" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id]". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id]/page: /client-hook-abort-reasons/sync-io/use-selected-layout-segments/[id], exiting the build."
              `)
            }
          })

          it('should capture data and useSelectedLayoutSegment before sync IO', async () => {
            const output = await getFocusedPrerenderOutput(
              '/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]'
            )

            if (!isTurbopack) {
              if (isDebugPrerender) {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]": Next.js encountered the unstable value \`Date.now()\` in a Client Component.

                 This value would be evaluated during the prerender, instead of recomputed on each visit.

                 Ways to fix this:
                   - [stream] Wrap the Client Component in \`<Suspense fallback={...}>\`
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#wrap-in-or-move-into-suspense
                   - [defer] Move the read into a \`useEffect\` or event handler
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#move-into-effect-or-event-handler
                   - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                     https://nextjs.org/docs/messages/blocking-prerender-current-time-client#for-telemetry-use-a-timing-api
                     at SyncIO (webpack:///app/client-hook-abort-reasons/client.tsx:12:8)
                     at Page (webpack:///app/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]/page.tsx:9:7)
                   10 |
                   11 | export function SyncIO() {
                 > 12 |   Date.now()
                      |        ^
                   13 |   return <p>sync IO slot</p>
                   14 | }
                   15 |
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]" in your browser to investigate the error.
                 Error: Route "/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]": Next.js encountered uncached or runtime data during prerendering.

                 \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

                 Ways to fix this:
                   - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                   - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\`
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                   - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
                     https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
                   - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                     at DataSlot (webpack:///app/client-hook-abort-reasons/data.tsx:1:23)
                     at Page (webpack:///app/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]/page.tsx:7:7)
                 > 1 | export async function DataSlot() {
                     |                       ^
                   2 |   await new Promise((resolve) => setTimeout(resolve, 0))
                   3 |   return <p>data slot</p>
                   4 | }
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]" in your browser to investigate the error.
                 Error: Route "/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]": Next.js encountered URL data \`useSelectedLayoutSegment()\` in a Client Component outside of \`<Suspense>\`.

                 This blocks prerendering because the value is only available at runtime.

                 Ways to fix this:
                   - [stream] Wrap the component in \`<Suspense fallback={...}>\` so the hook value streams in after prerendering
                     https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense
                   - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                     https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route
                     at useDynamicRouteParams (webpack:///<next-src>)
                     at useSelectedLayoutSegment (webpack:///<next-src>)
                     at UseSelectedLayoutSegment (webpack:///app/client-hook-abort-reasons/client.tsx:32:27)
                     at Page (webpack:///app/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]/page.tsx:8:7)
                   637 |           // hang here and never resolve. This will cause the currently
                   638 |           // rendering component to effectively be a dynamic hole.
                 > 639 |           React.use(
                       |                 ^
                   640 |             makeClientHookHangingPromise(
                   641 |               workUnitStore.renderSignal,
                   642 |               new ParamClientHookDynamicError(workStore.route, expression) {
                   digest: 'CLIENT_HOOK_DYNAMIC'
                 }
                 To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]" in your browser to investigate the error.
                 Error occurred prerendering page "/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]". Read more: https://nextjs.org/docs/messages/prerender-error

                 > Export encountered errors on 1 path:
                 	/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]/page: /client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]"
                `)
              } else {
                expect(output).toMatchInlineSnapshot(`
                 "Error: Route "/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]": Next.js encountered the unstable value \`Date.now()\` in a Client Component.

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
                   - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error: Route "/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]": Next.js encountered URL data \`useSelectedLayoutSegment()\` in a Client Component outside of \`<Suspense>\`.

                 This blocks prerendering because the value is only available at runtime.

                 Ways to fix this:
                   - [stream] Wrap the component in \`<Suspense fallback={...}>\` so the hook value streams in after prerendering
                     https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense
                   - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                     https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route
                     at b (<next-dist-dir>)
                     at c (<next-dist-dir>)
                     at d (<next-dist-dir>)
                     at e (<next-dist-dir>)
                     at f (<next-dist-dir>)
                     at g (<next-dist-dir>)
                     at h (<next-dist-dir>)
                     at i (<next-dist-dir>)
                     at j (<next-dist-dir>)
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
                     at v (<next-dist-dir>)
                     at w (<next-dist-dir>)
                     at x (<next-dist-dir>)
                     at y (<next-dist-dir>)
                     at z (<next-dist-dir>)
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
                     at v (<next-dist-dir>)
                     at w (<next-dist-dir>)
                     at x (<next-dist-dir>)
                     at y (<next-dist-dir>)
                     at z (<next-dist-dir>)
                     at a (<next-dist-dir>)
                     at body (<anonymous>)
                     at html (<anonymous>) {
                   digest: 'CLIENT_HOOK_DYNAMIC'
                 }
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error: Route "/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]": Next.js encountered uncached or runtime data during prerendering.

                 \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

                 Ways to fix this:
                   - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                   - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\`
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                   - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
                     https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
                   - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                     https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                     at b (<next-dist-dir>)
                     at c (<next-dist-dir>)
                     at d (<next-dist-dir>)
                     at e (<next-dist-dir>)
                     at f (<next-dist-dir>)
                     at g (<next-dist-dir>)
                     at h (<next-dist-dir>)
                     at i (<next-dist-dir>)
                     at j (<next-dist-dir>)
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
                     at v (<next-dist-dir>)
                     at w (<next-dist-dir>)
                     at x (<next-dist-dir>)
                     at y (<next-dist-dir>)
                     at z (<next-dist-dir>)
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
                     at v (<next-dist-dir>)
                     at w (<next-dist-dir>)
                     at x (<next-dist-dir>)
                     at y (<next-dist-dir>)
                     at z (<next-dist-dir>)
                     at body (<anonymous>)
                     at html (<anonymous>)
                 To get a more detailed stack trace and pinpoint the issue, try one of the following:
                   - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]" in your browser to investigate the error.
                   - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
                 Error occurred prerendering page "/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]". Read more: https://nextjs.org/docs/messages/prerender-error
                 Export encountered an error on /client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]/page: /client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id], exiting the build."
                `)
              }
              return
            }

            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]": Next.js encountered the unstable value \`Date.now()\` in a Client Component.

               This value would be evaluated during the prerender, instead of recomputed on each visit.

               Ways to fix this:
                 - [stream] Wrap the Client Component in \`<Suspense fallback={...}>\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time-client#wrap-in-or-move-into-suspense
                 - [defer] Move the read into a \`useEffect\` or event handler
                   https://nextjs.org/docs/messages/blocking-prerender-current-time-client#move-into-effect-or-event-handler
                 - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time-client#for-telemetry-use-a-timing-api
                   at SyncIO (app/client-hook-abort-reasons/client.tsx:12:8)
                   at Page (app/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]/page.tsx:9:7)
                 10 |
                 11 | export function SyncIO() {
               > 12 |   Date.now()
                    |        ^
                 13 |   return <p>sync IO slot</p>
                 14 | }
                 15 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]" in your browser to investigate the error.
               Error: Route "/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]": Next.js encountered uncached or runtime data during prerendering.

               \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

               Ways to fix this:
                 - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                 - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                 - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
                   https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
                 - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                   at DataSlot (app/client-hook-abort-reasons/data.tsx:1:23)
                   at Page (app/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]/page.tsx:7:7)
               > 1 | export async function DataSlot() {
                   |                       ^
                 2 |   await new Promise((resolve) => setTimeout(resolve, 0))
                 3 |   return <p>data slot</p>
                 4 | }
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]" in your browser to investigate the error.
               Error: Route "/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]": Next.js encountered URL data \`useSelectedLayoutSegment()\` in a Client Component outside of \`<Suspense>\`.

               This blocks prerendering because the value is only available at runtime.

               Ways to fix this:
                 - [stream] Wrap the component in \`<Suspense fallback={...}>\` so the hook value streams in after prerendering
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense
                 - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route
                   at UseSelectedLayoutSegment (app/client-hook-abort-reasons/client.tsx:32:27)
                   at Page (app/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]/page.tsx:8:7)
                 30 |
                 31 | export function UseSelectedLayoutSegment() {
               > 32 |   useSelectedLayoutSegment()
                    |                           ^
                 33 |   return <p>hook slot: useSelectedLayoutSegment</p>
                 34 | }
                 35 | {
                 digest: 'CLIENT_HOOK_DYNAMIC'
               }
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]" in your browser to investigate the error.
               Error occurred prerendering page "/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]/page: /client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]": Next.js encountered the unstable value \`Date.now()\` in a Client Component.

               This value would be evaluated during the prerender, instead of recomputed on each visit.

               Ways to fix this:
                 - [stream] Wrap the Client Component in \`<Suspense fallback={...}>\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time-client#wrap-in-or-move-into-suspense
                 - [defer] Move the read into a \`useEffect\` or event handler
                   https://nextjs.org/docs/messages/blocking-prerender-current-time-client#move-into-effect-or-event-handler
                 - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`
                   https://nextjs.org/docs/messages/blocking-prerender-current-time-client#for-telemetry-use-a-timing-api
                   at <unknown> (app/client-hook-abort-reasons/client.tsx:12:8)
                 10 |
                 11 | export function SyncIO() {
               > 12 |   Date.now()
                    |        ^
                 13 |   return <p>sync IO slot</p>
                 14 | }
                 15 |
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error: Route "/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]": Next.js encountered URL data \`useSelectedLayoutSegment()\` in a Client Component outside of \`<Suspense>\`.

               This blocks prerendering because the value is only available at runtime.

               Ways to fix this:
                 - [stream] Wrap the component in \`<Suspense fallback={...}>\` so the hook value streams in after prerendering
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense
                 - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route
                   at <unknown> (app/client-hook-abort-reasons/client.tsx:32:3)
                   at body (<anonymous>)
                   at html (<anonymous>)
                 30 |
                 31 | export function UseSelectedLayoutSegment() {
               > 32 |   useSelectedLayoutSegment()
                    |   ^
                 33 |   return <p>hook slot: useSelectedLayoutSegment</p>
                 34 | }
                 35 | {
                 digest: 'CLIENT_HOOK_DYNAMIC'
               }
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error: Route "/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]": Next.js encountered uncached or runtime data during prerendering.

               \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

               Ways to fix this:
                 - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                 - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\`
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                 - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
                   https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
                 - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                   at body (<anonymous>)
                   at html (<anonymous>)
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id]/page: /client-hook-abort-reasons/sync-io/use-selected-layout-segment/[id], exiting the build."
              `)
            }
          })
        }
      })
    })
  })
})
