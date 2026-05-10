import { nextTestSetup } from 'e2e-utils'
import {
  expectBuildValidationSkipped,
  extractBuildValidationError,
} from 'e2e-utils/instant-validation'
import { waitForNoErrorToast } from '../../../lib/next-test-utils'

describe('instant validation - level warning', () => {
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

  // Validation level is 'warning'. Implicit validation fires on bare
  // pages in dev only — build does not validate unless a segment
  // explicitly escalates with `level: 'experimental-error'`. Per-segment overrides
  // (`level`, `true`, `false`) layer on top of this.
  //
  // Static-shell concerns are handled by the root layout's Suspense, so
  // the only errors that surface here are instant validation errors —
  // making the level/override behavior cleanly observable.

  if (isNextDev) {
    describe('dev', () => {
      it('bare page: implicit validation surfaces a redbox (warning level fires)', async () => {
        const browser = await next.browser('/bare')
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "code": "E1254",
           "description": "Next.js encountered uncached data during the initial render.",
           "environmentLabel": "Server",
           "label": "Instant",
           "source": "app/bare/page.tsx (10:19) @ Page
         > 10 |   await connection()
              |                   ^",
           "stack": [
             "Page app/bare/page.tsx (10:19)",
           ],
         }
        `)
      })

      it('explicit-error page: instant redbox surfaces in dev', async () => {
        const browser = await next.browser('/explicit-error')
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "cause": [
             {
               "label": "Caused by: Instant Validation",
               "source": "app/explicit-error/page.tsx (7:33) @ unstable_instant
         >  7 | export const unstable_instant = { level: 'experimental-error' as const }
              |                                 ^",
               "stack": [
                 "unstable_instant app/explicit-error/page.tsx (7:33)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
           "code": "E1254",
           "description": "Next.js encountered uncached data during the initial render.",
           "environmentLabel": "Server",
           "label": "Instant",
           "source": "app/explicit-error/page.tsx (10:19) @ Page
         > 10 |   await connection()
              |                   ^",
           "stack": [
             "Page app/explicit-error/page.tsx (10:19)",
           ],
         }
        `)
      })

      it('explicit-true page: aliases to warning level, instant redbox in dev', async () => {
        const browser = await next.browser('/explicit-true')
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "cause": [
             {
               "label": "Caused by: Instant Validation",
               "source": "app/explicit-true/page.tsx (8:33) @ unstable_instant
         >  8 | export const unstable_instant = true
              |                                 ^",
               "stack": [
                 "unstable_instant app/explicit-true/page.tsx (8:33)",
                 "Set.forEach <anonymous>",
               ],
             },
           ],
           "code": "E1254",
           "description": "Next.js encountered uncached data during the initial render.",
           "environmentLabel": "Server",
           "label": "Instant",
           "source": "app/explicit-true/page.tsx (11:19) @ Page
         > 11 |   await connection()
              |                   ^",
           "stack": [
             "Page app/explicit-true/page.tsx (11:19)",
           ],
         }
        `)
      })

      it('explicit-warning page: explicit override at the configured level, instant redbox in dev', async () => {
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
           "code": "E1254",
           "description": "Next.js encountered uncached data during the initial render.",
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
           "code": "E1254",
           "description": "Next.js encountered uncached data during the initial render.",
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
      it('bare page: build skips validation (warning is dev-only)', async () => {
        const result = await prerender('/bare')
        expectBuildValidationSkipped(result)
      })

      it('explicit-error page: per-segment escalation runs build validation and fails', async () => {
        const result = await prerender('/explicit-error')
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
         "Error: Route "/explicit-error": Next.js encountered uncached data during the initial render or a navigation.

         \`fetch(...)\` or \`connection()\` accessed under \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

         Ways to fix this:
           - Cache the data access with \`"use cache"\`
           - Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
           - Set \`export const instant = false\` to allow a blocking route

         Learn more: https://nextjs.org/docs/messages/blocking-route
             at M (../../../packages/next/dist/esm/client/components/layout-router.js:265:34)
             at a (../../../packages/next/dist/esm/client/components/redirect-boundary.js:28:9)
             at b (../../../packages/next/dist/esm/client/components/redirect-boundary.js:70:36)
             at <unknown> (../../../packages/next/dist/esm/client/components/http-access-fallback/error-boundary.js:94:46)
             at N (../../../packages/next/dist/esm/client/components/layout-router.js:388:32)
             at c (../../../packages/next/dist/esm/client/components/error-boundary.js:105:37)
             at K (../../../packages/next/dist/esm/client/components/layout-router.js:99:9)
             at L (../../../packages/next/dist/esm/client/components/layout-router.js:248:39)
             at <unknown> (../../../packages/next/dist/esm/client/components/layout-router.js:417:49)
             at M (../../../packages/next/dist/esm/client/components/layout-router.js:265:34)
             at d (../../../packages/next/dist/esm/client/components/redirect-boundary.js:28:9)
             at e (../../../packages/next/dist/esm/client/components/redirect-boundary.js:70:36)
             at f (../../../packages/next/dist/esm/client/components/http-access-fallback/error-boundary.js:19:9)
             at <unknown> (../../../packages/next/dist/esm/client/components/http-access-fallback/error-boundary.js:94:46)
             at N (../../../packages/next/dist/esm/client/components/layout-router.js:388:32)
             at g (../../../packages/next/dist/esm/client/components/error-boundary.js:105:37)
             at K (../../../packages/next/dist/esm/client/components/layout-router.js:99:9)
             at L (../../../packages/next/dist/esm/client/components/layout-router.js:248:39)
             at <unknown> (../../../packages/next/dist/esm/client/components/layout-router.js:417:49)
             at h (<anonymous>)
             at body (<anonymous>)
             at html (<anonymous>)
           263 | /**
           264 |  * InnerLayoutRouter handles rendering the provided segment based on the cache.
         > 265 |  */ function InnerLayoutRouter({ tree, segmentPath, debugNameContext, cacheNode: maybeCac...
               |                                  ^
           266 |     const context = useContext(GlobalLayoutRouterContext);
           267 |     const parentNavPromises = useContext(NavigationPromisesContext);
           268 |     if (!context) {
         Build-time instant validation failed for route "/explicit-error".
         To get a more detailed stack trace and pinpoint the issue, try one of the following:
           - Start the app in development mode by running \`next dev\`, then open "/explicit-error" in your browser to investigate the error.
           - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
         Stopping prerender due to instant validation errors."
        `)
        expect(result.exitCode).not.toBe(0)
      })

      it('explicit-true page: build skips validation (alias to warning)', async () => {
        const result = await prerender('/explicit-true')
        expectBuildValidationSkipped(result)
      })

      it('explicit-warning page: build skips validation (explicit warning is dev-only)', async () => {
        const result = await prerender('/explicit-warning')
        expectBuildValidationSkipped(result)
      })

      it('explicit-false page: opt-out skips validation', async () => {
        const result = await prerender('/explicit-false')
        expectBuildValidationSkipped(result)
      })

      it('layered: bare page under layout-with-instant-false skips validation in build (warning is dev-only)', async () => {
        const result = await prerender('/layered')
        expectBuildValidationSkipped(result)
      })
    })
  }
})
