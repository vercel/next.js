import { nextTestSetup, type Playwright } from 'e2e-utils'
import {
  expectBuildValidationSkipped,
  expectNoBuildValidationErrors,
  extractBuildValidationError,
  waitForValidation,
} from 'e2e-utils/instant-validation'
import { retry, waitForNoErrorToast } from '../../../lib/next-test-utils'

describe('instant validation - parallel slot configs', () => {
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
    // TODO(instant-validation-build): snapshot tests for webpack
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

  let currentCliOutputIndex = 0
  beforeEach(() => {
    currentCliOutputIndex = next.cliOutput.length
  })

  function getCliOutputSinceMark(): string {
    if (next.cliOutput.length < currentCliOutputIndex) {
      currentCliOutputIndex = 0
    }
    return next.cliOutput.slice(currentCliOutputIndex)
  }

  const prerender = async (pathname: string) => {
    const args = [
      '--experimental-build-mode',
      'generate',
      '--debug-build-paths',
      `app${pathname}/page.tsx`,
    ]
    return await next.build({ args })
  }

  const NO_VALIDATION_ERRORS_WAIT: Parameters<typeof waitForNoErrorToast>[1] = {
    waitInMs: 500,
  }

  async function expectNoDevValidationErrors(
    browser: Playwright,
    url: string
  ): Promise<void> {
    await waitForValidation(url, getCliOutputSinceMark)
    await waitForNoErrorToast(browser, NO_VALIDATION_ERRORS_WAIT)
  }

  const cases = isNextDev
    ? [
        { isClientNav: false, description: 'dev - initial load' },
        { isClientNav: true, description: 'dev - client navigation' },
      ]
    : [{ isClientNav: false, description: 'build' }]

  describe.each(cases)('$description', ({ isClientNav }) => {
    async function navigateTo(href: string) {
      if (!isClientNav) {
        if (isNextStart) {
          await next.start()
        }
        const browser = await next.browser(href)
        await browser.elementByCss('main')
        return browser
      }

      const browser = await next.browser('/suspense-in-root')
      await browser
        .elementByCss(`[data-link-type="soft"][href="${href}"]`)
        .click()
      await retry(
        async () => {
          expect(await browser.url()).toContain(href)
        },
        undefined,
        100,
        'wait for url to change'
      )
      return browser
    }

    describe('config on slot page', () => {
      it('catches unsuspended dynamic content in children when config is on slot page', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/parallel/slot-config-only'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/parallel/slot-config-only/@slot/page.tsx (1:33) @ unstable_instant
           > 1 | export const unstable_instant = { level: 'experimental-error' }
               |                                 ^",
                 "stack": [
                   "unstable_instant app/suspense-in-root/parallel/slot-config-only/@slot/page.tsx (1:33)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1319",
             "description": "Next.js encountered runtime data during a navigation.",
             "environmentLabel": "Server",
             "label": "Instant",
             "source": "app/suspense-in-root/parallel/slot-config-only/page.tsx (4:16) @ ChildrenPage
           > 4 |   await cookies()
               |                ^",
             "stack": [
               "ChildrenPage app/suspense-in-root/parallel/slot-config-only/page.tsx (4:16)",
             ],
           }
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/parallel/slot-config-only'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/parallel/slot-config-only": Next.js encountered runtime data during prerendering or a navigation.

           \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

           Ways to fix this:
             - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
               https://nextjs.org/docs/messages/blocking-prerender-runtime#wrap-in-or-move-into-suspense
             - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
               https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
             - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
               https://nextjs.org/docs/messages/blocking-prerender-runtime#allow-blocking-route
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
           Build-time instant validation failed for route "/suspense-in-root/parallel/slot-config-only".
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/parallel/slot-config-only" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })

      it('catches unsuspended dynamic content in children when config is on slot layout', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/parallel/slot-layout-config'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/parallel/slot-layout-config/@slot/layout.tsx (3:33) @ unstable_instant
           > 3 | export const unstable_instant = { level: 'experimental-error' }
               |                                 ^",
                 "stack": [
                   "unstable_instant app/suspense-in-root/parallel/slot-layout-config/@slot/layout.tsx (3:33)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1319",
             "description": "Next.js encountered runtime data during a navigation.",
             "environmentLabel": "Server",
             "label": "Instant",
             "source": "app/suspense-in-root/parallel/slot-layout-config/page.tsx (4:16) @ ChildrenPage
           > 4 |   await cookies()
               |                ^",
             "stack": [
               "ChildrenPage app/suspense-in-root/parallel/slot-layout-config/page.tsx (4:16)",
             ],
           }
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/parallel/slot-layout-config'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/parallel/slot-layout-config": Next.js encountered runtime data during prerendering or a navigation.

           \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

           Ways to fix this:
             - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
               https://nextjs.org/docs/messages/blocking-prerender-runtime#wrap-in-or-move-into-suspense
             - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
               https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
             - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
               https://nextjs.org/docs/messages/blocking-prerender-runtime#allow-blocking-route
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
           Build-time instant validation failed for route "/suspense-in-root/parallel/slot-layout-config".
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/parallel/slot-layout-config" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })

      it('catches unsuspended dynamic content in children when runtime config is on slot page', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/parallel/slot-runtime-config'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/parallel/slot-runtime-config/@slot/page.tsx (4:33) @ unstable_instant
           > 4 | export const unstable_instant = { level: 'experimental-error' }
               |                                 ^",
                 "stack": [
                   "unstable_instant app/suspense-in-root/parallel/slot-runtime-config/@slot/page.tsx (4:33)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1319",
             "description": "Next.js encountered runtime data during a navigation.",
             "environmentLabel": "Server",
             "label": "Instant",
             "source": "app/suspense-in-root/parallel/slot-runtime-config/page.tsx (4:16) @ ChildrenPage
           > 4 |   await cookies()
               |                ^",
             "stack": [
               "ChildrenPage app/suspense-in-root/parallel/slot-runtime-config/page.tsx (4:16)",
             ],
           }
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/parallel/slot-runtime-config'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/parallel/slot-runtime-config": Next.js encountered runtime data during prerendering or a navigation.

           \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

           Ways to fix this:
             - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
               https://nextjs.org/docs/messages/blocking-prerender-runtime#wrap-in-or-move-into-suspense
             - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
               https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
             - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
               https://nextjs.org/docs/messages/blocking-prerender-runtime#allow-blocking-route
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
           Build-time instant validation failed for route "/suspense-in-root/parallel/slot-runtime-config".
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/parallel/slot-runtime-config" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })
    })

    describe('config on children with slot', () => {
      it('catches unsuspended dynamic content in slot when config is on children page', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/parallel/children-config-with-slot'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/parallel/children-config-with-slot/page.tsx (1:33) @ unstable_instant
           > 1 | export const unstable_instant = { level: 'experimental-error' }
               |                                 ^",
                 "stack": [
                   "unstable_instant app/suspense-in-root/parallel/children-config-with-slot/page.tsx (1:33)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1319",
             "description": "Next.js encountered runtime data during a navigation.",
             "environmentLabel": "Server",
             "label": "Instant",
             "source": "app/suspense-in-root/parallel/children-config-with-slot/@slot/page.tsx (4:16) @ SlotPage
           > 4 |   await cookies()
               |                ^",
             "stack": [
               "SlotPage app/suspense-in-root/parallel/children-config-with-slot/@slot/page.tsx (4:16)",
             ],
           }
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/parallel/children-config-with-slot'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/parallel/children-config-with-slot": Next.js encountered runtime data during prerendering or a navigation.

           \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

           Ways to fix this:
             - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
               https://nextjs.org/docs/messages/blocking-prerender-runtime#wrap-in-or-move-into-suspense
             - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
               https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
             - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
               https://nextjs.org/docs/messages/blocking-prerender-runtime#allow-blocking-route
               at div (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
           Build-time instant validation failed for route "/suspense-in-root/parallel/children-config-with-slot".
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/parallel/children-config-with-slot" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })

      it('catches unsuspended dynamic content in both slots when config is on fork-point layout', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/parallel/fork-layout-config-with-slot'
          )
          await expect(browser).toDisplayCollapsedRedbox(`
           [
             {
               "cause": [
                 {
                   "label": "Caused by: Instant Validation",
                   "source": "app/suspense-in-root/parallel/fork-layout-config-with-slot/layout.tsx (3:33) @ unstable_instant
           > 3 | export const unstable_instant = { level: 'experimental-error' }
               |                                 ^",
                   "stack": [
                     "unstable_instant app/suspense-in-root/parallel/fork-layout-config-with-slot/layout.tsx (3:33)",
                     "Set.forEach <anonymous>",
                   ],
                 },
               ],
               "code": "E1319",
               "description": "Next.js encountered runtime data during a navigation.",
               "environmentLabel": "Server",
               "label": "Instant",
               "source": "app/suspense-in-root/parallel/fork-layout-config-with-slot/@slot/page.tsx (4:16) @ SlotPage
           > 4 |   await cookies()
               |                ^",
               "stack": [
                 "SlotPage app/suspense-in-root/parallel/fork-layout-config-with-slot/@slot/page.tsx (4:16)",
               ],
             },
             {
               "cause": [
                 {
                   "label": "Caused by: Instant Validation",
                   "source": "app/suspense-in-root/parallel/fork-layout-config-with-slot/layout.tsx (3:33) @ unstable_instant
           > 3 | export const unstable_instant = { level: 'experimental-error' }
               |                                 ^",
                   "stack": [
                     "unstable_instant app/suspense-in-root/parallel/fork-layout-config-with-slot/layout.tsx (3:33)",
                     "Set.forEach <anonymous>",
                   ],
                 },
               ],
               "code": "E1319",
               "description": "Next.js encountered runtime data during a navigation.",
               "environmentLabel": "Server",
               "label": "Instant",
               "source": "app/suspense-in-root/parallel/fork-layout-config-with-slot/page.tsx (4:16) @ ChildrenPage
           > 4 |   await cookies()
               |                ^",
               "stack": [
                 "ChildrenPage app/suspense-in-root/parallel/fork-layout-config-with-slot/page.tsx (4:16)",
               ],
             },
           ]
          `)
        } else {
          const result = await prerender(
            '/suspense-in-root/parallel/fork-layout-config-with-slot'
          )
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/parallel/fork-layout-config-with-slot": Next.js encountered runtime data during prerendering or a navigation.

           \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

           Ways to fix this:
             - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
               https://nextjs.org/docs/messages/blocking-prerender-runtime#wrap-in-or-move-into-suspense
             - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
               https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
             - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
               https://nextjs.org/docs/messages/blocking-prerender-runtime#allow-blocking-route
               at div (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
           Error: Route "/suspense-in-root/parallel/fork-layout-config-with-slot": Next.js encountered runtime data during prerendering or a navigation.

           \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

           Ways to fix this:
             - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
               https://nextjs.org/docs/messages/blocking-prerender-runtime#wrap-in-or-move-into-suspense
             - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
               https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
             - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
               https://nextjs.org/docs/messages/blocking-prerender-runtime#allow-blocking-route
               at body (<anonymous>)
               at html (<anonymous>)
               at b (<anonymous>)
           Build-time instant validation failed for route "/suspense-in-root/parallel/fork-layout-config-with-slot".
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/parallel/fork-layout-config-with-slot" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })
    })

    describe('valid parallel slot configs', () => {
      it('valid - config on both children and slot pages', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/parallel/both-configs'
          )
          await expectNoDevValidationErrors(browser, await browser.url())
        } else {
          const result = await prerender(
            '/suspense-in-root/parallel/both-configs'
          )
          expectNoBuildValidationErrors(result)
        }
      })

      it('valid - config on slot, children dynamic content inside Suspense', async () => {
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/parallel/slot-config-children-suspended'
          )
          await expectNoDevValidationErrors(browser, await browser.url())
        } else {
          const result = await prerender(
            '/suspense-in-root/parallel/slot-config-children-suspended'
          )
          expectNoBuildValidationErrors(result)
        }
      })
    })

    describe('conditional slot rendering', () => {
      it('valid - both slots render, no cookies', async () => {
        const href =
          '/suspense-in-root/parallel/conditional-breadcrumbs/show-both/unblocked'
        if (isNextDev) {
          const browser = await navigateTo(href)
          await expectNoDevValidationErrors(browser, await browser.url())
        } else {
          const result = await prerender(href)
          expectNoBuildValidationErrors(result)
        }
      })

      it('valid - only configured children slot renders, no cookies', async () => {
        const href =
          '/suspense-in-root/parallel/conditional-breadcrumbs/show-only-children/unblocked'
        if (isNextDev) {
          const browser = await navigateTo(href)
          await expectNoDevValidationErrors(browser, await browser.url())
        } else {
          const result = await prerender(href)
          expectNoBuildValidationErrors(result)
        }
      })

      it('valid - only configured children slot renders, breadcrumbs blocked', async () => {
        const href =
          '/suspense-in-root/parallel/conditional-breadcrumbs/show-only-children/blocked'
        if (isNextDev) {
          const browser = await navigateTo(href)
          await expectNoDevValidationErrors(browser, await browser.url())
        } else {
          const result = await prerender(href)
          expectNoBuildValidationErrors(result)
        }
      })

      it('errors when both slots render and breadcrumbs calls cookies', async () => {
        const href =
          '/suspense-in-root/parallel/conditional-breadcrumbs/show-both/blocked'
        if (isNextDev) {
          const browser = await navigateTo(href)
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/parallel/conditional-breadcrumbs/show-both/blocked/page.tsx (1:33) @ unstable_instant
           > 1 | export const unstable_instant = { level: 'experimental-error' }
               |                                 ^",
                 "stack": [
                   "unstable_instant app/suspense-in-root/parallel/conditional-breadcrumbs/show-both/blocked/page.tsx (1:33)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1319",
             "description": "Next.js encountered runtime data during a navigation.",
             "environmentLabel": "Server",
             "label": "Instant",
             "source": "app/suspense-in-root/parallel/conditional-breadcrumbs/show-both/@breadcrumbs/blocked/page.tsx (3:16) @ BreadcrumbsPage
           > 3 |   await cookies()
               |                ^",
             "stack": [
               "BreadcrumbsPage app/suspense-in-root/parallel/conditional-breadcrumbs/show-both/@breadcrumbs/blocked/page.tsx (3:16)",
             ],
           }
          `)
        } else {
          const result = await prerender(href)
          expect(extractBuildValidationError(result.cliOutput))
            .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/parallel/conditional-breadcrumbs/show-both/blocked": Next.js encountered runtime data during prerendering or a navigation.

           \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

           Ways to fix this:
             - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
               https://nextjs.org/docs/messages/blocking-prerender-runtime#wrap-in-or-move-into-suspense
             - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`
               https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender
             - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route
               https://nextjs.org/docs/messages/blocking-prerender-runtime#allow-blocking-route
               at div (<anonymous>)
               at main (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
           Build-time instant validation failed for route "/suspense-in-root/parallel/conditional-breadcrumbs/show-both/blocked".
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/parallel/conditional-breadcrumbs/show-both/blocked" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
           Stopping prerender due to instant validation errors."
          `)
          expect(result.exitCode).toBe(1)
        }
      })

      it('errors when configured children slot is hidden, no cookies', async () => {
        const href =
          '/suspense-in-root/parallel/conditional-breadcrumbs/show-only-breadcrumbs/unblocked'
        if (isNextDev) {
          const browser = await navigateTo(href)
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "code": "E1286",
             "description": "Next.js could not validate that a segment in your UI has instant navigation.",
             "environmentLabel": "Server",
             "label": "Instant",
             "source": "/suspense-in-root/parallel/conditional-breadcrumbs/show-only-breadcrumbs/unblocked
           │
           │ ├─ suspense-in-root/
           │ │  ├─ parallel/
           │ │  │  ├─ conditional-breadcrumbs/
           │ │  │  │  ├─ show-only-breadcrumbs/
           │ │  │  │  │  ├─ (group)/
           │ │  │  │  │  │  ├─ unblocked/
           │                   └─ page.tsx ← dropped from rendering
           │",
             "stack": [],
           }
          `)
        } else {
          // The route group workaround only fires in dev mode; build-time
          // pattern matching doesn't resolve through (group)/ so the
          // route is skipped entirely (no validation markers emitted).
          const result = await prerender(href)
          expectBuildValidationSkipped(result)
        }
      })

      it('errors when configured children slot is hidden, breadcrumbs blocked', async () => {
        const href =
          '/suspense-in-root/parallel/conditional-breadcrumbs/show-only-breadcrumbs/blocked'
        if (isNextDev) {
          const browser = await navigateTo(href)
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/parallel/conditional-breadcrumbs/show-only-breadcrumbs/(group)/blocked/page.tsx (1:33) @ unstable_instant
           > 1 | export const unstable_instant = { level: 'experimental-error' }
               |                                 ^",
                 "stack": [
                   "unstable_instant app/suspense-in-root/parallel/conditional-breadcrumbs/show-only-breadcrumbs/(group)/blocked/page.tsx (1:33)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1319",
             "description": "Next.js encountered runtime data during a navigation.",
             "environmentLabel": "Server",
             "label": "Instant",
             "source": "app/suspense-in-root/parallel/conditional-breadcrumbs/show-only-breadcrumbs/@breadcrumbs/blocked/page.tsx (3:16) @ BreadcrumbsPage
           > 3 |   await cookies()
               |                ^",
             "stack": [
               "BreadcrumbsPage app/suspense-in-root/parallel/conditional-breadcrumbs/show-only-breadcrumbs/@breadcrumbs/blocked/page.tsx (3:16)",
             ],
           }
          `)
        } else {
          // The route group workaround only fires in dev mode; build-time
          // pattern matching doesn't resolve through (group)/ so the
          // route is skipped entirely (no validation markers emitted).
          const result = await prerender(href)
          expectBuildValidationSkipped(result)
        }
      })
    })
  })
})
