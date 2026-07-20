import { nextTestSetup } from 'e2e-utils'
import {
  expectBuildValidationSkipped,
  extractBuildValidationError,
} from 'e2e-utils/instant-validation'
import { waitForNoErrorToast } from '../../../lib/next-test-utils'

describe('instant validation - level manual-error', () => {
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

  // Validation level is 'experimental-manual-error'. Implicit validation
  // does NOT fire on bare pages — only segments that explicitly opt in via
  // `instant` are validated. When they are validated, the level is
  // error (applies in dev AND build), unless de-escalated by a per-segment
  // `level: 'warning'` override.
  //
  // Static-shell concerns are handled by the root layout's Suspense, so the
  // only errors that surface here are instant validation errors — making
  // the level/override behavior cleanly observable.

  if (isNextDev) {
    describe('dev', () => {
      it('bare page: no errors (no implicit validation under manual-error)', async () => {
        const browser = await next.browser('/bare')
        await browser.elementByCss('main')
        await waitForNoErrorToast(browser, { waitInMs: 500 })
      })

      it('explicit-error page: explicit override at the configured level, instant redbox in dev', async () => {
        const browser = await next.browser('/explicit-error')
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "cause": [
             {
               "label": "Caused by: Instant Validation",
               "source": "app/explicit-error/page.tsx (8:24) @ instant
         >  8 | export const instant = { level: 'experimental-error' as const }
              |                        ^",
               "stack": [
                 "instant app/explicit-error/page.tsx (8:24)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
           "code": "E1437",
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
               "source": "app/explicit-true/page.tsx (9:24) @ instant
         >  9 | export const instant = true
              |                        ^",
               "stack": [
                 "instant app/explicit-true/page.tsx (9:24)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
           "code": "E1437",
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
               "source": "app/explicit-warning/page.tsx (8:24) @ instant
         >  8 | export const instant = { level: 'warning' as const }
              |                        ^",
               "stack": [
                 "instant app/explicit-warning/page.tsx (8:24)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
           "code": "E1437",
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

      it('layered: bare page under layout-with-instant-false has no errors', async () => {
        // The intermediate layout exports `instant = false`, but
        // that only opts the layout out — it doesn't pull descendants into
        // validation. Under manual-error, the bare descendant has no
        // explicit opt-in, so no implicit validation runs.
        const browser = await next.browser('/layered')
        await browser.elementByCss('main')
        await waitForNoErrorToast(browser, { waitInMs: 500 })
      })
    })
  } else {
    describe('build', () => {
      it('bare page: build validation skipped (no implicit validation under manual-error)', async () => {
        const result = await prerender('/bare')
        expectBuildValidationSkipped(result)
      })

      it('explicit-error page: build validation runs and fails the build', async () => {
        const result = await prerender('/explicit-error')
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
         "Error: Route "/explicit-error": Next.js encountered uncached data during prerendering or a navigation.

         \`fetch(...)\` or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

         Ways to fix this:
           - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
           - [cache] Cache the data access with \`"use cache"\` (does not apply to \`connection()\`)
           - [block] Set \`export const instant = false\` to allow a blocking route

         Learn more: https://nextjs.org/docs/messages/blocking-prerender-dynamic
             at H (../../../packages/next/dist/esm/client/components/layout-router.js:266:34)
             at a (../../../packages/next/dist/esm/client/components/redirect-boundary.js:28:9)
             at b (../../../packages/next/dist/esm/client/components/redirect-boundary.js:70:36)
             at <unknown> (../../../packages/next/dist/esm/client/components/http-access-fallback/error-boundary.js:94:46)
             at I (../../../packages/next/dist/esm/client/components/layout-router.js:389:32)
             at c (../../../packages/next/dist/esm/client/components/error-boundary.js:105:37)
             at F (../../../packages/next/dist/esm/client/components/layout-router.js:100:9)
             at G (../../../packages/next/dist/esm/client/components/layout-router.js:249:39)
             at __next_instant_validation_boundary__ (../../../packages/next/dist/esm/server/app-render/instant-validation/boundary-impl.js:41:52)
             at a.s.name (../../../packages/next/dist/esm/server/app-render/instant-validation/boundary-impl.js:63:55)
             at <unknown> (../../../packages/next/dist/esm/client/components/layout-router.js:418:49)
             at a.s.id (../../../packages/next/dist/esm/server/app-render/instant-validation/boundary-impl.js:56:57)
             at H (../../../packages/next/dist/esm/client/components/layout-router.js:266:34)
             at d (../../../packages/next/dist/esm/client/components/redirect-boundary.js:28:9)
             at e (../../../packages/next/dist/esm/client/components/redirect-boundary.js:70:36)
             at f (../../../packages/next/dist/esm/client/components/http-access-fallback/error-boundary.js:18:9)
             at <unknown> (../../../packages/next/dist/esm/client/components/http-access-fallback/error-boundary.js:94:46)
             at I (../../../packages/next/dist/esm/client/components/layout-router.js:389:32)
             at g (../../../packages/next/dist/esm/client/components/error-boundary.js:105:37)
             at F (../../../packages/next/dist/esm/client/components/layout-router.js:100:9)
             at G (../../../packages/next/dist/esm/client/components/layout-router.js:249:39)
             at <unknown> (../../../packages/next/dist/esm/client/components/layout-router.js:418:49)
             at h (<anonymous>)
             at body (<anonymous>)
             at html (<anonymous>)
           264 | /**
           265 |  * InnerLayoutRouter handles rendering the provided segment based on the cache.
         > 266 |  */ function InnerLayoutRouter({ tree, segmentPath, debugNameContext, cacheNode: maybeCacheNode, params, url, isActive }) {
               |                                  ^
           267 |     const context = useContext(GlobalLayoutRouterContext);
           268 |     const parentNavPromises = useContext(NavigationPromisesContext);
           269 |     if (!context) {
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
           - [cache] Cache the data access with \`"use cache"\` (does not apply to \`connection()\`)
           - [block] Set \`export const instant = false\` to allow a blocking route

         Learn more: https://nextjs.org/docs/messages/blocking-prerender-dynamic
             at H (../../../packages/next/dist/esm/client/components/layout-router.js:266:34)
             at a (../../../packages/next/dist/esm/client/components/redirect-boundary.js:28:9)
             at b (../../../packages/next/dist/esm/client/components/redirect-boundary.js:70:36)
             at <unknown> (../../../packages/next/dist/esm/client/components/http-access-fallback/error-boundary.js:94:46)
             at I (../../../packages/next/dist/esm/client/components/layout-router.js:389:32)
             at c (../../../packages/next/dist/esm/client/components/error-boundary.js:105:37)
             at F (../../../packages/next/dist/esm/client/components/layout-router.js:100:9)
             at G (../../../packages/next/dist/esm/client/components/layout-router.js:249:39)
             at __next_instant_validation_boundary__ (../../../packages/next/dist/esm/server/app-render/instant-validation/boundary-impl.js:41:52)
             at a.s.name (../../../packages/next/dist/esm/server/app-render/instant-validation/boundary-impl.js:63:55)
             at <unknown> (../../../packages/next/dist/esm/client/components/layout-router.js:418:49)
             at a.s.id (../../../packages/next/dist/esm/server/app-render/instant-validation/boundary-impl.js:56:57)
             at H (../../../packages/next/dist/esm/client/components/layout-router.js:266:34)
             at d (../../../packages/next/dist/esm/client/components/redirect-boundary.js:28:9)
             at e (../../../packages/next/dist/esm/client/components/redirect-boundary.js:70:36)
             at f (../../../packages/next/dist/esm/client/components/http-access-fallback/error-boundary.js:18:9)
             at <unknown> (../../../packages/next/dist/esm/client/components/http-access-fallback/error-boundary.js:94:46)
             at I (../../../packages/next/dist/esm/client/components/layout-router.js:389:32)
             at g (../../../packages/next/dist/esm/client/components/error-boundary.js:105:37)
             at F (../../../packages/next/dist/esm/client/components/layout-router.js:100:9)
             at G (../../../packages/next/dist/esm/client/components/layout-router.js:249:39)
             at <unknown> (../../../packages/next/dist/esm/client/components/layout-router.js:418:49)
             at h (<anonymous>)
             at body (<anonymous>)
             at html (<anonymous>)
           264 | /**
           265 |  * InnerLayoutRouter handles rendering the provided segment based on the cache.
         > 266 |  */ function InnerLayoutRouter({ tree, segmentPath, debugNameContext, cacheNode: maybeCacheNode, params, url, isActive }) {
               |                                  ^
           267 |     const context = useContext(GlobalLayoutRouterContext);
           268 |     const parentNavPromises = useContext(NavigationPromisesContext);
           269 |     if (!context) {
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

      it('layered: bare page under layout-with-instant-false skips build validation', async () => {
        // Under manual-error, the bare descendant has no explicit
        // `instant` opt-in, so no implicit validation runs.
        const result = await prerender('/layered')
        expectBuildValidationSkipped(result)
      })
    })
  }
})
