import { describeInstantValidationTests } from './instant-validation-test-utils'

describeInstantValidationTests(
  ({
    isNextDev,
    navigateTo,
    expectNoDevValidationErrors,
    prerender,
    expectBuildValidationSkipped,
    extractBuildValidationError,
  }) => {
    describe('config depth preference', () => {
      // When multiple slots have instant configs at different depths,
      // the deepest config is preferred as the root cause. At equal
      // depth, children is preferred over named slots.

      it('invalid - deeper children config preferred over shallower slot config', async () => {
        // children has config deep (deeper/still/deep/page.tsx, depth 2)
        // @anotherSlot has config shallow (page.tsx, depth 0)
        // @slot blocks with no config — cause should be children's deep config
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/static/config-depth-preference/deeper/still/deep'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/static/config-depth-preference/deeper/still/deep/page.tsx (3:24) @ instant
           > 3 | export const instant = { level: 'experimental-error' }
               |                        ^",
                 "stack": [
                   "instant app/suspense-in-root/static/config-depth-preference/deeper/still/deep/page.tsx (3:24)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1319",
             "description": "Next.js encountered runtime data during a navigation.",
             "environmentLabel": "Server",
             "label": "Instant",
             "source": "app/suspense-in-root/static/config-depth-preference/@slot/[...catchall]/page.tsx (8:16) @ CatchallSlotPage
           >  8 |   await cookies()
                |                ^",
             "stack": [
               "CatchallSlotPage app/suspense-in-root/static/config-depth-preference/@slot/[...catchall]/page.tsx (8:16)",
             ],
           }
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/static/config-depth-preference/deeper/still/deep'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error [InvariantError]: Invariant: An unexpected error occurred during instant validation. This is a bug in Next.js.
               at ignore-listed frames {
             [cause]: Error [InvariantError]: Invariant: Missing value for segment key: "catchall" with dynamic param type: c. This is a bug in Next.js.
                 at ignore-listed frames
           }
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })

      it('invalid - deeper slot config preferred over shallower children catchall', async () => {
        // @anotherSlot has config deep (still/deep/page.tsx, depth 2)
        // children has config shallow ([...rest]/page.tsx, depth 1)
        // @slot blocks with no config — cause should be @anotherSlot's deep config
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/static/config-depth-preference-slot-wins/deeper/still/deep'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/static/config-depth-preference-slot-wins/deeper/@anotherSlot/still/deep/page.tsx (3:24) @ instant
           > 3 | export const instant = { level: 'experimental-error' }
               |                        ^",
                 "stack": [
                   "instant app/suspense-in-root/static/config-depth-preference-slot-wins/deeper/@anotherSlot/still/deep/page.tsx (3:24)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1319",
             "description": "Next.js encountered runtime data during a navigation.",
             "environmentLabel": "Server",
             "label": "Instant",
             "source": "app/suspense-in-root/static/config-depth-preference-slot-wins/@slot/[...catchall]/page.tsx (7:16) @ CatchallSlotPage
           >  7 |   await cookies()
                |                ^",
             "stack": [
               "CatchallSlotPage app/suspense-in-root/static/config-depth-preference-slot-wins/@slot/[...catchall]/page.tsx (7:16)",
             ],
           }
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/static/config-depth-preference-slot-wins/deeper/[...rest]'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/static/config-depth-preference-slot-wins/deeper/[...rest]": Next.js encountered runtime data during prerendering or a navigation.

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
           Build-time instant validation failed for route "/suspense-in-root/static/config-depth-preference-slot-wins/deeper/[...rest]".
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/config-depth-preference-slot-wins/deeper/[...rest]" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })

      it('invalid - children config preferred at equal depth', async () => {
        // children and @other both have config at same depth (page level)
        // @slot blocks with no config — cause should be children's config
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/static/config-children-preferred'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/static/config-children-preferred/page.tsx (4:24) @ instant
           > 4 | export const instant = { level: 'experimental-error' }
               |                        ^",
                 "stack": [
                   "instant app/suspense-in-root/static/config-children-preferred/page.tsx (4:24)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1319",
             "description": "Next.js encountered runtime data during a navigation.",
             "environmentLabel": "Server",
             "label": "Instant",
             "source": "app/suspense-in-root/static/config-children-preferred/@slot/page.tsx (7:16) @ SlotPage
           >  7 |   await cookies()
                |                ^",
             "stack": [
               "SlotPage app/suspense-in-root/static/config-children-preferred/@slot/page.tsx (7:16)",
             ],
           }
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/static/config-children-preferred'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/static/config-children-preferred": Next.js encountered runtime data during prerendering or a navigation.

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
           Build-time instant validation failed for route "/suspense-in-root/static/config-children-preferred".
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/config-children-preferred" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })

      it('invalid - cross-slot blocking falls back to deep children config', async () => {
        // @slot catchall blocks with no config
        // children has config deep behind a second fork with @panel
        // cause should fall back to children's deep config
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/static/cross-slot-blocking/inner/deep'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/static/cross-slot-blocking/inner/deep/page.tsx (5:24) @ instant
           > 5 | export const instant = { level: 'experimental-error' }
               |                        ^",
                 "stack": [
                   "instant app/suspense-in-root/static/cross-slot-blocking/inner/deep/page.tsx (5:24)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1319",
             "description": "Next.js encountered runtime data during a navigation.",
             "environmentLabel": "Server",
             "label": "Instant",
             "source": "app/suspense-in-root/static/cross-slot-blocking/@slot/[...catchall]/page.tsx (8:16) @ CatchallSlotPage
           >  8 |   await cookies()
                |                ^",
             "stack": [
               "CatchallSlotPage app/suspense-in-root/static/cross-slot-blocking/@slot/[...catchall]/page.tsx (8:16)",
             ],
           }
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/static/cross-slot-blocking/inner/deep'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error [InvariantError]: Invariant: An unexpected error occurred during instant validation. This is a bug in Next.js.
               at ignore-listed frames {
             [cause]: Error [InvariantError]: Invariant: Missing value for segment key: "catchall" with dynamic param type: c. This is a bug in Next.js.
                 at ignore-listed frames
           }
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
             - [ignore] Set \`export const instant = false\` on the dropped segment to skip validation
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
             - [ignore] Set \`export const instant = false\` on the dropped segment to skip validation
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
             - [ignore] Set \`export const instant = false\` on the dropped segment to skip validation
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
             - [cache] Cache the data access with \`"use cache"\`
               https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
             - [block] Set \`export const instant = false\` to silence this warning and allow a blocking route
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
             "code": "E1317",
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
  }
)
