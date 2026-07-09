import { isNextDev } from 'e2e-utils'
import { waitForNoErrorToast } from 'next-test-utils'
import { getPrerenderOutput } from './utils'
import type { CacheComponentsErrorsContext } from './shared.util'

export function registerMetadataAndViewportTests(
  ctx: CacheComponentsErrorsContext
) {
  const { next, isTurbopack, isDebugPrerender, prerender } = ctx

  let cliOutputLength: number
  beforeEach(() => {
    cliOutputLength = next.cliOutput.length
  })

  describe('Dynamic Metadata - Static Route', () => {
    const pathname = '/dynamic-metadata-static-route'

    if (isNextDev) {
      it('should show a collapsed redbox error', async () => {
        const browser = await next.browser(pathname)

        await expect(browser).toDisplayCollapsedRedbox(`
           {
             "code": "E1370",
             "description": "Next.js encountered uncached data in generateMetadata().",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/dynamic-metadata-static-route/page.tsx (2:9) @ Module.generateMetadata
           > 2 |   await new Promise((r) => setTimeout(r, 0))
               |         ^",
             "stack": [
               "Module.generateMetadata app/dynamic-metadata-static-route/page.tsx (2:9)",
             ],
           }
          `)
      })
    } else {
      it('should error the build if generateMetadata is dynamic when the rest of the route is prerenderable', async () => {
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
          expect(output).toMatchInlineSnapshot(`
             "Route "/dynamic-metadata-static-route": Next.js encountered uncached or runtime data in \`generateMetadata()\`.

             This route's metadata is blocked, but the rest of its content can be prerendered.

             Ways to fix this:
               - [static] Use a static metadata export instead of \`generateMetadata()\`
                 https://nextjs.org/docs/messages/blocking-prerender-metadata-runtime#use-static-metadata
               - [cache] Cache the metadata with \`"use cache"\` in \`generateMetadata()\` (does not apply to \`connection()\`)
                 https://nextjs.org/docs/messages/blocking-prerender-metadata-dynamic#cache-the-metadata
               - [dynamic] Render a marker component that calls \`await connection()\` inside \`<Suspense>\` on the page
                 https://nextjs.org/docs/messages/blocking-prerender-metadata-dynamic#mark-the-route-as-dynamic
             Error occurred prerendering page "/dynamic-metadata-static-route". Read more: https://nextjs.org/docs/messages/prerender-error

             > Export encountered errors on 1 path:
             	/dynamic-metadata-static-route/page: /dynamic-metadata-static-route"
            `)
        } else {
          expect(output).toMatchInlineSnapshot(`
             "Route "/dynamic-metadata-static-route": Next.js encountered uncached or runtime data in \`generateMetadata()\`.

             This route's metadata is blocked, but the rest of its content can be prerendered.

             Ways to fix this:
               - [static] Use a static metadata export instead of \`generateMetadata()\`
                 https://nextjs.org/docs/messages/blocking-prerender-metadata-runtime#use-static-metadata
               - [cache] Cache the metadata with \`"use cache"\` in \`generateMetadata()\` (does not apply to \`connection()\`)
                 https://nextjs.org/docs/messages/blocking-prerender-metadata-dynamic#cache-the-metadata
               - [dynamic] Render a marker component that calls \`await connection()\` inside \`<Suspense>\` on the page
                 https://nextjs.org/docs/messages/blocking-prerender-metadata-dynamic#mark-the-route-as-dynamic
             Error occurred prerendering page "/dynamic-metadata-static-route". Read more: https://nextjs.org/docs/messages/prerender-error
             Export encountered an error on /dynamic-metadata-static-route/page: /dynamic-metadata-static-route, exiting the build."
            `)
        }
      })
    }
  })

  describe('Dynamic Metadata - Error Route', () => {
    const pathname = '/dynamic-metadata-error-route'

    if (isNextDev) {
      it('should show a collapsed redbox error', async () => {
        const browser = await next.browser(pathname)

        await expect(browser).toDisplayCollapsedRedbox(`
           {
             "code": "E1401",
             "description": "Next.js encountered uncached data during prerendering.",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/dynamic-metadata-error-route/page.tsx (21:9) @ Dynamic
           > 21 |   await new Promise((r) => setTimeout(r))
                |         ^",
             "stack": [
               "Dynamic app/dynamic-metadata-error-route/page.tsx (21:9)",
               "Page app/dynamic-metadata-error-route/page.tsx (15:7)",
             ],
           }
          `)
      })
    } else {
      // This test is just here because there was a bug when dynamic metadata was used alongside another cache components violation which caused the validation to be skipped.
      it('should error the build for the correct reason when there is a cache components violation alongside dynamic metadata', async () => {
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
               "Error: Route "/dynamic-metadata-error-route": Next.js encountered uncached or runtime data during prerendering.

               \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

               Ways to fix this:
                 - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                 - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                 - [block] Set \`export const instant = false\` to allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                   at Dynamic (app/dynamic-metadata-error-route/page.tsx:20:16)
                   at Page (app/dynamic-metadata-error-route/page.tsx:15:7)
                 18 | }
                 19 |
               > 20 | async function Dynamic() {
                    |                ^
                 21 |   await new Promise((r) => setTimeout(r))
                 22 |   return <p id="dynamic">Dynamic</p>
                 23 | }
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/dynamic-metadata-error-route" in your browser to investigate the error.
               Error occurred prerendering page "/dynamic-metadata-error-route". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/dynamic-metadata-error-route/page: /dynamic-metadata-error-route"
              `)
          } else {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/dynamic-metadata-error-route": Next.js encountered uncached or runtime data during prerendering.

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
                 - Start the app in development mode by running \`next dev\`, then open "/dynamic-metadata-error-route" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/dynamic-metadata-error-route". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /dynamic-metadata-error-route/page: /dynamic-metadata-error-route, exiting the build."
              `)
          }
        } else {
          if (isDebugPrerender) {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/dynamic-metadata-error-route": Next.js encountered uncached or runtime data during prerendering.

               \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

               Ways to fix this:
                 - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
                 - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
                 - [block] Set \`export const instant = false\` to allow a blocking route
                   https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
                   at Dynamic (webpack:///app/dynamic-metadata-error-route/page.tsx:20:16)
                   at Page (webpack:///app/dynamic-metadata-error-route/page.tsx:15:7)
                 18 | }
                 19 |
               > 20 | async function Dynamic() {
                    |                ^
                 21 |   await new Promise((r) => setTimeout(r))
                 22 |   return <p id="dynamic">Dynamic</p>
                 23 | }
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/dynamic-metadata-error-route" in your browser to investigate the error.
               Error occurred prerendering page "/dynamic-metadata-error-route". Read more: https://nextjs.org/docs/messages/prerender-error

               > Export encountered errors on 1 path:
               	/dynamic-metadata-error-route/page: /dynamic-metadata-error-route"
              `)
          } else {
            expect(output).toMatchInlineSnapshot(`
               "Error: Route "/dynamic-metadata-error-route": Next.js encountered uncached or runtime data during prerendering.

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
                 - Start the app in development mode by running \`next dev\`, then open "/dynamic-metadata-error-route" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
               Error occurred prerendering page "/dynamic-metadata-error-route". Read more: https://nextjs.org/docs/messages/prerender-error
               Export encountered an error on /dynamic-metadata-error-route/page: /dynamic-metadata-error-route, exiting the build."
              `)
          }
        }
      })
    }
  })

  describe('Dynamic Metadata - Static Route With Suspense', () => {
    const pathname = '/dynamic-metadata-static-with-suspense'

    if (isNextDev) {
      it('should show a collapsed redbox error', async () => {
        const browser = await next.browser(pathname)

        await expect(browser).toDisplayCollapsedRedbox(`
           {
             "code": "E1370",
             "description": "Next.js encountered uncached data in generateMetadata().",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/dynamic-metadata-static-with-suspense/page.tsx (2:9) @ Module.generateMetadata
           > 2 |   await new Promise((r) => setTimeout(r, 0))
               |         ^",
             "stack": [
               "Module.generateMetadata app/dynamic-metadata-static-with-suspense/page.tsx (2:9)",
             ],
           }
          `)
      })
    } else {
      it('should error the build if generateMetadata is dynamic when the rest of the route is prerenderable', async () => {
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
          expect(output).toMatchInlineSnapshot(`
             "Route "/dynamic-metadata-static-with-suspense": Next.js encountered uncached or runtime data in \`generateMetadata()\`.

             This route's metadata is blocked, but the rest of its content can be prerendered.

             Ways to fix this:
               - [static] Use a static metadata export instead of \`generateMetadata()\`
                 https://nextjs.org/docs/messages/blocking-prerender-metadata-runtime#use-static-metadata
               - [cache] Cache the metadata with \`"use cache"\` in \`generateMetadata()\` (does not apply to \`connection()\`)
                 https://nextjs.org/docs/messages/blocking-prerender-metadata-dynamic#cache-the-metadata
               - [dynamic] Render a marker component that calls \`await connection()\` inside \`<Suspense>\` on the page
                 https://nextjs.org/docs/messages/blocking-prerender-metadata-dynamic#mark-the-route-as-dynamic
             Error occurred prerendering page "/dynamic-metadata-static-with-suspense". Read more: https://nextjs.org/docs/messages/prerender-error

             > Export encountered errors on 1 path:
             	/dynamic-metadata-static-with-suspense/page: /dynamic-metadata-static-with-suspense"
            `)
        } else {
          expect(output).toMatchInlineSnapshot(`
             "Route "/dynamic-metadata-static-with-suspense": Next.js encountered uncached or runtime data in \`generateMetadata()\`.

             This route's metadata is blocked, but the rest of its content can be prerendered.

             Ways to fix this:
               - [static] Use a static metadata export instead of \`generateMetadata()\`
                 https://nextjs.org/docs/messages/blocking-prerender-metadata-runtime#use-static-metadata
               - [cache] Cache the metadata with \`"use cache"\` in \`generateMetadata()\` (does not apply to \`connection()\`)
                 https://nextjs.org/docs/messages/blocking-prerender-metadata-dynamic#cache-the-metadata
               - [dynamic] Render a marker component that calls \`await connection()\` inside \`<Suspense>\` on the page
                 https://nextjs.org/docs/messages/blocking-prerender-metadata-dynamic#mark-the-route-as-dynamic
             Error occurred prerendering page "/dynamic-metadata-static-with-suspense". Read more: https://nextjs.org/docs/messages/prerender-error
             Export encountered an error on /dynamic-metadata-static-with-suspense/page: /dynamic-metadata-static-with-suspense, exiting the build."
            `)
        }
      })
    }
  })

  describe('Dynamic Metadata - Static Route With Suspense Above Body', () => {
    const pathname = '/dynamic-metadata-static-with-suspense-above-body'

    if (isNextDev) {
      it('should show a collapsed redbox error', async () => {
        const browser = await next.browser(pathname)

        await expect(browser).toDisplayCollapsedRedbox(`
           {
             "code": "E1370",
             "description": "Next.js encountered uncached data in generateMetadata().",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/dynamic-metadata-static-with-suspense-above-body/page.tsx (2:9) @ Module.generateMetadata
           > 2 |   await new Promise((r) => setTimeout(r, 0))
               |         ^",
             "stack": [
               "Module.generateMetadata app/dynamic-metadata-static-with-suspense-above-body/page.tsx (2:9)",
             ],
           }
          `)
      })
    } else {
      it('should error the build because Suspense above body is not a documented mitigation for dynamic generateMetadata', async () => {
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
          expect(output).toMatchInlineSnapshot(`
             "Route "/dynamic-metadata-static-with-suspense-above-body": Next.js encountered uncached or runtime data in \`generateMetadata()\`.

             This route's metadata is blocked, but the rest of its content can be prerendered.

             Ways to fix this:
               - [static] Use a static metadata export instead of \`generateMetadata()\`
                 https://nextjs.org/docs/messages/blocking-prerender-metadata-runtime#use-static-metadata
               - [cache] Cache the metadata with \`"use cache"\` in \`generateMetadata()\` (does not apply to \`connection()\`)
                 https://nextjs.org/docs/messages/blocking-prerender-metadata-dynamic#cache-the-metadata
               - [dynamic] Render a marker component that calls \`await connection()\` inside \`<Suspense>\` on the page
                 https://nextjs.org/docs/messages/blocking-prerender-metadata-dynamic#mark-the-route-as-dynamic
             Error occurred prerendering page "/dynamic-metadata-static-with-suspense-above-body". Read more: https://nextjs.org/docs/messages/prerender-error

             > Export encountered errors on 1 path:
             	/dynamic-metadata-static-with-suspense-above-body/page: /dynamic-metadata-static-with-suspense-above-body"
            `)
        } else {
          expect(output).toMatchInlineSnapshot(`
             "Route "/dynamic-metadata-static-with-suspense-above-body": Next.js encountered uncached or runtime data in \`generateMetadata()\`.

             This route's metadata is blocked, but the rest of its content can be prerendered.

             Ways to fix this:
               - [static] Use a static metadata export instead of \`generateMetadata()\`
                 https://nextjs.org/docs/messages/blocking-prerender-metadata-runtime#use-static-metadata
               - [cache] Cache the metadata with \`"use cache"\` in \`generateMetadata()\` (does not apply to \`connection()\`)
                 https://nextjs.org/docs/messages/blocking-prerender-metadata-dynamic#cache-the-metadata
               - [dynamic] Render a marker component that calls \`await connection()\` inside \`<Suspense>\` on the page
                 https://nextjs.org/docs/messages/blocking-prerender-metadata-dynamic#mark-the-route-as-dynamic
             Error occurred prerendering page "/dynamic-metadata-static-with-suspense-above-body". Read more: https://nextjs.org/docs/messages/prerender-error
             Export encountered an error on /dynamic-metadata-static-with-suspense-above-body/page: /dynamic-metadata-static-with-suspense-above-body, exiting the build."
            `)
        }
      })
    }
  })

  describe('Dynamic Metadata - Static Route With instant = false', () => {
    const pathname = '/dynamic-metadata-static-with-instant-false'

    if (isNextDev) {
      it('should show a collapsed redbox error', async () => {
        const browser = await next.browser(pathname)

        await expect(browser).toDisplayCollapsedRedbox(`
           {
             "code": "E1370",
             "description": "Next.js encountered uncached data in generateMetadata().",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/dynamic-metadata-static-with-instant-false/page.tsx (4:9) @ Module.generateMetadata
           > 4 |   await new Promise((r) => setTimeout(r, 0))
               |         ^",
             "stack": [
               "Module.generateMetadata app/dynamic-metadata-static-with-instant-false/page.tsx (4:9)",
             ],
           }
          `)
      })
    } else {
      it('should error the build because instant = false is not a documented mitigation for dynamic generateMetadata', async () => {
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
          expect(output).toMatchInlineSnapshot(`
             "Route "/dynamic-metadata-static-with-instant-false": Next.js encountered uncached or runtime data in \`generateMetadata()\`.

             This route's metadata is blocked, but the rest of its content can be prerendered.

             Ways to fix this:
               - [static] Use a static metadata export instead of \`generateMetadata()\`
                 https://nextjs.org/docs/messages/blocking-prerender-metadata-runtime#use-static-metadata
               - [cache] Cache the metadata with \`"use cache"\` in \`generateMetadata()\` (does not apply to \`connection()\`)
                 https://nextjs.org/docs/messages/blocking-prerender-metadata-dynamic#cache-the-metadata
               - [dynamic] Render a marker component that calls \`await connection()\` inside \`<Suspense>\` on the page
                 https://nextjs.org/docs/messages/blocking-prerender-metadata-dynamic#mark-the-route-as-dynamic
             Error occurred prerendering page "/dynamic-metadata-static-with-instant-false". Read more: https://nextjs.org/docs/messages/prerender-error

             > Export encountered errors on 1 path:
             	/dynamic-metadata-static-with-instant-false/page: /dynamic-metadata-static-with-instant-false"
            `)
        } else {
          expect(output).toMatchInlineSnapshot(`
             "Route "/dynamic-metadata-static-with-instant-false": Next.js encountered uncached or runtime data in \`generateMetadata()\`.

             This route's metadata is blocked, but the rest of its content can be prerendered.

             Ways to fix this:
               - [static] Use a static metadata export instead of \`generateMetadata()\`
                 https://nextjs.org/docs/messages/blocking-prerender-metadata-runtime#use-static-metadata
               - [cache] Cache the metadata with \`"use cache"\` in \`generateMetadata()\` (does not apply to \`connection()\`)
                 https://nextjs.org/docs/messages/blocking-prerender-metadata-dynamic#cache-the-metadata
               - [dynamic] Render a marker component that calls \`await connection()\` inside \`<Suspense>\` on the page
                 https://nextjs.org/docs/messages/blocking-prerender-metadata-dynamic#mark-the-route-as-dynamic
             Error occurred prerendering page "/dynamic-metadata-static-with-instant-false". Read more: https://nextjs.org/docs/messages/prerender-error
             Export encountered an error on /dynamic-metadata-static-with-instant-false/page: /dynamic-metadata-static-with-instant-false, exiting the build."
            `)
        }
      })
    }
  })

  describe('Dynamic Metadata - Dynamic Route', () => {
    const pathname = '/dynamic-metadata-dynamic-route'

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
        expect($('#dynamic').text()).toBe('Dynamic')
        expect($('[data-fallback]').length).toBe(1)
      })
    }
  })

  describe('Dynamic Viewport - Static Route', () => {
    const pathname = '/dynamic-viewport-static-route'

    if (isNextDev) {
      it('should show a collapsed redbox error', async () => {
        const browser = await next.browser(pathname)

        await expect(browser).toDisplayCollapsedRedbox(`
           {
             "code": "E1395",
             "description": "Next.js encountered uncached data in generateViewport().",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/dynamic-viewport-static-route/page.tsx (2:9) @ Module.generateViewport
           > 2 |   await new Promise((r) => setTimeout(r, 0))
               |         ^",
             "stack": [
               "Module.generateViewport app/dynamic-viewport-static-route/page.tsx (2:9)",
             ],
           }
          `)
      })
    } else {
      it('should error the build if generateViewport is dynamic', async () => {
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
          expect(output).toMatchInlineSnapshot(`
             "Route "/dynamic-viewport-static-route": Next.js encountered uncached or runtime data in \`generateViewport()\`.

             This prevents the page from being prerendered, leading to a slower user experience. Unlike metadata, viewport cannot be streamed behind \`<Suspense>\` because it affects the initial page load.

             Ways to fix this:
               - [static] Use a static viewport export instead of \`generateViewport()\`
                 https://nextjs.org/docs/messages/blocking-prerender-viewport-runtime#use-static-viewport
               - [cache] For uncached data (\`fetch\`, database calls): cache the viewport with \`"use cache"\` in \`generateViewport()\` (does not apply to \`connection()\`)
                 https://nextjs.org/docs/messages/blocking-prerender-viewport-dynamic#cache-the-viewport-data
               - [block] Set \`export const instant = false\` to allow a blocking route
                 https://nextjs.org/docs/messages/blocking-prerender-viewport-dynamic#allow-blocking-route
             Error occurred prerendering page "/dynamic-viewport-static-route". Read more: https://nextjs.org/docs/messages/prerender-error

             > Export encountered errors on 1 path:
             	/dynamic-viewport-static-route/page: /dynamic-viewport-static-route"
            `)
        } else {
          expect(output).toMatchInlineSnapshot(`
             "Route "/dynamic-viewport-static-route": Next.js encountered uncached or runtime data in \`generateViewport()\`.

             This prevents the page from being prerendered, leading to a slower user experience. Unlike metadata, viewport cannot be streamed behind \`<Suspense>\` because it affects the initial page load.

             Ways to fix this:
               - [static] Use a static viewport export instead of \`generateViewport()\`
                 https://nextjs.org/docs/messages/blocking-prerender-viewport-runtime#use-static-viewport
               - [cache] For uncached data (\`fetch\`, database calls): cache the viewport with \`"use cache"\` in \`generateViewport()\` (does not apply to \`connection()\`)
                 https://nextjs.org/docs/messages/blocking-prerender-viewport-dynamic#cache-the-viewport-data
               - [block] Set \`export const instant = false\` to allow a blocking route
                 https://nextjs.org/docs/messages/blocking-prerender-viewport-dynamic#allow-blocking-route
             Error occurred prerendering page "/dynamic-viewport-static-route". Read more: https://nextjs.org/docs/messages/prerender-error
             Export encountered an error on /dynamic-viewport-static-route/page: /dynamic-viewport-static-route, exiting the build."
            `)
        }
      })
    }
  })

  describe('Dynamic Viewport - Static Route With Suspense Above Body', () => {
    const pathname = '/dynamic-viewport-static-with-suspense'

    if (isNextDev) {
      it('should not show a collapsed redbox error', async () => {
        const browser = await next.browser(pathname)
        await waitForNoErrorToast(browser)
      })
    } else {
      it('should not error the build when generateViewport is dynamic and the root layout wraps body in Suspense', async () => {
        try {
          await prerender(pathname)
        } catch (error) {
          throw new Error('expected build not to fail', { cause: error })
        }
      })
    }
  })

  describe('Dynamic Viewport - Static Route With instant = false', () => {
    const pathname = '/dynamic-viewport-static-with-instant-false'

    if (isNextDev) {
      it('should not show a collapsed redbox error', async () => {
        const browser = await next.browser(pathname)
        await waitForNoErrorToast(browser)
      })
    } else {
      it('should not error the build when generateViewport is dynamic and the page opts into blocking via instant = false', async () => {
        try {
          await prerender(pathname)
        } catch (error) {
          throw new Error('expected build not to fail', { cause: error })
        }
      })
    }
  })

  describe('Dynamic Viewport - Dynamic Route', () => {
    const pathname = '/dynamic-viewport-dynamic-route'

    if (isNextDev) {
      it('should show a collapsed redbox error', async () => {
        const browser = await next.browser(pathname)

        await expect(browser).toDisplayCollapsedRedbox(`
           {
             "code": "E1395",
             "description": "Next.js encountered uncached data in generateViewport().",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/dynamic-viewport-dynamic-route/page.tsx (4:9) @ Module.generateViewport
           > 4 |   await new Promise((r) => setTimeout(r, 0))
               |         ^",
             "stack": [
               "Module.generateViewport app/dynamic-viewport-dynamic-route/page.tsx (4:9)",
             ],
           }
          `)
      })
    } else {
      it('should error the build if generateViewport is dynamic even if there are other uses of dynamic on the page', async () => {
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
          expect(output).toMatchInlineSnapshot(`
             "Route "/dynamic-viewport-dynamic-route": Next.js encountered uncached or runtime data in \`generateViewport()\`.

             This prevents the page from being prerendered, leading to a slower user experience. Unlike metadata, viewport cannot be streamed behind \`<Suspense>\` because it affects the initial page load.

             Ways to fix this:
               - [static] Use a static viewport export instead of \`generateViewport()\`
                 https://nextjs.org/docs/messages/blocking-prerender-viewport-runtime#use-static-viewport
               - [cache] For uncached data (\`fetch\`, database calls): cache the viewport with \`"use cache"\` in \`generateViewport()\` (does not apply to \`connection()\`)
                 https://nextjs.org/docs/messages/blocking-prerender-viewport-dynamic#cache-the-viewport-data
               - [block] Set \`export const instant = false\` to allow a blocking route
                 https://nextjs.org/docs/messages/blocking-prerender-viewport-dynamic#allow-blocking-route
             Error occurred prerendering page "/dynamic-viewport-dynamic-route". Read more: https://nextjs.org/docs/messages/prerender-error

             > Export encountered errors on 1 path:
             	/dynamic-viewport-dynamic-route/page: /dynamic-viewport-dynamic-route"
            `)
        } else {
          expect(output).toMatchInlineSnapshot(`
             "Route "/dynamic-viewport-dynamic-route": Next.js encountered uncached or runtime data in \`generateViewport()\`.

             This prevents the page from being prerendered, leading to a slower user experience. Unlike metadata, viewport cannot be streamed behind \`<Suspense>\` because it affects the initial page load.

             Ways to fix this:
               - [static] Use a static viewport export instead of \`generateViewport()\`
                 https://nextjs.org/docs/messages/blocking-prerender-viewport-runtime#use-static-viewport
               - [cache] For uncached data (\`fetch\`, database calls): cache the viewport with \`"use cache"\` in \`generateViewport()\` (does not apply to \`connection()\`)
                 https://nextjs.org/docs/messages/blocking-prerender-viewport-dynamic#cache-the-viewport-data
               - [block] Set \`export const instant = false\` to allow a blocking route
                 https://nextjs.org/docs/messages/blocking-prerender-viewport-dynamic#allow-blocking-route
             Error occurred prerendering page "/dynamic-viewport-dynamic-route". Read more: https://nextjs.org/docs/messages/prerender-error
             Export encountered an error on /dynamic-viewport-dynamic-route/page: /dynamic-viewport-dynamic-route, exiting the build."
            `)
        }
      })
    }
  })
}
