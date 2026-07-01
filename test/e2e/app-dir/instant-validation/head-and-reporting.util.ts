import {
  expectNoBuildValidationErrors,
  expectBuildValidationSkipped,
  extractBuildValidationError,
  getDevCliValidationOutput,
} from 'e2e-utils/instant-validation'
import { type InstantValidationCaseContext } from './harness.util'

const partialPrefetching = !!process.env.__NEXT_PARTIAL_PREFETCHING

export function registerHeadAndReportingTests(
  ctx: InstantValidationCaseContext
) {
  const {
    isNextDev,
    isClientNav,
    navigateTo,
    expectNoDevValidationErrors,
    getCliOutputSinceMark,
    prerender,
  } = ctx

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

    it('invalid - shell prefetch - URL data in generateViewport blocks navigation', async () => {
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
                 "source": "app/suspense-in-root/head/invalid-runtime-viewport-in-static/page.tsx (9:24) @ instant
           >  9 | export const instant = { level: 'experimental-error' }
                |                        ^",
                 "stack": [
                   "instant app/suspense-in-root/head/invalid-runtime-viewport-in-static/page.tsx (9:24)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1409",
             "description": "Next.js encountered URL data in generateViewport().",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/suspense-in-root/head/invalid-runtime-viewport-in-static/page.tsx (16:3) @ Module.generateViewport
           > 16 |   await searchParams
                |   ^",
             "stack": [
               "Module.generateViewport app/suspense-in-root/head/invalid-runtime-viewport-in-static/page.tsx (16:3)",
             ],
           }
          `)
      } else {
        const result = await prerender(
          '/suspense-in-root/head/invalid-runtime-viewport-in-static'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/head/invalid-runtime-viewport-in-static": Next.js encountered URL data in \`generateViewport()\`.

           \`params\` or \`searchParams\` in \`generateViewport()\` prevents the page from being prerendered, leading to a slower user experience.

           Ways to fix this:
             - [static] Use a static viewport export instead of \`generateViewport()\`
               https://nextjs.org/docs/messages/blocking-prerender-viewport-runtime#use-static-viewport
             - [block] Set \`export const instant = false\` to allow a blocking route
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
             "code": "E1395",
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
             - [cache] Cache the viewport data with \`"use cache"\` in \`generateViewport()\` (does not apply to \`connection()\`)
               https://nextjs.org/docs/messages/blocking-prerender-viewport-dynamic#cache-the-viewport-data
             - [block] Set \`export const instant = false\` to allow a blocking route
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
           "code": "E1395",
           "description": "Next.js encountered uncached data in generateViewport().",
           "environmentLabel": "Server",
           "label": "Blocking Route",
           "source": "app/suspense-in-root/head/invalid-dynamic-viewport-in-blocking-inside-static/page.tsx (7:19) @ Module.generateViewport
         >  7 |   await connection()
              |                   ^",
           "stack": [
             "Module.generateViewport app/suspense-in-root/head/invalid-dynamic-viewport-in-blocking-inside-static/page.tsx (7:19)",
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
             - [cache] Cache the viewport data with \`"use cache"\` in \`generateViewport()\` (does not apply to \`connection()\`)
               https://nextjs.org/docs/messages/blocking-prerender-viewport-dynamic#cache-the-viewport-data
             - [block] Set \`export const instant = false\` to allow a blocking route
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

  describe('multi-depth fallback deferral', () => {
    // The validation outer loop iterates from deepest configured depth
    // to shallowest. When the deepest iteration only produces a missing-
    // boundary fallback (i.e., the configured boundary didn't render and
    // there were no thrown errors), that fallback should be deferred so
    // a real error from a shallower depth can win. If no shallower depth
    // surfaces a real error, the deferred fallback eventually surfaces
    // so the user is still made aware that validation didn't complete.

    it('surfaces deferred fallback when no shallower depth has a real error', async () => {
      // Outer layout has instant and validates cleanly. Inner
      // page has instant but its parent layout drops {children},
      // so the inner boundary can't render. Without the deferral, we'd
      // bail out after the deepest iteration; with deferral, the outer
      // iteration runs cleanly and the deferred fallback then surfaces.
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/multi-depth-deferred-fallback/inner'
        )
        await expect(browser).toDisplayCollapsedRedbox(`
           {
             "code": "E1286",
             "description": "Next.js could not validate that a segment in your UI has instant navigation.",
             "environmentLabel": "Server",
             "label": "Instant",
             "source": "/suspense-in-root/static/multi-depth-deferred-fallback/inner
           │
           │ ├─ suspense-in-root/
           │ │  ├─ static/
           │ │  │  ├─ multi-depth-deferred-fallback/
           │ │  │  │  ├─ inner/
           │             └─ page.tsx ← dropped from rendering
           │",
             "stack": [],
           }
          `)
      } else {
        const result = await prerender(
          '/suspense-in-root/static/multi-depth-deferred-fallback/inner'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/static/multi-depth-deferred-fallback/inner": Could not validate that a segment in your UI has instant navigation.

           This segment was dropped from rendering. Issues that would prevent instant navigation will go undetected.

           Dropped segment:
             app/suspense-in-root/static/multi-depth-deferred-fallback/inner/page.tsx

           Ways to fix this:
             - [render] Render the dropped segment
               https://nextjs.org/docs/messages/instant-unrendered-segment#render-the-dropped-segment
             - [ignore] Set \`export const instant = false\` to opt the dropped segment out of instant-navigation validation
               https://nextjs.org/docs/messages/instant-unrendered-segment#skip-validation-on-the-segment
               at ignore-listed frames
           Build-time instant validation failed for route "/suspense-in-root/static/multi-depth-deferred-fallback/inner".
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/multi-depth-deferred-fallback/inner" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
           Stopping prerender due to instant validation errors."
          `)
        expect(result.exitCode).toBe(1)
      }
    })
  })

  describe('unrendered segment file reporting', () => {
    it('reports the shallowest unrendered file, not the configured file', async () => {
      // Config is on inter/inner/page.tsx. The shallowest boundary
      // iteration lands at test-firstmod, and inter/layout.tsx is the
      // first child mod that didn't render — not the configured page,
      // and not test-firstmod/layout.tsx (which DID render but dropped
      // its children).
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/test-firstmod/inter/inner'
        )
        await expect(browser).toDisplayCollapsedRedbox(`
           {
             "code": "E1286",
             "description": "Next.js could not validate that a segment in your UI has instant navigation.",
             "environmentLabel": "Server",
             "label": "Instant",
             "source": "/suspense-in-root/static/test-firstmod/inter/inner
           │
           │ ├─ suspense-in-root/
           │ │  ├─ static/
           │ │  │  ├─ test-firstmod/
           │ │  │  │  ├─ inter/
           │             └─ layout.tsx ← dropped from rendering
           │",
             "stack": [],
           }
          `)
      } else {
        const result = await prerender(
          '/suspense-in-root/static/test-firstmod/inter/inner'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/static/test-firstmod/inter/inner": Could not validate that a segment in your UI has instant navigation.

           This segment was dropped from rendering. Issues that would prevent instant navigation will go undetected.

           Dropped segment:
             app/suspense-in-root/static/test-firstmod/inter/layout.tsx

           Ways to fix this:
             - [render] Render the dropped segment
               https://nextjs.org/docs/messages/instant-unrendered-segment#render-the-dropped-segment
             - [ignore] Set \`export const instant = false\` to opt the dropped segment out of instant-navigation validation
               https://nextjs.org/docs/messages/instant-unrendered-segment#skip-validation-on-the-segment
               at ignore-listed frames
           Build-time instant validation failed for route "/suspense-in-root/static/test-firstmod/inter/inner".
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/test-firstmod/inter/inner" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
           Stopping prerender due to instant validation errors."
          `)
        expect(result.exitCode).toBe(1)
      }
    })

    it('reports the boundary segment layout when multiple slots are dropped', async () => {
      // Layout drops both {children} and {sidebar}. Both have
      // configured pages, but only one boundary id is created (at
      // the segment level, covering all slots). The reported file is
      // the boundary segment's own layout — the nearest mod to the
      // boundary placement.
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/test-multi-unrendered'
        )
        await expect(browser).toDisplayCollapsedRedbox(`
           {
             "code": "E1286",
             "description": "Next.js could not validate that a segment in your UI has instant navigation.",
             "environmentLabel": "Server",
             "label": "Instant",
             "source": "/suspense-in-root/static/test-multi-unrendered
           │
           │ ├─ suspense-in-root/
           │ │  ├─ static/
           │ │  │  ├─ test-multi-unrendered/
           │ │  │  │  ├─ @sidebar/
           │ │  │  │  │  └─ page.tsx ← dropped from rendering
           │          └─ page.tsx ← dropped from rendering
           │",
             "stack": [],
           }
          `)
      } else {
        const result = await prerender(
          '/suspense-in-root/static/test-multi-unrendered'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/static/test-multi-unrendered": Could not validate that a segment in your UI has instant navigation.

           This segment was dropped from rendering. Issues that would prevent instant navigation will go undetected.

           Dropped segments:
             app/suspense-in-root/static/test-multi-unrendered/@sidebar/page.tsx
             app/suspense-in-root/static/test-multi-unrendered/page.tsx

           Ways to fix this:
             - [render] Render the dropped segment
               https://nextjs.org/docs/messages/instant-unrendered-segment#render-the-dropped-segment
             - [ignore] Set \`export const instant = false\` to opt the dropped segment out of instant-navigation validation
               https://nextjs.org/docs/messages/instant-unrendered-segment#skip-validation-on-the-segment
               at ignore-listed frames
           Build-time instant validation failed for route "/suspense-in-root/static/test-multi-unrendered".
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/test-multi-unrendered" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
           Stopping prerender due to instant validation errors."
          `)
        expect(result.exitCode).toBe(1)
      }
    })
  })

  describe('disabling validation', () => {
    it('in a layout', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/disable-validation/in-layout'
        )
        await expectNoDevValidationErrors(browser, await browser.url())
      } else {
        const result = await prerender(
          '/suspense-in-root/disable-validation/in-layout'
        )
        expectBuildValidationSkipped(result)
      }
    })

    it('in a page', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/disable-validation/in-page'
        )
        await expectNoDevValidationErrors(browser, await browser.url())
      } else {
        const result = await prerender(
          '/suspense-in-root/disable-validation/in-page'
        )
        expectBuildValidationSkipped(result)
      }
    })

    it('in a page with a parent that has a config', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/disable-validation/in-page-with-outer'
        )
        await expectNoDevValidationErrors(browser, await browser.url())
      } else {
        const result = await prerender(
          '/suspense-in-root/disable-validation/in-page-with-outer'
        )
        expectBuildValidationSkipped(result)
      }
    })

    it('disabling dev validation', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/disable-validation/disable-dev'
        )
        await expectNoDevValidationErrors(browser, await browser.url())
      } else {
        const result = await prerender(
          '/suspense-in-root/disable-validation/disable-dev'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/disable-validation/disable-dev": Next.js encountered uncached data during prerendering or a navigation.

           \`fetch(...)\` or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

           Ways to fix this:
             - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
               https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
             - [cache] Cache the data access with \`"use cache"\` (does not apply to \`connection()\`)
               https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
             - [block] Set \`export const instant = false\` to allow a blocking route
               https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
           Build-time instant validation failed for route "/suspense-in-root/disable-validation/disable-dev".
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/disable-validation/disable-dev" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
           Stopping prerender due to instant validation errors."
          `)
        expect(result.exitCode).toBe(1)
      }
    })

    it('disabling build validation', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/disable-validation/disable-build'
        )
        await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/disable-validation/disable-build/page.tsx (3:24) @ instant
           > 3 | export const instant = {
               |                        ^",
                 "stack": [
                   "instant app/suspense-in-root/disable-validation/disable-build/page.tsx (3:24)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1398",
             "description": "Next.js encountered uncached data during a navigation.",
             "environmentLabel": "Server",
             "label": "Instant",
             "source": "app/suspense-in-root/disable-validation/disable-build/page.tsx (9:19) @ Page
           >  9 |   await connection()
                |                   ^",
             "stack": [
               "Page app/suspense-in-root/disable-validation/disable-build/page.tsx (9:19)",
             ],
           }
          `)
      } else {
        const result = await prerender(
          '/suspense-in-root/disable-validation/disable-build'
        )
        expectBuildValidationSkipped(result)
      }
    })
  })

  if (partialPrefetching) {
    describe('app shell validation', () => {
      it('valid - session data is allowed in a shell', async () => {
        if (isNextDev) {
          const browser = await navigateTo('/shells/valid-session-only')
          await expectNoDevValidationErrors(browser, await browser.url())
        } else {
          const result = await prerender('/shells/(default)/valid-session-only')
          expectNoBuildValidationErrors(result)
        }
      })

      it('valid - session data is allowed in a shell (with dynamic data)', async () => {
        if (isNextDev) {
          const browser = await navigateTo('/shells/valid-session-with-dynamic')
          await expectNoDevValidationErrors(browser, await browser.url())
        } else {
          const result = await prerender(
            '/shells/(default)/valid-session-with-dynamic'
          )
          expectNoBuildValidationErrors(result)
        }
      })

      it('valid - static params guarded by suspense in a shell', async () => {
        if (isNextDev) {
          const browser = await navigateTo('/shells/valid-static-with-gsp/123')
          await expectNoDevValidationErrors(browser, await browser.url())
        } else {
          const result = await prerender(
            '/shells/(default)/valid-static-with-gsp/[slug]'
          )
          expectNoBuildValidationErrors(result)
        }
      })

      it('invalid - unguarded params in a runtime-prefetchable shell', async () => {
        if (isNextDev) {
          const browser = await navigateTo('/shells/invalid-runtime-params/123')
          await expect(browser).toDisplayCollapsedRedbox(`
             {
               "cause": [
                 {
                   "label": "Caused by: Instant Validation",
                   "source": "app/shells/(default)/invalid-runtime-params/[slug]/page.tsx (3:33) @ instant
             > 3 | export const instant: Instant = {
                 |                                 ^",
                   "stack": [
                     "instant app/shells/(default)/invalid-runtime-params/[slug]/page.tsx (3:33)",
                     "Set.forEach <anonymous>",
                   ],
                 },
               ],
               "code": "E1408",
               "description": "Next.js encountered URL data outside of Suspense.",
               "environmentLabel": "Server",
               "label": "Instant",
               "source": "app/shells/(default)/invalid-runtime-params/[slug]/page.tsx (28:3) @ LinkData
             > 28 |   await params
                  |   ^",
               "stack": [
                 "LinkData app/shells/(default)/invalid-runtime-params/[slug]/page.tsx (28:3)",
                 "Page app/shells/(default)/invalid-runtime-params/[slug]/page.tsx (22:7)",
               ],
             }
            `)
        } else {
          const result = await prerender(
            '/shells/(default)/invalid-runtime-params/[slug]'
          )
          // TODO(app-shells): missing fallback params in build validation
          // It seems like `workUnitStore.fallbackParams` is undefined
          // during the validation render, which makes us treat these params as static.
          // In partialPrefetching, static params are also delayed until the runtime stage,
          // which ultimately makes the validation fail, but also hides the underlying issue.

          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
             "Error: Route "/shells/invalid-runtime-params/[slug]": Next.js encountered URL data during prerendering or a navigation.

             \`params\` or \`searchParams\` accessed outside of \`<Suspense>\` may prevent the navigation from being instant, leading to a slower user experience.

             Ways to fix this:
               - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                 https://nextjs.org/docs/messages/instant-shell-url-data#wrap-in-or-move-into-suspense
               - [block] Set \`export const instant = false\` to allow a blocking route
                 https://nextjs.org/docs/messages/instant-shell-url-data#allow-blocking-route
                 at main (<anonymous>)
                 at body (<anonymous>)
                 at html (<anonymous>)
             Build-time instant validation failed for route "/shells/invalid-runtime-params/[slug]".
             To get a more detailed stack trace and pinpoint the issue, try one of the following:
               - Start the app in development mode by running \`next dev\`, then open "/shells/invalid-runtime-params/[slug]" in your browser to investigate the error.
               - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
             Stopping prerender due to instant validation errors."
            `)
          expect(result.exitCode).toBe(1)
        }
      })

      it('invalid - unguarded search params in a runtime-prefetchable shell', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/shells/invalid-runtime-searchparams?foo=bar'
          )
          if (isClientNav) {
            // TODO(app-shells): redbox is flaky and sometimes doesn't appear even though validation runs.
            // as a stopgap, we assert on CLI output instead
            // await expect(browser).toDisplayCollapsedRedbox(`...`)
            expect(
              await getDevCliValidationOutput(
                await browser.url(),
                getCliOutputSinceMark
              )
            ).toMatchInlineSnapshot(`
               "Error: Route "/shells/invalid-runtime-searchparams": Next.js encountered URL data during prerendering or a navigation.

               \`params\` or \`searchParams\` accessed outside of \`<Suspense>\` may prevent the navigation from being instant, leading to a slower user experience.

               Ways to fix this:
                 - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                   https://nextjs.org/docs/messages/instant-shell-url-data#wrap-in-or-move-into-suspense
                 - [block] Set \`export const instant = false\` to allow a blocking route
                   https://nextjs.org/docs/messages/instant-shell-url-data#allow-blocking-route
                   at LinkData (app/shells/(default)/invalid-runtime-searchparams/page.tsx:27:3)
                   at Page (app/shells/(default)/invalid-runtime-searchparams/page.tsx:17:7)
                 25 |   searchParams: Promise<Record<string, string | string[]>>
                 26 | }) {
               > 27 |   await searchParams
                    |   ^
                 28 |   return <div>Link data - search params</div>
                 29 | }
                 30 | {
                 [cause]: Instant Validation:  
                     at instant (app/shells/(default)/invalid-runtime-searchparams/page.tsx:3:33)
                   1 | import { Instant } from 'next'
                   2 |
                 > 3 | export const instant: Instant = {
                     |                                 ^
                   4 |   level: 'experimental-error',
                   5 |   unstable_samples: [{ searchParams: {} }],
                   6 | }
               }"
              `)
          } else {
            await expect(browser).toDisplayCollapsedRedbox(`
               {
                 "cause": [
                   {
                     "label": "Caused by: Instant Validation",
                     "source": "app/shells/(default)/invalid-runtime-searchparams/page.tsx (3:33) @ instant
               > 3 | export const instant: Instant = {
                   |                                 ^",
                     "stack": [
                       "instant app/shells/(default)/invalid-runtime-searchparams/page.tsx (3:33)",
                       "Set.forEach <anonymous>",
                     ],
                   },
                 ],
                 "code": "E1408",
                 "description": "Next.js encountered URL data outside of Suspense.",
                 "environmentLabel": "Server",
                 "label": "Instant",
                 "source": "app/shells/(default)/invalid-runtime-searchparams/page.tsx (27:3) @ LinkData
               > 27 |   await searchParams
                    |   ^",
                 "stack": [
                   "LinkData app/shells/(default)/invalid-runtime-searchparams/page.tsx (27:3)",
                   "Page app/shells/(default)/invalid-runtime-searchparams/page.tsx (17:7)",
                 ],
               }
              `)
          }
        } else {
          const result = await prerender(
            '/shells/(default)/invalid-runtime-searchparams'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
             "Error: Route "/shells/invalid-runtime-searchparams": Next.js encountered URL data during prerendering or a navigation.

             \`params\` or \`searchParams\` accessed outside of \`<Suspense>\` may prevent the navigation from being instant, leading to a slower user experience.

             Ways to fix this:
               - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                 https://nextjs.org/docs/messages/instant-shell-url-data#wrap-in-or-move-into-suspense
               - [block] Set \`export const instant = false\` to allow a blocking route
                 https://nextjs.org/docs/messages/instant-shell-url-data#allow-blocking-route
                 at main (<anonymous>)
                 at body (<anonymous>)
                 at html (<anonymous>)
             Build-time instant validation failed for route "/shells/invalid-runtime-searchparams".
             To get a more detailed stack trace and pinpoint the issue, try one of the following:
               - Start the app in development mode by running \`next dev\`, then open "/shells/invalid-runtime-searchparams" in your browser to investigate the error.
               - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
             Stopping prerender due to instant validation errors."
            `)
          expect(result.exitCode).toBe(1)
        }
      })

      it('invalid - unguarded static params in metadata', async () => {
        // TODO(app-shells): static params currently aren't excluded from the shell.
        // This should be failing validation.
        if (isNextDev) {
          const browser = await navigateTo(
            '/shells/invalid-static-with-gsp-metadata/123'
          )

          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/shells/(default)/invalid-static-with-gsp-metadata/[slug]/page.tsx (3:33) @ instant
           > 3 | export const instant: Instant = {
               |                                 ^",
                 "stack": [
                   "instant app/shells/(default)/invalid-static-with-gsp-metadata/[slug]/page.tsx (3:33)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1407",
             "description": "Next.js encountered URL data in generateMetadata().",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/shells/(default)/invalid-static-with-gsp-metadata/[slug]/page.tsx (19:3) @ Module.generateMetadata
           > 19 |   await params
                |   ^",
             "stack": [
               "Module.generateMetadata app/shells/(default)/invalid-static-with-gsp-metadata/[slug]/page.tsx (19:3)",
             ],
           }
          `)
        } else {
          const result = await prerender(
            '/shells/(default)/invalid-static-with-gsp-metadata/[slug]'
          )
          // expect(
          //   extractBuildValidationError(result.cliOutput)
          // ).toMatchInlineSnapshot(`...`)
          // expect(result.exitCode).toBe(1)

          // TODO(app-shells): The build errors here with a confusing error before we get to instant validation.
          // This should be improved.
          expect(result.cliOutput).toContain(
            `Route "/shells/invalid-static-with-gsp-metadata/[slug]": Next.js encountered uncached or runtime data in \`generateMetadata()\`.`
          )
          expect(result.exitCode).toBe(1)
        }
      })

      it('invalid - unguarded static params in a shell', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/shells/invalid-static-with-gsp/123'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
             {
               "cause": [
                 {
                   "label": "Caused by: Instant Validation",
                   "source": "app/shells/(default)/invalid-static-with-gsp/[slug]/page.tsx (3:33) @ instant
             > 3 | export const instant: Instant = {
                 |                                 ^",
                   "stack": [
                     "instant app/shells/(default)/invalid-static-with-gsp/[slug]/page.tsx (3:33)",
                     "Set.forEach <anonymous>",
                   ],
                 },
               ],
               "code": "E1408",
               "description": "Next.js encountered URL data outside of Suspense.",
               "environmentLabel": "Server",
               "label": "Instant",
               "source": "app/shells/(default)/invalid-static-with-gsp/[slug]/page.tsx (31:20) @ LinkData
             > 31 |   const { slug } = await params
                  |                    ^",
               "stack": [
                 "LinkData app/shells/(default)/invalid-static-with-gsp/[slug]/page.tsx (31:20)",
                 "Page app/shells/(default)/invalid-static-with-gsp/[slug]/page.tsx (25:7)",
               ],
             }
            `)
        } else {
          const result = await prerender(
            '/shells/(default)/invalid-static-with-gsp/[slug]'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
             "Error: Route "/shells/invalid-static-with-gsp/[slug]": Next.js encountered URL data during prerendering or a navigation.

             \`params\` or \`searchParams\` accessed outside of \`<Suspense>\` may prevent the navigation from being instant, leading to a slower user experience.

             Ways to fix this:
               - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                 https://nextjs.org/docs/messages/instant-shell-url-data#wrap-in-or-move-into-suspense
               - [block] Set \`export const instant = false\` to allow a blocking route
                 https://nextjs.org/docs/messages/instant-shell-url-data#allow-blocking-route
                 at main (<anonymous>)
                 at body (<anonymous>)
                 at html (<anonymous>)
             Build-time instant validation failed for route "/shells/invalid-static-with-gsp/[slug]".
             To get a more detailed stack trace and pinpoint the issue, try one of the following:
               - Start the app in development mode by running \`next dev\`, then open "/shells/invalid-static-with-gsp/[slug]" in your browser to investigate the error.
               - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
             Stopping prerender due to instant validation errors."
            `)
          expect(result.exitCode).toBe(1)
        }
      })

      it('valid - unguarded root param', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/shells/with-root-param/en/valid-unguarded-root-param'
          )
          await expectNoDevValidationErrors(browser, await browser.url())
        } else {
          const result = await prerender(
            '/shells/with-root-param/[lang]/valid-unguarded-root-param'
          )
          expectNoBuildValidationErrors(result)
        }
      })

      it('valid - unguarded root param accessed via params prop', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/shells/with-root-param/en/valid-unguarded-root-param-via-params'
          )
          await expectNoDevValidationErrors(browser, await browser.url())
        } else {
          const result = await prerender(
            '/shells/with-root-param/[lang]/valid-unguarded-root-param-via-params'
          )
          expectNoBuildValidationErrors(result)
        }
      })
    })
  } else {
    describe('non-app shell validation', () => {
      it('valid - unguarded static params', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/non-app-shell/valid-unguarded-static-params/123'
          )
          await expectNoDevValidationErrors(browser, await browser.url())
        } else {
          const result = await prerender(
            '/suspense-in-root/non-app-shell/valid-unguarded-static-params/[slug]'
          )
          expectNoBuildValidationErrors(result)
        }
      })
    })
  }
}
