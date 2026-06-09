import { nextTestSetup } from 'e2e-utils'
import {
  expectBuildValidationSkipped,
  extractBuildValidationError,
} from 'e2e-utils/instant-validation'
import { waitForNoErrorToast } from '../../../lib/next-test-utils'

describe('instant validation - level error', () => {
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

  // Validation level is 'experimental-error'. Implicit validation fires on
  // bare pages in dev AND build — error level applies to both modes.
  // Per-segment overrides (`level`, `true`, `false`) layer on top of this.
  // A `level: 'warning'` override de-escalates a specific route to dev-only.
  //
  // Static-shell concerns are handled by the root layout's Suspense, so the
  // only errors that surface here are instant validation errors — making
  // the level/override behavior cleanly observable.

  if (isNextDev) {
    describe('dev', () => {
      it('bare page: implicit validation surfaces a redbox (error level fires)', async () => {
        const browser = await next.browser('/bare')
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "code": "E1317",
           "description": "Next.js encountered uncached data during a navigation.",
           "environmentLabel": "Server",
           "label": "Instant",
           "source": "app/bare/page.tsx (11:19) @ Page
         > 11 |   await connection()
              |                   ^",
           "stack": [
             "Page app/bare/page.tsx (11:19)",
           ],
         }
        `)
      })

      it('explicit-error page: explicit override at the configured level, instant redbox in dev', async () => {
        const browser = await next.browser('/explicit-error')
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "cause": [
             {
               "label": "Caused by: Instant Validation",
               "source": "app/explicit-error/page.tsx (8:33) @ unstable_instant
         >  8 | export const unstable_instant = { level: 'experimental-error' as const }
              |                                 ^",
               "stack": [
                 "unstable_instant app/explicit-error/page.tsx (8:33)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
           "code": "E1317",
           "description": "Next.js encountered uncached data during a navigation.",
           "environmentLabel": "Server",
           "label": "Instant",
           "source": "app/explicit-error/page.tsx (11:19) @ Page
         > 11 |   await connection()
              |                   ^",
           "stack": [
             "Page app/explicit-error/page.tsx (11:19)",
           ],
         }
        `)
      })

      it('explicit-true page: aliases to error level, instant redbox in dev', async () => {
        const browser = await next.browser('/explicit-true')
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "cause": [
             {
               "label": "Caused by: Instant Validation",
               "source": "app/explicit-true/page.tsx (9:33) @ unstable_instant
         >  9 | export const unstable_instant = true
              |                                 ^",
               "stack": [
                 "unstable_instant app/explicit-true/page.tsx (9:33)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
           "code": "E1317",
           "description": "Next.js encountered uncached data during a navigation.",
           "environmentLabel": "Server",
           "label": "Instant",
           "source": "app/explicit-true/page.tsx (12:19) @ Page
         > 12 |   await connection()
              |                   ^",
           "stack": [
             "Page app/explicit-true/page.tsx (12:19)",
           ],
         }
        `)
      })

      it('explicit-warning page: per-segment de-escalation still validates in dev', async () => {
        const browser = await next.browser('/explicit-warning')
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "cause": [
             {
               "label": "Caused by: Instant Validation",
               "source": "app/explicit-warning/page.tsx (8:33) @ unstable_instant
         >  8 | export const unstable_instant = { level: 'warning' as const }
              |                                 ^",
               "stack": [
                 "unstable_instant app/explicit-warning/page.tsx (8:33)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
           "code": "E1317",
           "description": "Next.js encountered uncached data during a navigation.",
           "environmentLabel": "Server",
           "label": "Instant",
           "source": "app/explicit-warning/page.tsx (11:19) @ Page
         > 11 |   await connection()
              |                   ^",
           "stack": [
             "Page app/explicit-warning/page.tsx (11:19)",
           ],
         }
        `)
      })

      it('explicit-false page: opt-out suppresses validation, no redbox', async () => {
        const browser = await next.browser('/explicit-false')
        await browser.elementByCss('main')
        await waitForNoErrorToast(browser, { waitInMs: 500 })
      })

      it('layered: bare page under layout-with-instant-false still validates', async () => {
        // The intermediate layout exports `unstable_instant = false`, but
        // that's per-segment — it doesn't shield descendants. The bare
        // page should still surface an instant redbox in dev.
        const browser = await next.browser('/layered')
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "code": "E1317",
           "description": "Next.js encountered uncached data during a navigation.",
           "environmentLabel": "Server",
           "label": "Instant",
           "source": "app/layered/page.tsx (8:19) @ Page
         >  8 |   await connection()
              |                   ^",
           "stack": [
             "Page app/layered/page.tsx (8:19)",
           ],
         }
        `)
      })
    })
  } else {
    describe('build', () => {
      it('bare page: build validation runs and fails the build', async () => {
        const result = await prerender('/bare')
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
         "Error: Route "/bare": Next.js encountered uncached data during prerendering or a navigation.

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
         Build-time instant validation failed for route "/bare".
         To get a more detailed stack trace and pinpoint the issue, try one of the following:
           - Start the app in development mode by running \`next dev\`, then open "/bare" in your browser to investigate the error.
           - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
         Stopping prerender due to instant validation errors."
        `)
        expect(result.exitCode).not.toBe(0)
      })

      it('explicit-error page: build validation runs and fails the build', async () => {
        const result = await prerender('/explicit-error')
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
         "Error: Route "/explicit-error": Next.js encountered uncached data during prerendering or a navigation.

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
         Build-time instant validation failed for route "/explicit-error".
         To get a more detailed stack trace and pinpoint the issue, try one of the following:
           - Start the app in development mode by running \`next dev\`, then open "/explicit-error" in your browser to investigate the error.
           - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
         Stopping prerender due to instant validation errors."
        `)
        expect(result.exitCode).not.toBe(0)
      })

      it('explicit-true page: build validation runs and fails the build (alias to error)', async () => {
        const result = await prerender('/explicit-true')
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
         "Error: Route "/explicit-true": Next.js encountered uncached data during prerendering or a navigation.

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
         Build-time instant validation failed for route "/explicit-true".
         To get a more detailed stack trace and pinpoint the issue, try one of the following:
           - Start the app in development mode by running \`next dev\`, then open "/explicit-true" in your browser to investigate the error.
           - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
         Stopping prerender due to instant validation errors."
        `)
        expect(result.exitCode).not.toBe(0)
      })

      it('explicit-warning page: per-segment de-escalation skips build validation', async () => {
        const result = await prerender('/explicit-warning')
        expectBuildValidationSkipped(result)
      })

      it('explicit-false page: opt-out skips validation', async () => {
        const result = await prerender('/explicit-false')
        expectBuildValidationSkipped(result)
      })

      it('layered: bare page under layout-with-instant-false still fails the build', async () => {
        // The intermediate layout's `unstable_instant = false` doesn't
        // shield descendants. Build validation runs on the bare page and
        // fails because the 'experimental-error' level applies to build.
        const result = await prerender('/layered')
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
         "Error: Route "/layered": Next.js encountered uncached data during prerendering or a navigation.

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
         Build-time instant validation failed for route "/layered".
         To get a more detailed stack trace and pinpoint the issue, try one of the following:
           - Start the app in development mode by running \`next dev\`, then open "/layered" in your browser to investigate the error.
           - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
         Stopping prerender due to instant validation errors."
        `)
        expect(result.exitCode).not.toBe(0)
      })
    })
  }
})
