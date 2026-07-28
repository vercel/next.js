import { nextTestSetup, type Playwright } from 'e2e-utils'
import {
  expectBuildValidationSkipped,
  expectNoBuildValidationErrors,
  extractBuildValidationError,
  getDevCliValidationOutput,
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
    // Delivered validation errors are printed between the validation
    // start/end markers, so asserting on the extracted CLI output is
    // race-free — unlike the error toast, which the browser may render
    // after the wait below times out.
    const validationOutput = await getDevCliValidationOutput(
      url,
      getCliOutputSinceMark
    )
    expect(validationOutput).not.toContain('Error:')
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
                 "source": "app/suspense-in-root/parallel/slot-config-only/@slot/page.tsx (1:24) @ instant
           > 1 | export const instant = { level: 'experimental-error' }
               |                        ^",
                 "stack": [
                   "instant app/suspense-in-root/parallel/slot-config-only/@slot/page.tsx (1:24)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1430",
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
             - [block] Set \`export const instant = false\` to allow a blocking route

           Learn more: https://nextjs.org/docs/messages/blocking-prerender-runtime
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
                 "source": "app/suspense-in-root/parallel/slot-layout-config/@slot/layout.tsx (3:24) @ instant
           > 3 | export const instant = { level: 'experimental-error' }
               |                        ^",
                 "stack": [
                   "instant app/suspense-in-root/parallel/slot-layout-config/@slot/layout.tsx (3:24)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1430",
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
             - [block] Set \`export const instant = false\` to allow a blocking route

           Learn more: https://nextjs.org/docs/messages/blocking-prerender-runtime
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

      it('allows unsuspended runtime content in children when runtime config is on slot page', async () => {
        // Shell validation uses the runtime shell selected by the @slot branch,
        // so the unsuspended cookies() call in children is allowed here. If this
        // test validates a non-shell prefetch again, @slot's allow-runtime must
        // not apply to the sibling children branch, and its cookies() call
        // should be reported as an instant validation violation.
        if (isNextDev) {
          const browser = await navigateTo(
            '/suspense-in-root/parallel/slot-runtime-config'
          )
          await expectNoDevValidationErrors(browser, await browser.url())
        } else {
          const result = await prerender(
            '/suspense-in-root/parallel/slot-runtime-config'
          )
          expectNoBuildValidationErrors(result)
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
                 "source": "app/suspense-in-root/parallel/children-config-with-slot/page.tsx (1:24) @ instant
           > 1 | export const instant = { level: 'experimental-error' }
               |                        ^",
                 "stack": [
                   "instant app/suspense-in-root/parallel/children-config-with-slot/page.tsx (1:24)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1430",
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
             - [block] Set \`export const instant = false\` to allow a blocking route

           Learn more: https://nextjs.org/docs/messages/blocking-prerender-runtime
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
                   "source": "app/suspense-in-root/parallel/fork-layout-config-with-slot/layout.tsx (3:24) @ instant
           > 3 | export const instant = { level: 'experimental-error' }
               |                        ^",
                   "stack": [
                     "instant app/suspense-in-root/parallel/fork-layout-config-with-slot/layout.tsx (3:24)",
                     "Set.forEach <anonymous>",
                   ],
                 },
               ],
               "code": "E1430",
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
                   "source": "app/suspense-in-root/parallel/fork-layout-config-with-slot/layout.tsx (3:24) @ instant
           > 3 | export const instant = { level: 'experimental-error' }
               |                        ^",
                   "stack": [
                     "instant app/suspense-in-root/parallel/fork-layout-config-with-slot/layout.tsx (3:24)",
                     "Set.forEach <anonymous>",
                   ],
                 },
               ],
               "code": "E1430",
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
             - [block] Set \`export const instant = false\` to allow a blocking route

           Learn more: https://nextjs.org/docs/messages/blocking-prerender-runtime
               at div (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
           Error: Route "/suspense-in-root/parallel/fork-layout-config-with-slot": Next.js encountered runtime data during prerendering or a navigation.

           \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.

           Ways to fix this:
             - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
             - [block] Set \`export const instant = false\` to allow a blocking route

           Learn more: https://nextjs.org/docs/messages/blocking-prerender-runtime
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
                 "source": "app/suspense-in-root/parallel/conditional-breadcrumbs/show-both/blocked/page.tsx (1:24) @ instant
           > 1 | export const instant = { level: 'experimental-error' }
               |                        ^",
                 "stack": [
                   "instant app/suspense-in-root/parallel/conditional-breadcrumbs/show-both/blocked/page.tsx (1:24)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1430",
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
             - [block] Set \`export const instant = false\` to allow a blocking route

           Learn more: https://nextjs.org/docs/messages/blocking-prerender-runtime
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

      it('valid - configured children slot is hidden, no cookies', async () => {
        // The children page is configured for instant validation but the
        // layout never renders {children}. A slot that never renders is
        // vacuous: it cannot block anything and its config demands
        // nothing, so this must not produce a "could not validate"
        // error (or any other warning).
        const href =
          '/suspense-in-root/parallel/conditional-breadcrumbs/show-only-breadcrumbs/unblocked'
        if (isNextDev) {
          const browser = await navigateTo(href)
          await expectNoDevValidationErrors(browser, await browser.url())
        } else {
          // The route group workaround only fires in dev mode; build-time
          // pattern matching doesn't resolve through (group)/ so the
          // route is skipped entirely (no validation markers emitted).
          const result = await prerender(href)
          expectBuildValidationSkipped(result)
        }
      })

      it('valid - configured children slot is hidden, breadcrumbs blocked', async () => {
        // The configured children page never renders, so its error-level
        // config is vacuous and must not be applied to the sibling
        // breadcrumbs slot. Breadcrumbs itself is unconfigured (the suite
        // runs with `validationLevel: 'manual-warning'`), so its blocking
        // cookies() read is acknowledged and no error is reported.
        const href =
          '/suspense-in-root/parallel/conditional-breadcrumbs/show-only-breadcrumbs/blocked'
        if (isNextDev) {
          const browser = await navigateTo(href)
          await expectNoDevValidationErrors(browser, await browser.url())
        } else {
          // The route group workaround only fires in dev mode; build-time
          // pattern matching doesn't resolve through (group)/ so the
          // route is skipped entirely (no validation markers emitted).
          const result = await prerender(href)
          expectBuildValidationSkipped(result)
        }
      })
    })

    describe('rendered-slot config selection (request-state fork)', () => {
      // The auth-fork layout renders exactly one of its two slots based
      // on the `logged-in` cookie. Validation must determine the set of
      // rendered slots from a full dynamic render of the actual request
      // (the fork sits behind a blocking cookies() read, so aborting
      // validation passes cannot discover it) and only consider the
      // configs of slots that actually rendered:
      // - logged out: only @login renders; its `instant = false`
      //   acknowledges the layout's blocking cookies() read, and the
      //   children page's error-level config is vacuous.
      // - logged in: only children renders; its error-level config makes
      //   the layout's cookies() read a violation, and @login's
      //   `instant = false` is vacuous.
      const href = '/suspense-in-root/parallel/auth-fork'

      async function navigateWithCookieState(loggedIn: boolean) {
        const browser = await next.browser('/suspense-in-root')
        // The browser context is shared between tests, so clear any
        // `logged-in` cookie left behind by a previous test.
        await browser.deleteCookies()
        if (loggedIn) {
          await browser.addCookie({ name: 'logged-in', value: '1' })
        }
        if (isClientNav) {
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
        } else {
          await browser.get(new URL(href, next.url).href)
        }
        const branch = await browser
          .elementByCss('section[data-branch]')
          .getAttribute('data-branch')
        expect(branch).toBe(loggedIn ? 'children' : 'login')
        return browser
      }

      it('valid - logged out: unrendered children config is vacuous, rendered @login allows blocking', async () => {
        if (isNextDev) {
          const browser = await navigateWithCookieState(false)
          await expectNoDevValidationErrors(browser, await browser.url())
        } else {
          // A build has no request state; the children page declares a
          // logged-out `unstable_samples` entry (`logged-in` cookie
          // absent), so the build's discovery render takes the @login
          // branch: it is allowed to block while the children config is
          // vacuous.
          const result = await prerender(href)
          expectNoBuildValidationErrors(result)
        }
      })

      if (isNextDev) {
        // Only the dev server can observe a logged-in request; a build
        // always renders the cookie-less (logged-out) branch.
        it('errors - logged in: rendered children config applies, unrendered @login opt-out is vacuous', async () => {
          const browser = await navigateWithCookieState(true)
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/parallel/auth-fork/page.tsx (6:24) @ instant
           > 6 | export const instant = {
               |                        ^",
                 "stack": [
                   "instant app/suspense-in-root/parallel/auth-fork/page.tsx (6:24)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1430",
             "description": "Next.js encountered runtime data during a navigation.",
             "environmentLabel": "Server",
             "label": "Instant",
             "source": "app/suspense-in-root/parallel/auth-fork/layout.tsx (16:36) @ AuthForkLayout
           > 16 |   const cookieStore = await cookies()
                |                                    ^",
             "stack": [
               "AuthForkLayout app/suspense-in-root/parallel/auth-fork/layout.tsx (16:36)",
             ],
           }
          `)
        })
      }
    })

    describe('rendered-slot config selection (server fork with unrelated client IO)', () => {
      // Same request-state fork as auth-fork, plus a Suspense-isolated
      // client component elsewhere in the layout that suspends on client
      // IO during every SSR pass. The fork is decided by the server
      // layout, so which slot renders is knowable from the serialized
      // payload alone — pending client IO in an unrelated subtree must
      // not change which fork slot configs are considered. (This is the
      // determinism case: rendered-slot semantics may not degrade based
      // on incidental client IO or cache state.)
      const href = '/suspense-in-root/parallel/auth-fork-with-client-io'

      async function navigateWithCookieState(loggedIn: boolean) {
        const browser = await next.browser('/suspense-in-root')
        // The browser context is shared between tests, so clear any
        // `logged-in` cookie left behind by a previous test.
        await browser.deleteCookies()
        if (loggedIn) {
          await browser.addCookie({ name: 'logged-in', value: '1' })
        }
        if (isClientNav) {
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
        } else {
          await browser.get(new URL(href, next.url).href)
        }
        const branch = await browser
          .elementByCss('section[data-branch]')
          .getAttribute('data-branch')
        expect(branch).toBe(loggedIn ? 'children' : 'login')
        return browser
      }

      it('valid - logged out: unrendered children config is vacuous despite pending client IO', async () => {
        if (isNextDev) {
          const browser = await navigateWithCookieState(false)
          await expectNoDevValidationErrors(browser, await browser.url())
        } else {
          // A build has no request state; the children page declares a
          // logged-out `unstable_samples` entry (`logged-in` cookie
          // absent), so the build takes the @login branch: it is allowed
          // to block while the children config is vacuous.
          const result = await prerender(href)
          expectNoBuildValidationErrors(result)
        }
      })

      if (isNextDev) {
        // Only the dev server can observe a logged-in request; a build
        // always renders the cookie-less (logged-out) branch.
        it('errors - logged in: rendered children config applies despite pending client IO', async () => {
          const browser = await navigateWithCookieState(true)
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/parallel/auth-fork-with-client-io/page.tsx (5:24) @ instant
           > 5 | export const instant = {
               |                        ^",
                 "stack": [
                   "instant app/suspense-in-root/parallel/auth-fork-with-client-io/page.tsx (5:24)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1430",
             "description": "Next.js encountered runtime data during a navigation.",
             "environmentLabel": "Server",
             "label": "Instant",
             "source": "app/suspense-in-root/parallel/auth-fork-with-client-io/layout.tsx (20:36) @ AuthForkWithClientIOLayout
           > 20 |   const cookieStore = await cookies()
                |                                    ^",
             "stack": [
               "AuthForkWithClientIOLayout app/suspense-in-root/parallel/auth-fork-with-client-io/layout.tsx (20:36)",
             ],
           }
          `)
        })
      }
    })

    describe('rendered-slot config selection (client-component fork)', () => {
      // Forks on request state like auth-fork, but the fork decision is
      // made by a CLIENT component: the layout serializes BOTH slots into
      // the client component's props along with a cookie-derived flag.
      // The serialized payload alone cannot reveal which branch renders —
      // only executing the client component during an SSR pass can — so
      // validation must observe the rendered outcome rather than infer it
      // from serialization.
      const href = '/suspense-in-root/parallel/client-auth-fork'

      async function navigateWithCookieState(loggedIn: boolean) {
        const browser = await next.browser('/suspense-in-root')
        // The browser context is shared between tests, so clear any
        // `logged-in` cookie left behind by a previous test.
        await browser.deleteCookies()
        if (loggedIn) {
          await browser.addCookie({ name: 'logged-in', value: '1' })
        }
        if (isClientNav) {
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
        } else {
          await browser.get(new URL(href, next.url).href)
        }
        const branch = await browser
          .elementByCss('section[data-branch]')
          .getAttribute('data-branch')
        expect(branch).toBe(loggedIn ? 'children' : 'login')
        return browser
      }

      it('valid - logged out: client-dropped children config is vacuous, rendered @login allows blocking', async () => {
        if (isNextDev) {
          const browser = await navigateWithCookieState(false)
          await expectNoDevValidationErrors(browser, await browser.url())
        } else {
          // A build has no request state; the children page declares a
          // logged-out `unstable_samples` entry (`logged-in` cookie
          // absent), so the build observes the @login branch: it is
          // allowed to block while the children config is vacuous.
          const result = await prerender(href)
          expectNoBuildValidationErrors(result)
        }
      })

      if (isNextDev) {
        // Only the dev server can observe a logged-in request; a build
        // always renders the cookie-less (logged-out) branch.
        it('errors - logged in: client-rendered children config applies, unrendered @login opt-out is vacuous', async () => {
          const browser = await navigateWithCookieState(true)
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/parallel/client-auth-fork/page.tsx (5:24) @ instant
           > 5 | export const instant = {
               |                        ^",
                 "stack": [
                   "instant app/suspense-in-root/parallel/client-auth-fork/page.tsx (5:24)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1430",
             "description": "Next.js encountered runtime data during a navigation.",
             "environmentLabel": "Server",
             "label": "Instant",
             "source": "app/suspense-in-root/parallel/client-auth-fork/layout.tsx (17:36) @ ClientAuthForkLayout
           > 17 |   const cookieStore = await cookies()
                |                                    ^",
             "stack": [
               "ClientAuthForkLayout app/suspense-in-root/parallel/client-auth-fork/layout.tsx (17:36)",
             ],
           }
          `)
        })
      }
    })
  })
})
