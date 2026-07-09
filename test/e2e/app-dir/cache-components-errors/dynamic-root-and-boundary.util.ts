import { isNextDev } from 'e2e-utils'
import { waitForNoErrorToast } from 'next-test-utils'
import { getPrerenderOutput } from './utils'
import type { CacheComponentsErrorsContext } from './shared.util'

export function registerDynamicRootAndBoundaryTests(
  ctx: CacheComponentsErrorsContext
) {
  const { next, isTurbopack, isDebugPrerender, prerender } = ctx

  let cliOutputLength: number
  beforeEach(() => {
    cliOutputLength = next.cliOutput.length
  })

  describe('Static Route', () => {
    const pathname = '/static'

    if (isNextDev) {
      it('should not show a collapsed redbox error', async () => {
        const browser = await next.browser(pathname)
        await waitForNoErrorToast(browser)
      })
    } else {
      it('should not error the build when all routes are static', async () => {
        try {
          await prerender(pathname)
        } catch (error) {
          throw new Error('expected build not to fail', { cause: error })
        }
      })
    }
  })

  describe('Dynamic Root', () => {
    const pathname = '/dynamic-root'

    if (isNextDev) {
      it('should show a collapsed redbox with two errors', async () => {
        const browser = await next.browser(pathname)

        await expect(browser).toDisplayCollapsedRedbox(`
           [
             {
               "code": "E1401",
               "description": "Next.js encountered uncached data during prerendering.",
               "environmentLabel": "Server",
               "label": "Blocking Route",
               "source": "app/dynamic-root/page.tsx (63:26) @ fetchRandom
           > 63 |   const response = await fetch(
                |                          ^",
               "stack": [
                 "fetchRandom app/dynamic-root/page.tsx (63:26)",
                 "FetchingComponent app/dynamic-root/page.tsx (46:50)",
                 "Page app/dynamic-root/page.tsx (23:9)",
               ],
             },
             {
               "code": "E1401",
               "description": "Next.js encountered uncached data during prerendering.",
               "environmentLabel": "Server",
               "label": "Blocking Route",
               "source": "app/dynamic-root/page.tsx (63:26) @ fetchRandom
           > 63 |   const response = await fetch(
                |                          ^",
               "stack": [
                 "fetchRandom app/dynamic-root/page.tsx (63:26)",
                 "FetchingComponent app/dynamic-root/page.tsx (46:50)",
                 "Page app/dynamic-root/page.tsx (28:7)",
               ],
             },
           ]
          `)
      })
    } else {
      it('should error the build if cache components happens in the root (outside a Suspense)', async () => {
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
               "Error: Route "/dynamic-root": Next.js encountered uncached or runtime data during prerendering.

               \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

               Ways to fix this:
                 - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                 - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                 - [block] Set \`export const instant = false\` to allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                   at fetchRandom (app/dynamic-root/page.tsx:62:16)
                   at FetchingComponent (app/dynamic-root/page.tsx:46:56)
                   at Page (app/dynamic-root/page.tsx:23:9)
                 60 |   // Hide uncached I/O behind a runtime API call, to ensure we still get the
                 61 |   // correct owner stack for the error.
               > 62 |   await cookies()
                    |                ^
                 63 |   const response = await fetch(
                 64 |     'https://next-data-api-endpoint.vercel.app/api/random?b=' + entropy
                 65 |   )
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/dynamic-root" in your browser to investigate the error.
               Error: Route "/dynamic-root": Next.js encountered uncached or runtime data during prerendering.

               \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

               Ways to fix this:
                 - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                 - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                 - [block] Set \`export const instant = false\` to allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                   at fetchRandom (app/dynamic-root/page.tsx:62:16)
                   at FetchingComponent (app/dynamic-root/page.tsx:46:56)
                   at Page (app/dynamic-root/page.tsx:28:7)
                 60 |   // Hide uncached I/O behind a runtime API call, to ensure we still get the
                 61 |   // correct owner stack for the error.
               > 62 |   await cookies()
                    |                ^
                 63 |   const response = await fetch(
                 64 |     'https://next-data-api-endpoint.vercel.app/api/random?b=' + entropy
                 65 |   )
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/dynamic-root" in your browser to investigate the error.
               Error occurred prerendering page "/dynamic-root". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/dynamic-root/page: /dynamic-root"
              `)
          } else {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/dynamic-root": Next.js encountered uncached or runtime data during prerendering.

               \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

               Ways to fix this:
                 - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                 - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                 - [block] Set \`export const instant = false\` to allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                   at <unknown> (app/dynamic-root/indirection.tsx:7:34)
                   at main (<anonymous>)
                   at body (<anonymous>)
                   at html (<anonymous>)
                  5 | }
                  6 |
               >  7 | export function IndirectionTwo({ children }) {
                    |                                  ^
                  8 |   return children
                  9 | }
                 10 |
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/dynamic-root" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error: Route "/dynamic-root": Next.js encountered uncached or runtime data during prerendering.

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
                 - Start the app in development mode by running \`next dev\`, then open "/dynamic-root" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/dynamic-root". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /dynamic-root/page: /dynamic-root, exiting the build."
              `)
          }
        } else {
          if (isDebugPrerender) {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/dynamic-root": Next.js encountered uncached or runtime data during prerendering.

               \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

               Ways to fix this:
                 - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                 - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                 - [block] Set \`export const instant = false\` to allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                   at fetchRandom (webpack:///app/dynamic-root/page.tsx:62:16)
                   at FetchingComponent (webpack:///app/dynamic-root/page.tsx:46:56)
                   at Page (webpack:///app/dynamic-root/page.tsx:23:9)
                 60 |   // Hide uncached I/O behind a runtime API call, to ensure we still get the
                 61 |   // correct owner stack for the error.
               > 62 |   await cookies()
                    |                ^
                 63 |   const response = await fetch(
                 64 |     'https://next-data-api-endpoint.vercel.app/api/random?b=' + entropy
                 65 |   )
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/dynamic-root" in your browser to investigate the error.
               Error: Route "/dynamic-root": Next.js encountered uncached or runtime data during prerendering.

               \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

               Ways to fix this:
                 - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                 - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                 - [block] Set \`export const instant = false\` to allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                   at fetchRandom (webpack:///app/dynamic-root/page.tsx:62:16)
                   at FetchingComponent (webpack:///app/dynamic-root/page.tsx:46:56)
                   at Page (webpack:///app/dynamic-root/page.tsx:28:7)
                 60 |   // Hide uncached I/O behind a runtime API call, to ensure we still get the
                 61 |   // correct owner stack for the error.
               > 62 |   await cookies()
                    |                ^
                 63 |   const response = await fetch(
                 64 |     'https://next-data-api-endpoint.vercel.app/api/random?b=' + entropy
                 65 |   )
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/dynamic-root" in your browser to investigate the error.
               Error occurred prerendering page "/dynamic-root". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/dynamic-root/page: /dynamic-root"
              `)
          } else {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/dynamic-root": Next.js encountered uncached or runtime data during prerendering.

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
                   at k (<next-dist-dir>)
                   at main (<anonymous>)
                   at body (<anonymous>)
                   at html (<anonymous>)
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
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/dynamic-root" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error: Route "/dynamic-root": Next.js encountered uncached or runtime data during prerendering.

               \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

               Ways to fix this:
                 - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                 - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                 - [block] Set \`export const instant = false\` to allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
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
                   at main (<anonymous>)
                   at body (<anonymous>)
                   at html (<anonymous>)
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
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/dynamic-root" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/dynamic-root". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /dynamic-root/page: /dynamic-root, exiting the build."
              `)
          }
        }
      })
    }
  })

  describe('Dynamic Boundary', () => {
    const pathname = '/dynamic-boundary'

    if (isNextDev) {
      it('should not show a collapsed redbox error', async () => {
        const browser = await next.browser(pathname)
        await waitForNoErrorToast(browser)
      })
    } else {
      it('should partially prerender when all dynamic components are inside a Suspense boundary', async () => {
        try {
          await prerender(pathname)
        } catch (error) {
          throw new Error('expected build not to fail', { cause: error })
        }

        expect(next.cliOutput).toContain(`◐ ${pathname}`)
        await next.start({ skipBuild: true })
        const $ = await next.render$(pathname)
        expect($('[data-fallback]').length).toBe(2)
      })
    }
  })
}
