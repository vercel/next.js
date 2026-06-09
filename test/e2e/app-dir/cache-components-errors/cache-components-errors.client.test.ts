import { isNextDev, nextTestSetup } from 'e2e-utils'
import { getPrerenderOutput } from './utils'

describe('Cache Components Errors - Client Components', () => {
  const { next, isTurbopack, isNextStart, skipped } = nextTestSetup({
    files: __dirname + '/fixtures/client',
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
        name: 'Build With --prerender-debug',
      })
    }
    if (!prerenderMode || prerenderMode === 'false') {
      testCases.push({
        isDebugPrerender: false,
        name: 'Build Without --prerender-debug',
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

    describe('IO accessed in Client Components', () => {
      const pathname = '/client-awaited-io'

      if (isNextDev) {
        it('should show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)

          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "code": "E1318",
             "description": "Next.js encountered uncached data during prerendering.",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/client-awaited-io/client.tsx (6:19) @ Client
           > 6 |   const data = use(io)
               |                   ^",
             "stack": [
               "Client app/client-awaited-io/client.tsx (6:19)",
               "Page app/client-awaited-io/page.tsx (5:10)",
             ],
           }
          `)
        })
      } else {
        it('should error the build if IO is accessed in a Client Component', async () => {
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
               "Error: Route "/client-awaited-io": Next.js encountered uncached or runtime data during prerendering.

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
                   at Client (app/client-awaited-io/client.tsx:6:19)
                   at Page (app/client-awaited-io/page.tsx:5:10)
                 4 |
                 5 | export function Client({ io }: { io: Promise<string> }) {
               > 6 |   const data = use(io)
                   |                   ^
                 7 |   return <div>Data: {data}</div>
                 8 | }
                 9 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-awaited-io" in your browser to investigate the error.
               Error occurred prerendering page "/client-awaited-io". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/client-awaited-io/page: /client-awaited-io"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/client-awaited-io": Next.js encountered uncached or runtime data during prerendering.

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
                   at <unknown> (app/client-awaited-io/client.tsx:5:26)
                   at body (<anonymous>)
                   at html (<anonymous>)
                 3 | import { use } from 'react'
                 4 |
               > 5 | export function Client({ io }: { io: Promise<string> }) {
                   |                          ^
                 6 |   const data = use(io)
                 7 |   return <div>Data: {data}</div>
                 8 | }
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/client-awaited-io" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/client-awaited-io". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /client-awaited-io/page: /client-awaited-io, exiting the build."
              `)
            }
          } else {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/client-awaited-io": Next.js encountered uncached or runtime data during prerendering.

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
                   at Client (webpack:///app/client-awaited-io/client.tsx:6:19)
                   at Page (webpack:///app/client-awaited-io/page.tsx:5:10)
                 4 |
                 5 | export function Client({ io }: { io: Promise<string> }) {
               > 6 |   const data = use(io)
                   |                   ^
                 7 |   return <div>Data: {data}</div>
                 8 | }
                 9 |
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-awaited-io" in your browser to investigate the error.
               Error occurred prerendering page "/client-awaited-io". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/client-awaited-io/page: /client-awaited-io"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/client-awaited-io": Next.js encountered uncached or runtime data during prerendering.

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
                   at body (<anonymous>)
                   at html (<anonymous>)
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/client-awaited-io" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/client-awaited-io". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /client-awaited-io/page: /client-awaited-io, exiting the build."
              `)
            }
          }
        })
      }
    })

    describe('useSearchParams in Client Components', () => {
      const pathname = '/client-use-search-params'

      if (isNextDev) {
        it('should show a collapsed redbox error', async () => {
          const browser = await next.browser(pathname)

          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "code": "E1316",
             "description": "Next.js encountered URL data useSearchParams() in a Client Component outside of Suspense.",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/client-use-search-params/client.tsx (6:18) @ Client
           > 6 |   useSearchParams()
               |                  ^",
             "stack": [
               "Client app/client-use-search-params/client.tsx (6:18)",
               "Page app/client-use-search-params/page.tsx (4:10)",
             ],
           }
          `)
        })
      } else {
        it('should error the build if useSearchParams is accessed in a Client Component', async () => {
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
               "Error: Route "/client-use-search-params": Next.js encountered URL data \`useSearchParams()\` in a Client Component outside of \`<Suspense>\`.

               This blocks prerendering because the value is only available at runtime.

               Ways to fix this:
                 - [stream] Wrap the component in \`<Suspense fallback={...}>\` so the hook value streams in after prerendering
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense
                 - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route
                   at Client (app/client-use-search-params/client.tsx:6:18)
                   at Page (app/client-use-search-params/page.tsx:4:10)
                 4 |
                 5 | export function Client() {
               > 6 |   useSearchParams()
                   |                  ^
                 7 |   return <p>hello world</p>
                 8 | }
                 9 | {
                 digest: 'CLIENT_HOOK_DYNAMIC'
               }
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-use-search-params" in your browser to investigate the error.
               Error occurred prerendering page "/client-use-search-params". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/client-use-search-params/page: /client-use-search-params"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/client-use-search-params": Next.js encountered URL data \`useSearchParams()\` in a Client Component outside of \`<Suspense>\`.

               This blocks prerendering because the value is only available at runtime.

               Ways to fix this:
                 - [stream] Wrap the component in \`<Suspense fallback={...}>\` so the hook value streams in after prerendering
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense
                 - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route
                   at <unknown> (app/client-use-search-params/client.tsx:6:3)
                   at body (<anonymous>)
                   at html (<anonymous>)
                 4 |
                 5 | export function Client() {
               > 6 |   useSearchParams()
                   |   ^
                 7 |   return <p>hello world</p>
                 8 | }
                 9 | {
                 digest: 'CLIENT_HOOK_DYNAMIC'
               }
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/client-use-search-params" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/client-use-search-params". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /client-use-search-params/page: /client-use-search-params, exiting the build."
              `)
            }
          } else {
            if (isDebugPrerender) {
              // Webpack debug-prerender stack points into next-src internals;
              // snapshot is too noisy and webpack is legacy.
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/client-use-search-params": Next.js encountered URL data \`useSearchParams()\` in a Client Component outside of \`<Suspense>\`.

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
                   at body (<anonymous>)
                   at html (<anonymous>) {
                 digest: 'CLIENT_HOOK_DYNAMIC'
               }
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/client-use-search-params" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/client-use-search-params". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /client-use-search-params/page: /client-use-search-params, exiting the build."
              `)
            }
          }
        })
      }
    })

    describe('usePathname in Client Components', () => {
      const pathname = '/client-use-pathname/[id]'
      const visitUrl = '/client-use-pathname/some-id'

      if (isNextDev) {
        it('should show a collapsed redbox error', async () => {
          const browser = await next.browser(visitUrl)

          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "code": "E1315",
             "description": "Next.js encountered URL data usePathname() in a Client Component outside of Suspense.",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/client-use-pathname/[id]/client.tsx (6:14) @ Client
           > 6 |   usePathname()
               |              ^",
             "stack": [
               "Client app/client-use-pathname/[id]/client.tsx (6:14)",
               "Page app/client-use-pathname/[id]/page.tsx (4:10)",
             ],
           }
          `)
        })
      } else {
        it('should error the build if usePathname is accessed in a Client Component', async () => {
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
               "Error: Route "/client-use-pathname/[id]": Next.js encountered URL data \`usePathname()\` in a Client Component outside of \`<Suspense>\`.

               This blocks prerendering because the value is only available at runtime.

               Ways to fix this:
                 - [stream] Wrap the component in \`<Suspense fallback={...}>\` so the hook value streams in after prerendering
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense
                 - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route
                   at Client (app/client-use-pathname/[id]/client.tsx:6:14)
                   at Page (app/client-use-pathname/[id]/page.tsx:4:10)
                 4 |
                 5 | export function Client() {
               > 6 |   usePathname()
                   |              ^
                 7 |   return <p>hello world</p>
                 8 | }
                 9 | {
                 digest: 'CLIENT_HOOK_DYNAMIC'
               }
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/client-use-pathname/[id]" in your browser to investigate the error.
               Error occurred prerendering page "/client-use-pathname/[id]". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/client-use-pathname/[id]/page: /client-use-pathname/[id]"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/client-use-pathname/[id]": Next.js encountered URL data \`usePathname()\` in a Client Component outside of \`<Suspense>\`.

               This blocks prerendering because the value is only available at runtime.

               Ways to fix this:
                 - [stream] Wrap the component in \`<Suspense fallback={...}>\` so the hook value streams in after prerendering
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense
                 - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route
                   at <unknown> (app/client-use-pathname/[id]/client.tsx:6:3)
                   at body (<anonymous>)
                   at html (<anonymous>)
                 4 |
                 5 | export function Client() {
               > 6 |   usePathname()
                   |   ^
                 7 |   return <p>hello world</p>
                 8 | }
                 9 | {
                 digest: 'CLIENT_HOOK_DYNAMIC'
               }
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/client-use-pathname/[id]" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/client-use-pathname/[id]". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /client-use-pathname/[id]/page: /client-use-pathname/[id], exiting the build."
              `)
            }
          } else {
            if (isDebugPrerender) {
              // Webpack debug-prerender stack points into next-src internals;
              // snapshot is too noisy and webpack is legacy.
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/client-use-pathname/[id]": Next.js encountered URL data \`usePathname()\` in a Client Component outside of \`<Suspense>\`.

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
                   at body (<anonymous>)
                   at html (<anonymous>) {
                 digest: 'CLIENT_HOOK_DYNAMIC'
               }
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/client-use-pathname/[id]" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/client-use-pathname/[id]". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /client-use-pathname/[id]/page: /client-use-pathname/[id], exiting the build."
              `)
            }
          }
        })
      }
    })
  })
})
