import { nextTestSetup } from 'e2e-utils'
import {
  expectBuildValidationSkipped,
  extractBuildValidationError,
  parseValidationMessages,
} from 'e2e-utils/instant-validation'
import { getPrerenderOutput } from '../cache-components-errors/utils'
import { waitForNoErrorToast } from '../../../lib/next-test-utils'

describe('instant validation - level manual-warning', () => {
  const { next, skipped, isNextDev, isNextStart, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
    env: {
      NEXT_TEST_LOG_VALIDATION: '1',
    },
  })
  if (skipped) return

  if (isNextStart && !isTurbopack) {
    it.skip('TODO: snapshot tests for webpack', () => {})
    return
  }

  if (isNextStart) {
    beforeAll(async () => {
      await next.build({ args: ['--experimental-build-mode', 'compile'] })
    })
    afterEach(async () => {
      await next.stop()
    })
  } else {
    beforeAll(async () => {
      await next.start()
    })
  }

  const prerender = async (pathname: string) => {
    return await next.build({
      args: [
        '--experimental-build-mode',
        'generate',
        '--debug-build-paths',
        `app${pathname}/page.tsx`,
      ],
    })
  }

  // The fixture has two parallel route trees:
  //
  // - `with-root-suspense/`: layout wraps {children} in Suspense, so
  //   static-shell validation is satisfied for pages that access runtime
  //   data at the top. Under 'manual-warning', instant validation only
  //   runs on segments that explicitly opt in via `unstable_instant`, so
  //   violating bare pages produce no errors at all.
  //
  // - `without-root-suspense/`: layout renders {children} directly. A
  //   bare violating page has no Suspense between the layout and the
  //   runtime data, so static-shell validation surfaces an error. Under
  //   'manual-warning', instant validation still does not run on bare
  //   pages, so the error visible to the user is a static-shell error —
  //   distinct from the instant validation error format.
  //
  // The contrast between the two trees demonstrates that 'manual-warning'
  // does not silently opt routes into instant validation that hadn't
  // asked for it.

  describe('with-root-suspense', () => {
    if (isNextDev) {
      describe('dev', () => {
        it('bare page: no errors (static shell satisfied, no manual opt-in)', async () => {
          const browser = await next.browser('/with-root-suspense/bare')
          await browser.elementByCss('main')
          await waitForNoErrorToast(browser, { waitInMs: 500 })
        })

        it('explicit-error page: instant redbox surfaces under manual-warning', async () => {
          const browser = await next.browser(
            '/with-root-suspense/explicit-error'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/with-root-suspense/explicit-error/page.tsx (8:33) @ unstable_instant
           >  8 | export const unstable_instant = { level: 'experimental-error' as const }
                |                                 ^",
                 "stack": [
                   "unstable_instant app/with-root-suspense/explicit-error/page.tsx (8:33)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1317",
             "description": "Next.js encountered uncached data during a navigation.",
             "environmentLabel": "Server",
             "label": "Instant",
             "source": "app/with-root-suspense/explicit-error/page.tsx (11:19) @ Page
           > 11 |   await connection()
                |                   ^",
             "stack": [
               "Page app/with-root-suspense/explicit-error/page.tsx (11:19)",
             ],
           }
          `)
        })

        it('explicit-true page: opt-in falls back to warning level, instant redbox in dev', async () => {
          const browser = await next.browser(
            '/with-root-suspense/explicit-true'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/with-root-suspense/explicit-true/page.tsx (7:33) @ unstable_instant
           >  7 | export const unstable_instant = true
                |                                 ^",
                 "stack": [
                   "unstable_instant app/with-root-suspense/explicit-true/page.tsx (7:33)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1317",
             "description": "Next.js encountered uncached data during a navigation.",
             "environmentLabel": "Server",
             "label": "Instant",
             "source": "app/with-root-suspense/explicit-true/page.tsx (10:19) @ Page
           > 10 |   await connection()
                |                   ^",
             "stack": [
               "Page app/with-root-suspense/explicit-true/page.tsx (10:19)",
             ],
           }
          `)
        })

        it('explicit-warning page: instant redbox in dev', async () => {
          const browser = await next.browser(
            '/with-root-suspense/explicit-warning'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/with-root-suspense/explicit-warning/page.tsx (6:33) @ unstable_instant
           > 6 | export const unstable_instant = { level: 'warning' as const }
               |                                 ^",
                 "stack": [
                   "unstable_instant app/with-root-suspense/explicit-warning/page.tsx (6:33)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1317",
             "description": "Next.js encountered uncached data during a navigation.",
             "environmentLabel": "Server",
             "label": "Instant",
             "source": "app/with-root-suspense/explicit-warning/page.tsx (9:19) @ Page
           >  9 |   await connection()
                |                   ^",
             "stack": [
               "Page app/with-root-suspense/explicit-warning/page.tsx (9:19)",
             ],
           }
          `)
        })
      })
    } else {
      describe('build', () => {
        it('bare page: no instant validation markers', async () => {
          const result = await prerender('/with-root-suspense/bare')
          expectBuildValidationSkipped(result)
        })

        it('explicit-true page: build skips validation (opt-in level falls back to warning)', async () => {
          const result = await prerender('/with-root-suspense/explicit-true')
          expectBuildValidationSkipped(result)
        })

        it('explicit-warning page: build skips validation (warning is dev-only)', async () => {
          const result = await prerender('/with-root-suspense/explicit-warning')
          expectBuildValidationSkipped(result)
        })

        it('explicit-error page: instant validation runs and fails the build', async () => {
          const result = await prerender('/with-root-suspense/explicit-error')
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/with-root-suspense/explicit-error": Next.js encountered uncached data during prerendering or a navigation.

           \`fetch(...)\` or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

           Ways to fix this:
             - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
               https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
             - [cache] Cache the data access with \`"use cache"\`
               https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
             - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
               https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
               at a (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
           Build-time instant validation failed for route "/with-root-suspense/explicit-error".
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/with-root-suspense/explicit-error" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).not.toBe(0)
        })
      })
    }
  })

  describe('without-root-suspense', () => {
    if (isNextDev) {
      describe('dev', () => {
        it('bare page: static-shell error surfaces but is not labelled Instant', async () => {
          const browser = await next.browser('/without-root-suspense/bare')
          // Static-shell validation surfaces an error here because the
          // layout has no Suspense to catch the runtime data accessed at
          // the top of the page. The captured snapshot should NOT contain
          // the "Instant" label — that's the proof that instant validation
          // did not run under 'manual-warning'.
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "code": "E1318",
             "description": "Next.js encountered uncached data during prerendering.",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/without-root-suspense/bare/page.tsx (10:19) @ Page
           > 10 |   await connection()
                |                   ^",
             "stack": [
               "Page app/without-root-suspense/bare/page.tsx (10:19)",
             ],
           }
          `)
        })

        it('explicit-error page: instant redbox surfaces (instant subsumes static-shell when active)', async () => {
          const browser = await next.browser(
            '/without-root-suspense/explicit-error'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "code": "E1318",
             "description": "Next.js encountered uncached data during prerendering.",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/without-root-suspense/explicit-error/page.tsx (11:19) @ Page
           > 11 |   await connection()
                |                   ^",
             "stack": [
               "Page app/without-root-suspense/explicit-error/page.tsx (11:19)",
             ],
           }
          `)
        })

        it('explicit-true page: instant redbox surfaces in dev', async () => {
          const browser = await next.browser(
            '/without-root-suspense/explicit-true'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "code": "E1318",
             "description": "Next.js encountered uncached data during prerendering.",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/without-root-suspense/explicit-true/page.tsx (11:19) @ Page
           > 11 |   await connection()
                |                   ^",
             "stack": [
               "Page app/without-root-suspense/explicit-true/page.tsx (11:19)",
             ],
           }
          `)
        })

        it('explicit-warning page: instant redbox surfaces in dev', async () => {
          const browser = await next.browser(
            '/without-root-suspense/explicit-warning'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "code": "E1318",
             "description": "Next.js encountered uncached data during prerendering.",
             "environmentLabel": "Server",
             "label": "Blocking Route",
             "source": "app/without-root-suspense/explicit-warning/page.tsx (10:19) @ Page
           > 10 |   await connection()
                |                   ^",
             "stack": [
               "Page app/without-root-suspense/explicit-warning/page.tsx (10:19)",
             ],
           }
          `)
        })
      })
    } else {
      describe('build', () => {
        // In build mode, cacheComponents' static-shell prerender catches the
        // empty-shell first and fails the build before instant validation
        // gets a chance to run. The build exits non-zero, but the failure
        // is NOT from instant validation: no `<VALIDATION_MESSAGE>` markers,
        // no "Build-time instant validation failed" text. The
        // `getPrerenderOutput` snapshot captures the actual error format —
        // it should be a static-shell prerender error, distinct from the
        // instant validation error captured in `with-root-suspense`.

        function expectBuildFailedWithoutInstantValidation(result: {
          cliOutput: string
          exitCode: number | NodeJS.Signals
        }) {
          expect(parseValidationMessages(result.cliOutput)).toHaveLength(0)
          expect(result.cliOutput).not.toContain(
            'Build-time instant validation failed'
          )
          expect(result.exitCode).not.toBe(0)
        }

        it('bare page: build fails with static-shell error, not instant', async () => {
          const result = await prerender('/without-root-suspense/bare')
          expectBuildFailedWithoutInstantValidation(result)
          expect(getPrerenderOutput(result.cliOutput, { isMinified: true }))
            .toMatchInlineSnapshot(`
           "Error: Route "/without-root-suspense/bare": Next.js encountered uncached or runtime data during prerendering.

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
             - Start the app in development mode by running \`next dev\`, then open "/without-root-suspense/bare" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
           Error occurred prerendering page "/without-root-suspense/bare". Read more: https://nextjs.org/docs/messages/prerender-error
           Export encountered an error on /without-root-suspense/bare/page: /without-root-suspense/bare, exiting the build."
          `)
        })

        it('explicit-true page: build fails with static-shell error, not instant', async () => {
          const result = await prerender('/without-root-suspense/explicit-true')
          expectBuildFailedWithoutInstantValidation(result)
          expect(getPrerenderOutput(result.cliOutput, { isMinified: true }))
            .toMatchInlineSnapshot(`
           "Error: Route "/without-root-suspense/explicit-true": Next.js encountered uncached or runtime data during prerendering.

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
             - Start the app in development mode by running \`next dev\`, then open "/without-root-suspense/explicit-true" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
           Error occurred prerendering page "/without-root-suspense/explicit-true". Read more: https://nextjs.org/docs/messages/prerender-error
           Export encountered an error on /without-root-suspense/explicit-true/page: /without-root-suspense/explicit-true, exiting the build."
          `)
        })

        it('explicit-warning page: build fails with static-shell error, not instant', async () => {
          const result = await prerender(
            '/without-root-suspense/explicit-warning'
          )
          expectBuildFailedWithoutInstantValidation(result)
          expect(getPrerenderOutput(result.cliOutput, { isMinified: true }))
            .toMatchInlineSnapshot(`
           "Error: Route "/without-root-suspense/explicit-warning": Next.js encountered uncached or runtime data during prerendering.

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
             - Start the app in development mode by running \`next dev\`, then open "/without-root-suspense/explicit-warning" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
           Error occurred prerendering page "/without-root-suspense/explicit-warning". Read more: https://nextjs.org/docs/messages/prerender-error
           Export encountered an error on /without-root-suspense/explicit-warning/page: /without-root-suspense/explicit-warning, exiting the build."
          `)
        })

        it('explicit-error page: build fails with static-shell error, not instant', async () => {
          // Even with `unstable_instant = { level: 'experimental-error' }`, the build
          // fails at the prerender step (empty static shell) before the
          // instant validation pipeline runs. The error reported is the
          // static-shell error, not "Build-time instant validation failed".
          const result = await prerender(
            '/without-root-suspense/explicit-error'
          )
          expectBuildFailedWithoutInstantValidation(result)
          expect(getPrerenderOutput(result.cliOutput, { isMinified: true }))
            .toMatchInlineSnapshot(`
           "Error: Route "/without-root-suspense/explicit-error": Next.js encountered uncached or runtime data during prerendering.

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
             - Start the app in development mode by running \`next dev\`, then open "/without-root-suspense/explicit-error" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
           Error occurred prerendering page "/without-root-suspense/explicit-error". Read more: https://nextjs.org/docs/messages/prerender-error
           Export encountered an error on /without-root-suspense/explicit-error/page: /without-root-suspense/explicit-error, exiting the build."
          `)
        })
      })
    }
  })
})
