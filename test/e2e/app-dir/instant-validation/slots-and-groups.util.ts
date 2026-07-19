import {
  expectNoBuildValidationErrors,
  extractBuildValidationError,
} from 'e2e-utils/instant-validation'
import { type InstantValidationCaseContext } from './harness.util'

const partialPrefetching = !!process.env.__NEXT_PARTIAL_PREFETCHING

export function registerSlotsAndGroupsTests(ctx: InstantValidationCaseContext) {
  const { isNextDev, navigateTo, expectNoDevValidationErrors, prerender } = ctx

  describe('invalid - missing suspense in parallel slot', () => {
    // The "caused by" source differs between bundlers due to parallel
    it('index', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/missing-suspense-in-parallel-route'
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
                   "source": "app/suspense-in-root/static/missing-suspense-in-parallel-route/@slot/layout.tsx (1:24) @ instant
             > 1 | export const instant = { level: 'experimental-error' }
                 |                        ^",
                   "stack": [
                     "instant app/suspense-in-root/static/missing-suspense-in-parallel-route/@slot/layout.tsx (1:24)",
                     "Set.forEach <anonymous>",
                   ],
                 },
               ],
               "code": "E1402",
               "description": "Next.js encountered runtime data during a navigation.",
               "environmentLabel": "Server",
               "label": "Instant",
               "source": "app/suspense-in-root/static/missing-suspense-in-parallel-route/@slot/page.tsx (4:16) @ IndexSlot
             > 4 |   await cookies()
                 |                ^",
               "stack": [
                 "IndexSlot app/suspense-in-root/static/missing-suspense-in-parallel-route/@slot/page.tsx (4:16)",
               ],
             }
            `)
        }
      } else {
        const result = await prerender(
          '/suspense-in-root/static/missing-suspense-in-parallel-route'
        )
        if (partialPrefetching) {
          // This page uses a runtime shell, so it can use cookies
          // TODO(app-shells): missing "allow-runtime"
          expectNoBuildValidationErrors(result)
        } else {
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
             "Error: Route "/suspense-in-root/static/missing-suspense-in-parallel-route": Next.js encountered runtime data during prerendering or a navigation.

             \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

             Ways to fix this:
               - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                 https://nextjs.org/docs/messages/blocking-prerender-runtime#wrap-in-or-move-into-suspense
               - [block] Set \`export const instant = false\` to allow a blocking route
                 https://nextjs.org/docs/messages/blocking-prerender-runtime#allow-blocking-route
                 at div (<anonymous>)
                 at div (<anonymous>)
                 at body (<anonymous>)
                 at html (<anonymous>)
                 at a (<anonymous>)
             Build-time instant validation failed for route "/suspense-in-root/static/missing-suspense-in-parallel-route".
             To get a more detailed stack trace and pinpoint the issue, try one of the following:
               - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/missing-suspense-in-parallel-route" in your browser to investigate the error.
               - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
             Stopping prerender due to instant validation errors."
            `)
          expect(result.exitCode).toBe(1)
        }
      }
    })

    it('subpage', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/missing-suspense-in-parallel-route/foo'
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
                   "source": "app/suspense-in-root/static/missing-suspense-in-parallel-route/foo/page.tsx (1:24) @ instant
             > 1 | export const instant = { level: 'experimental-error' }
                 |                        ^",
                   "stack": [
                     "instant app/suspense-in-root/static/missing-suspense-in-parallel-route/foo/page.tsx (1:24)",
                     "Set.forEach <anonymous>",
                   ],
                 },
               ],
               "code": "E1402",
               "description": "Next.js encountered runtime data during a navigation.",
               "environmentLabel": "Server",
               "label": "Instant",
               "source": "app/suspense-in-root/static/missing-suspense-in-parallel-route/@slot/foo/page.tsx (4:16) @ FooSlot
             > 4 |   await cookies()
                 |                ^",
               "stack": [
                 "FooSlot app/suspense-in-root/static/missing-suspense-in-parallel-route/@slot/foo/page.tsx (4:16)",
               ],
             }
            `)
        }
      } else {
        const result = await prerender(
          '/suspense-in-root/static/missing-suspense-in-parallel-route/foo'
        )
        if (partialPrefetching) {
          // This page uses a runtime shell, so it can use cookies
          // TODO(app-shells): missing "allow-runtime"
          expectNoBuildValidationErrors(result)
        } else {
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
             "Error: Route "/suspense-in-root/static/missing-suspense-in-parallel-route/foo": Next.js encountered runtime data during prerendering or a navigation.

             \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

             Ways to fix this:
               - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                 https://nextjs.org/docs/messages/blocking-prerender-runtime#wrap-in-or-move-into-suspense
               - [block] Set \`export const instant = false\` to allow a blocking route
                 https://nextjs.org/docs/messages/blocking-prerender-runtime#allow-blocking-route
                 at div (<anonymous>)
                 at div (<anonymous>)
                 at body (<anonymous>)
                 at html (<anonymous>)
                 at a (<anonymous>)
             Build-time instant validation failed for route "/suspense-in-root/static/missing-suspense-in-parallel-route/foo".
             To get a more detailed stack trace and pinpoint the issue, try one of the following:
               - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/missing-suspense-in-parallel-route/foo" in your browser to investigate the error.
               - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
             Stopping prerender due to instant validation errors."
            `)
          expect(result.exitCode).toBe(1)
        }
      }
    })

    it('default slot', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/missing-suspense-in-parallel-route/bar'
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
                   "source": "app/suspense-in-root/static/missing-suspense-in-parallel-route/bar/page.tsx (1:24) @ instant
             > 1 | export const instant = { level: 'experimental-error' }
                 |                        ^",
                   "stack": [
                     "instant app/suspense-in-root/static/missing-suspense-in-parallel-route/bar/page.tsx (1:24)",
                     "Set.forEach <anonymous>",
                   ],
                 },
               ],
               "code": "E1402",
               "description": "Next.js encountered runtime data during a navigation.",
               "environmentLabel": "Server",
               "label": "Instant",
               "source": "app/suspense-in-root/static/missing-suspense-in-parallel-route/@slot/default.tsx (4:16) @ DefaultSlot
             > 4 |   await cookies()
                 |                ^",
               "stack": [
                 "DefaultSlot app/suspense-in-root/static/missing-suspense-in-parallel-route/@slot/default.tsx (4:16)",
               ],
             }
            `)
        }
      } else {
        const result = await prerender(
          '/suspense-in-root/static/missing-suspense-in-parallel-route/bar'
        )
        if (partialPrefetching) {
          // This page uses a runtime shell, so it can use cookies
          // TODO(app-shells): missing "allow-runtime"
          expectNoBuildValidationErrors(result)
        } else {
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
             "Error: Route "/suspense-in-root/static/missing-suspense-in-parallel-route/bar": Next.js encountered runtime data during prerendering or a navigation.

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
             Build-time instant validation failed for route "/suspense-in-root/static/missing-suspense-in-parallel-route/bar".
             To get a more detailed stack trace and pinpoint the issue, try one of the following:
               - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/missing-suspense-in-parallel-route/bar" in your browser to investigate the error.
               - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
             Stopping prerender due to instant validation errors."
            `)
          expect(result.exitCode).toBe(1)
        }
      }
    })
  })

  describe('route groups', () => {
    it('invalid - config on route group layout - cookies() blocks below', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/route-group-config-only'
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
                   "source": "app/suspense-in-root/static/route-group-config-only/(group)/layout.tsx (3:24) @ instant
             > 3 | export const instant = { level: 'experimental-error' }
                 |                        ^",
                   "stack": [
                     "instant app/suspense-in-root/static/route-group-config-only/(group)/layout.tsx (3:24)",
                     "Set.forEach <anonymous>",
                   ],
                 },
               ],
               "code": "E1402",
               "description": "Next.js encountered runtime data during a navigation.",
               "environmentLabel": "Server",
               "label": "Instant",
               "source": "app/suspense-in-root/static/route-group-config-only/(group)/page.tsx (4:16) @ Page
             > 4 |   await cookies()
                 |                ^",
               "stack": [
                 "Page app/suspense-in-root/static/route-group-config-only/(group)/page.tsx (4:16)",
               ],
             }
            `)
        }
      } else {
        const result = await prerender(
          '/suspense-in-root/static/route-group-config-only/(group)'
        )
        if (partialPrefetching) {
          // This page uses a runtime shell, so it can use cookies
          // TODO(app-shells): missing "allow-runtime"
          expectNoBuildValidationErrors(result)
        } else {
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
             "Error: Route "/suspense-in-root/static/route-group-config-only": Next.js encountered runtime data during prerendering or a navigation.

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
             Build-time instant validation failed for route "/suspense-in-root/static/route-group-config-only".
             To get a more detailed stack trace and pinpoint the issue, try one of the following:
               - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/route-group-config-only" in your browser to investigate the error.
               - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
             Stopping prerender due to instant validation errors."
            `)
          expect(result.exitCode).toBe(1)
        }
      }
    })

    it('invalid - config on both route group and segment layout - cookies() blocks below', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/route-group-config-and-segment-config'
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
                   "source": "app/suspense-in-root/static/route-group-config-and-segment-config/(group)/layout.tsx (3:24) @ instant
             > 3 | export const instant = { level: 'experimental-error' }
                 |                        ^",
                   "stack": [
                     "instant app/suspense-in-root/static/route-group-config-and-segment-config/(group)/layout.tsx (3:24)",
                     "Set.forEach <anonymous>",
                   ],
                 },
               ],
               "code": "E1402",
               "description": "Next.js encountered runtime data during a navigation.",
               "environmentLabel": "Server",
               "label": "Instant",
               "source": "app/suspense-in-root/static/route-group-config-and-segment-config/(group)/page.tsx (4:16) @ Page
             > 4 |   await cookies()
                 |                ^",
               "stack": [
                 "Page app/suspense-in-root/static/route-group-config-and-segment-config/(group)/page.tsx (4:16)",
               ],
             }
            `)
        }
      } else {
        const result = await prerender(
          '/suspense-in-root/static/route-group-config-and-segment-config/(group)'
        )
        if (partialPrefetching) {
          // This page uses a runtime shell, so it can use cookies
          // TODO(app-shells): missing "allow-runtime"
          expectNoBuildValidationErrors(result)
        } else {
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
             "Error: Route "/suspense-in-root/static/route-group-config-and-segment-config": Next.js encountered runtime data during prerendering or a navigation.

             \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

             Ways to fix this:
               - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                 https://nextjs.org/docs/messages/blocking-prerender-runtime#wrap-in-or-move-into-suspense
               - [block] Set \`export const instant = false\` to allow a blocking route
                 https://nextjs.org/docs/messages/blocking-prerender-runtime#allow-blocking-route
                 at div (<anonymous>)
                 at div (<anonymous>)
                 at body (<anonymous>)
                 at html (<anonymous>)
                 at a (<anonymous>)
             Build-time instant validation failed for route "/suspense-in-root/static/route-group-config-and-segment-config".
             To get a more detailed stack trace and pinpoint the issue, try one of the following:
               - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/route-group-config-and-segment-config" in your browser to investigate the error.
               - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
             Stopping prerender due to instant validation errors."
            `)
          expect(result.exitCode).toBe(1)
        }
      }
    })

    it('invalid - config on segment layout - cookies() blocks through route group below', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/route-group-segment-config-only'
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
                   "source": "app/suspense-in-root/static/route-group-segment-config-only/layout.tsx (3:24) @ instant
             > 3 | export const instant = { level: 'experimental-error' }
                 |                        ^",
                   "stack": [
                     "instant app/suspense-in-root/static/route-group-segment-config-only/layout.tsx (3:24)",
                     "Set.forEach <anonymous>",
                   ],
                 },
               ],
               "code": "E1402",
               "description": "Next.js encountered runtime data during a navigation.",
               "environmentLabel": "Server",
               "label": "Instant",
               "source": "app/suspense-in-root/static/route-group-segment-config-only/(group)/page.tsx (4:16) @ Page
             > 4 |   await cookies()
                 |                ^",
               "stack": [
                 "Page app/suspense-in-root/static/route-group-segment-config-only/(group)/page.tsx (4:16)",
               ],
             }
            `)
        }
      } else {
        const result = await prerender(
          '/suspense-in-root/static/route-group-segment-config-only/(group)'
        )
        if (partialPrefetching) {
          // This page uses a runtime shell, so it can use cookies
          // TODO(app-shells): missing "allow-runtime"
          expectNoBuildValidationErrors(result)
        } else {
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
             "Error: Route "/suspense-in-root/static/route-group-segment-config-only": Next.js encountered runtime data during prerendering or a navigation.

             \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

             Ways to fix this:
               - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                 https://nextjs.org/docs/messages/blocking-prerender-runtime#wrap-in-or-move-into-suspense
               - [block] Set \`export const instant = false\` to allow a blocking route
                 https://nextjs.org/docs/messages/blocking-prerender-runtime#allow-blocking-route
                 at div (<anonymous>)
                 at div (<anonymous>)
                 at body (<anonymous>)
                 at html (<anonymous>)
                 at a (<anonymous>)
             Build-time instant validation failed for route "/suspense-in-root/static/route-group-segment-config-only".
             To get a more detailed stack trace and pinpoint the issue, try one of the following:
               - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/route-group-segment-config-only" in your browser to investigate the error.
               - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
             Stopping prerender due to instant validation errors."
            `)
          expect(result.exitCode).toBe(1)
        }
      }
    })

    it('invalid - config on route group layout - cookies() blocks in deeper segment', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/route-group-config-with-deeper-segment/inner'
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
                   "source": "app/suspense-in-root/static/route-group-config-with-deeper-segment/(group)/layout.tsx (3:24) @ instant
             > 3 | export const instant = { level: 'experimental-error' }
                 |                        ^",
                   "stack": [
                     "instant app/suspense-in-root/static/route-group-config-with-deeper-segment/(group)/layout.tsx (3:24)",
                     "Set.forEach <anonymous>",
                   ],
                 },
               ],
               "code": "E1402",
               "description": "Next.js encountered runtime data during a navigation.",
               "environmentLabel": "Server",
               "label": "Instant",
               "source": "app/suspense-in-root/static/route-group-config-with-deeper-segment/(group)/inner/page.tsx (4:16) @ Page
             > 4 |   await cookies()
                 |                ^",
               "stack": [
                 "Page app/suspense-in-root/static/route-group-config-with-deeper-segment/(group)/inner/page.tsx (4:16)",
               ],
             }
            `)
        }
      } else {
        const result = await prerender(
          '/suspense-in-root/static/route-group-config-with-deeper-segment/(group)/inner'
        )
        if (partialPrefetching) {
          // This page uses a runtime shell, so it can use cookies
          // TODO(app-shells): missing "allow-runtime"
          expectNoBuildValidationErrors(result)
        } else {
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
             "Error: Route "/suspense-in-root/static/route-group-config-with-deeper-segment/inner": Next.js encountered runtime data during prerendering or a navigation.

             \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

             Ways to fix this:
               - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                 https://nextjs.org/docs/messages/blocking-prerender-runtime#wrap-in-or-move-into-suspense
               - [block] Set \`export const instant = false\` to allow a blocking route
                 https://nextjs.org/docs/messages/blocking-prerender-runtime#allow-blocking-route
                 at div (<anonymous>)
                 at div (<anonymous>)
                 at body (<anonymous>)
                 at html (<anonymous>)
                 at a (<anonymous>)
             Build-time instant validation failed for route "/suspense-in-root/static/route-group-config-with-deeper-segment/inner".
             To get a more detailed stack trace and pinpoint the issue, try one of the following:
               - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/route-group-config-with-deeper-segment/inner" in your browser to investigate the error.
               - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
             Stopping prerender due to instant validation errors."
            `)
          expect(result.exitCode).toBe(1)
        }
      }
    })

    it('invalid - config on segment layout inside route group - cookies() blocks below', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/route-group-deeper-segment-config/inner'
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
                   "source": "app/suspense-in-root/static/route-group-deeper-segment-config/(group)/inner/layout.tsx (3:24) @ instant
             > 3 | export const instant = { level: 'experimental-error' }
                 |                        ^",
                   "stack": [
                     "instant app/suspense-in-root/static/route-group-deeper-segment-config/(group)/inner/layout.tsx (3:24)",
                     "Set.forEach <anonymous>",
                   ],
                 },
               ],
               "code": "E1402",
               "description": "Next.js encountered runtime data during a navigation.",
               "environmentLabel": "Server",
               "label": "Instant",
               "source": "app/suspense-in-root/static/route-group-deeper-segment-config/(group)/inner/page.tsx (4:16) @ Page
             > 4 |   await cookies()
                 |                ^",
               "stack": [
                 "Page app/suspense-in-root/static/route-group-deeper-segment-config/(group)/inner/page.tsx (4:16)",
               ],
             }
            `)
        }
      } else {
        const result = await prerender(
          '/suspense-in-root/static/route-group-deeper-segment-config/(group)/inner'
        )
        if (partialPrefetching) {
          // This page uses a runtime shell, so it can use cookies
          // TODO(app-shells): missing "allow-runtime"
          expectNoBuildValidationErrors(result)
        } else {
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
             "Error: Route "/suspense-in-root/static/route-group-deeper-segment-config/inner": Next.js encountered runtime data during prerendering or a navigation.

             \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

             Ways to fix this:
               - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                 https://nextjs.org/docs/messages/blocking-prerender-runtime#wrap-in-or-move-into-suspense
               - [block] Set \`export const instant = false\` to allow a blocking route
                 https://nextjs.org/docs/messages/blocking-prerender-runtime#allow-blocking-route
                 at div (<anonymous>)
                 at div (<anonymous>)
                 at body (<anonymous>)
                 at html (<anonymous>)
                 at a (<anonymous>)
             Build-time instant validation failed for route "/suspense-in-root/static/route-group-deeper-segment-config/inner".
             To get a more detailed stack trace and pinpoint the issue, try one of the following:
               - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/route-group-deeper-segment-config/inner" in your browser to investigate the error.
               - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
             Stopping prerender due to instant validation errors."
            `)
          expect(result.exitCode).toBe(1)
        }
      }
    })
  })

  describe('route group shared boundary', () => {
    // When navigating from /foo to /, (outer)/layout is shared — its
    // Suspense doesn't apply to the new tree. (inner)/layout awaits
    // cookies() without its own Suspense, so the navigation should
    // block and produce a validation error. The group depth iteration
    // catches this by treating (outer) as shared and (inner) as new.
    it('invalid - blocking layout inside shared route group boundary', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/route-group-shared-boundary'
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
                   "source": "app/suspense-in-root/static/route-group-shared-boundary/(outer)/(inner)/page.tsx (6:24) @ instant
             > 6 | export const instant = { level: 'experimental-error' }
                 |                        ^",
                   "stack": [
                     "instant app/suspense-in-root/static/route-group-shared-boundary/(outer)/(inner)/page.tsx (6:24)",
                     "Set.forEach <anonymous>",
                   ],
                 },
               ],
               "code": "E1402",
               "description": "Next.js encountered runtime data during a navigation.",
               "environmentLabel": "Server",
               "label": "Instant",
               "source": "app/suspense-in-root/static/route-group-shared-boundary/(outer)/(inner)/layout.tsx (13:16) @ InnerLayout
             > 13 |   await cookies()
                  |                ^",
               "stack": [
                 "InnerLayout app/suspense-in-root/static/route-group-shared-boundary/(outer)/(inner)/layout.tsx (13:16)",
               ],
             }
            `)
        }
      } else {
        const result = await prerender(
          '/suspense-in-root/static/route-group-shared-boundary/(outer)/(inner)'
        )
        if (partialPrefetching) {
          // This page uses a runtime shell, so it can use cookies
          // TODO(app-shells): missing "allow-runtime"
          expectNoBuildValidationErrors(result)
        } else {
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
             "Error: Route "/suspense-in-root/static/route-group-shared-boundary": Next.js encountered runtime data during prerendering or a navigation.

             \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

             Ways to fix this:
               - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                 https://nextjs.org/docs/messages/blocking-prerender-runtime#wrap-in-or-move-into-suspense
               - [block] Set \`export const instant = false\` to allow a blocking route
                 https://nextjs.org/docs/messages/blocking-prerender-runtime#allow-blocking-route
                 at a (<anonymous>)
                 at div (<anonymous>)
                 at body (<anonymous>)
                 at html (<anonymous>)
                 at b (<anonymous>)
             Build-time instant validation failed for route "/suspense-in-root/static/route-group-shared-boundary".
             To get a more detailed stack trace and pinpoint the issue, try one of the following:
               - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/route-group-shared-boundary" in your browser to investigate the error.
               - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
             Stopping prerender due to instant validation errors."
            `)
          expect(result.exitCode).toBe(1)
        }
      }
    })
  })

  describe('parallel slots with different group depths', () => {
    // @slot has 3 groups, children has 2 groups. The validation
    // iterates from deepest group depth (3) down to 0. Deeper
    // holes in one slot are detected before shallower holes in
    // another slot because the shallower slot stays entirely
    // shared at higher group depths.

    it('invalid - deep hole in @slot detected before shallow hole in children', async () => {
      // @slot/(g1)/(g2)/(g3)/layout.tsx has cookies() — the 3rd group blocks.
      // (b1)/(b2)/layout.tsx has cookies() — the 2nd group blocks.
      // At groupDepth=2: @slot's g2 is boundary, g3 enters new tree →
      // g3's cookies() detected at Static stage. children only has
      // 2 groups which is < groupDepth=2, so children stays entirely
      // shared. Only @slot's error is reported.
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/parallel-group-depths-deep-slot-hole'
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
                   "source": "app/suspense-in-root/static/parallel-group-depths-deep-slot-hole/@slot/(g1)/(g2)/(g3)/page.tsx (1:24) @ instant
             > 1 | export const instant = { level: 'experimental-error' }
                 |                        ^",
                   "stack": [
                     "instant app/suspense-in-root/static/parallel-group-depths-deep-slot-hole/@slot/(g1)/(g2)/(g3)/page.tsx (1:24)",
                     "Set.forEach <anonymous>",
                   ],
                 },
               ],
               "code": "E1402",
               "description": "Next.js encountered runtime data during a navigation.",
               "environmentLabel": "Server",
               "label": "Instant",
               "source": "app/suspense-in-root/static/parallel-group-depths-deep-slot-hole/@slot/(g1)/(g2)/(g3)/layout.tsx (7:16) @ G3Layout
             >  7 |   await cookies()
                  |                ^",
               "stack": [
                 "G3Layout app/suspense-in-root/static/parallel-group-depths-deep-slot-hole/@slot/(g1)/(g2)/(g3)/layout.tsx (7:16)",
               ],
             }
            `)
        }
      } else {
        const result = await prerender(
          '/suspense-in-root/static/parallel-group-depths-deep-slot-hole/(b1)/(b2)'
        )
        if (partialPrefetching) {
          // This page uses a runtime shell, so it can use cookies
          // TODO(app-shells): missing "allow-runtime"
          expectNoBuildValidationErrors(result)
        } else {
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
             "Error: Route "/suspense-in-root/static/parallel-group-depths-deep-slot-hole": Next.js encountered runtime data during prerendering or a navigation.

             \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

             Ways to fix this:
               - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                 https://nextjs.org/docs/messages/blocking-prerender-runtime#wrap-in-or-move-into-suspense
               - [block] Set \`export const instant = false\` to allow a blocking route
                 https://nextjs.org/docs/messages/blocking-prerender-runtime#allow-blocking-route
                 at div (<anonymous>)
                 at div (<anonymous>)
                 at body (<anonymous>)
                 at html (<anonymous>)
                 at a (<anonymous>)
             Build-time instant validation failed for route "/suspense-in-root/static/parallel-group-depths-deep-slot-hole".
             To get a more detailed stack trace and pinpoint the issue, try one of the following:
               - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/parallel-group-depths-deep-slot-hole" in your browser to investigate the error.
               - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
             Stopping prerender due to instant validation errors."
            `)
          expect(result.exitCode).toBe(1)
        }
      }
    })

    it('invalid - children hole detected before shallow @slot hole', async () => {
      // @slot/(g1)/layout.tsx has cookies() — the 1st group blocks.
      // (b1)/(b2)/layout.tsx has cookies() — the 2nd group blocks.
      // At groupDepth=1: @slot's g1 is boundary (shared, cookies()
      // runs at Dynamic stage — not detected). children's b1 is
      // boundary, b2 enters new tree → b2's cookies() detected.
      // The "caused by" config source differs between bundlers due
      // to parallel route key iteration order when slot markers
      // aren't supported in webpack.
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/parallel-group-depths-shallow-slot-hole'
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
                   "source": "app/suspense-in-root/static/parallel-group-depths-shallow-slot-hole/(b1)/(b2)/page.tsx (1:24) @ instant
             > 1 | export const instant = { level: 'experimental-error' }
                 |                        ^",
                   "stack": [
                     "instant app/suspense-in-root/static/parallel-group-depths-shallow-slot-hole/(b1)/(b2)/page.tsx (1:24)",
                     "Set.forEach <anonymous>",
                   ],
                 },
               ],
               "code": "E1402",
               "description": "Next.js encountered runtime data during a navigation.",
               "environmentLabel": "Server",
               "label": "Instant",
               "source": "app/suspense-in-root/static/parallel-group-depths-shallow-slot-hole/(b1)/(b2)/layout.tsx (5:16) @ B2Layout
             > 5 |   await cookies()
                 |                ^",
               "stack": [
                 "B2Layout app/suspense-in-root/static/parallel-group-depths-shallow-slot-hole/(b1)/(b2)/layout.tsx (5:16)",
               ],
             }
            `)
        }
      } else {
        const result = await prerender(
          '/suspense-in-root/static/parallel-group-depths-shallow-slot-hole/(b1)/(b2)'
        )
        if (partialPrefetching) {
          // This page uses a runtime shell, so it can use cookies
          // TODO(app-shells): missing "allow-runtime"
          expectNoBuildValidationErrors(result)
        } else {
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
             "Error: Route "/suspense-in-root/static/parallel-group-depths-shallow-slot-hole": Next.js encountered runtime data during prerendering or a navigation.

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
             Build-time instant validation failed for route "/suspense-in-root/static/parallel-group-depths-shallow-slot-hole".
             To get a more detailed stack trace and pinpoint the issue, try one of the following:
               - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/parallel-group-depths-shallow-slot-hole" in your browser to investigate the error.
               - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
             Stopping prerender due to instant validation errors."
            `)
          expect(result.exitCode).toBe(1)
        }
      }
    })
  })

  // TODO(instant-validation): The error message for this case is
  // technically correct but confusing. The developer configured
  // runtime prefetching on the inner layout, so they expect
  // cookies() to be fine. But the parent layout above the config
  // gets static prefetching by default, making cookies() a
  // blocking violation. The error should explain that segments
  // above the config use static prefetching and suggest either
  // moving the config up or adding Suspense around the runtime
  // data in the parent layout.
  // TODO(app-shells): figure out if this test is still relevant (app shells can access cookies)
  it.skip('invalid - static layout above runtime config blocks navigation', async () => {
    if (isNextDev) {
      const browser = await navigateTo(
        '/suspense-in-root/runtime/static-layout-above-runtime-config/inner'
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
                 "source": "app/suspense-in-root/runtime/static-layout-above-runtime-config/inner/layout.tsx (6:24) @ instant
           > 6 | export const instant = { level: 'experimental-error' }
               |                        ^",
                 "stack": [
                   "instant app/suspense-in-root/runtime/static-layout-above-runtime-config/inner/layout.tsx (6:24)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1402",
             "description": "Next.js encountered runtime data during a navigation.",
             "environmentLabel": "Server",
             "label": "Instant",
             "source": "app/suspense-in-root/runtime/static-layout-above-runtime-config/layout.tsx (15:16) @ StaticLayout
           > 15 |   await cookies()
                |                ^",
             "stack": [
               "StaticLayout app/suspense-in-root/runtime/static-layout-above-runtime-config/layout.tsx (15:16)",
             ],
           }
          `)
      }
    } else {
      const result = await prerender(
        '/suspense-in-root/runtime/static-layout-above-runtime-config/inner'
      )
      if (partialPrefetching) {
        // This page uses a runtime shell, so it can use cookies
        // TODO(app-shells): missing "allow-runtime"
        expectNoBuildValidationErrors(result)
      } else {
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/runtime/static-layout-above-runtime-config/inner": Next.js encountered runtime data during prerendering or a navigation.

           \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

           Ways to fix this:
             - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
               https://nextjs.org/docs/messages/blocking-prerender-runtime#wrap-in-or-move-into-suspense
             - [block] Set \`export const instant = false\` to allow a blocking route
               https://nextjs.org/docs/messages/blocking-prerender-runtime#allow-blocking-route
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
           Build-time instant validation failed for route "/suspense-in-root/runtime/static-layout-above-runtime-config/inner".
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/runtime/static-layout-above-runtime-config/inner" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
           Stopping prerender due to instant validation errors."
          `)
        expect(result.exitCode).toBe(1)
      }
    }
  })

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
                   "source": "app/suspense-in-root/static/config-depth-preference/deeper/still/deep/page.tsx (3:24) @ instant
             > 3 | export const instant = { level: 'experimental-error' }
                 |                        ^",
                   "stack": [
                     "instant app/suspense-in-root/static/config-depth-preference/deeper/still/deep/page.tsx (3:24)",
                     "Set.forEach <anonymous>",
                   ],
                 },
               ],
               "code": "E1402",
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
        }
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
                   "source": "app/suspense-in-root/static/config-depth-preference-slot-wins/deeper/@anotherSlot/still/deep/page.tsx (3:24) @ instant
             > 3 | export const instant = { level: 'experimental-error' }
                 |                        ^",
                   "stack": [
                     "instant app/suspense-in-root/static/config-depth-preference-slot-wins/deeper/@anotherSlot/still/deep/page.tsx (3:24)",
                     "Set.forEach <anonymous>",
                   ],
                 },
               ],
               "code": "E1402",
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
        }
      } else {
        const result = await prerender(
          '/suspense-in-root/static/config-depth-preference-slot-wins/deeper/[...rest]'
        )
        if (partialPrefetching) {
          // This page uses a runtime shell, so it can use cookies
          // TODO(app-shells): missing "allow-runtime"
          expectNoBuildValidationErrors(result)
        } else {
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
             "Error: Route "/suspense-in-root/static/config-depth-preference-slot-wins/deeper/[...rest]": Next.js encountered runtime data during prerendering or a navigation.

             \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

             Ways to fix this:
               - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                 https://nextjs.org/docs/messages/blocking-prerender-runtime#wrap-in-or-move-into-suspense
               - [block] Set \`export const instant = false\` to allow a blocking route
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
      }
    })

    it('invalid - children config preferred at equal depth', async () => {
      // children and @other both have config at same depth (page level)
      // @slot blocks with no config — cause should be children's config
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/config-children-preferred'
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
                   "source": "app/suspense-in-root/static/config-children-preferred/page.tsx (4:24) @ instant
             > 4 | export const instant = { level: 'experimental-error' }
                 |                        ^",
                   "stack": [
                     "instant app/suspense-in-root/static/config-children-preferred/page.tsx (4:24)",
                     "Set.forEach <anonymous>",
                   ],
                 },
               ],
               "code": "E1402",
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
        }
      } else {
        const result = await prerender(
          '/suspense-in-root/static/config-children-preferred'
        )
        if (partialPrefetching) {
          // This page uses a runtime shell, so it can use cookies
          // TODO(app-shells): missing "allow-runtime"
          expectNoBuildValidationErrors(result)
        } else {
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
             "Error: Route "/suspense-in-root/static/config-children-preferred": Next.js encountered runtime data during prerendering or a navigation.

             \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

             Ways to fix this:
               - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                 https://nextjs.org/docs/messages/blocking-prerender-runtime#wrap-in-or-move-into-suspense
               - [block] Set \`export const instant = false\` to allow a blocking route
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
                   "source": "app/suspense-in-root/static/cross-slot-blocking/inner/deep/page.tsx (5:24) @ instant
             > 5 | export const instant = { level: 'experimental-error' }
                 |                        ^",
                   "stack": [
                     "instant app/suspense-in-root/static/cross-slot-blocking/inner/deep/page.tsx (5:24)",
                     "Set.forEach <anonymous>",
                   ],
                 },
               ],
               "code": "E1402",
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
        }
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
}
