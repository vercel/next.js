import { nextTestSetup, type NextInstance, type Playwright } from 'e2e-utils'
import { waitForValidation } from 'e2e-utils/instant-validation'
import { retry, waitForNoErrorToast } from '../../../lib/next-test-utils'

export interface InstantValidationCaseContext {
  next: NextInstance
  isNextDev: boolean
  isNextStart: boolean
  isTurbopack: boolean
  /** Whether this case navigates via soft navigation instead of initial load */
  isClientNav: boolean
  /**
   * Navigate to a page either via initial load or soft navigation.
   * For soft nav, navigates to the index page first, then clicks the link.
   */
  navigateTo: (href: string) => Promise<Playwright>
  expectNoDevValidationErrors: (
    browser: Playwright,
    url: string
  ) => Promise<void>
  getCliOutputSinceMark: () => string
  /** Prerender a single page with `--experimental-build-mode generate` */
  prerender: (pathname: string) => ReturnType<NextInstance['build']>
}

export const NO_VALIDATION_ERRORS_WAIT: Parameters<
  typeof waitForNoErrorToast
>[1] = {
  waitInMs: 500,
}

// This suite is far too slow to run as a single CI test file, so it's split
// into one `*.test.ts` entry file per group of sections (each with a
// `.partial-prefetching` variant), all sharing this wrapper.
// Every entry boots its own server (and, in `next start` mode, runs its own
// `--experimental-build-mode compile` build plus a `generate` build per
// test). All entries use the same describe title so test full names stay
// stable across the split. Snapshots can be updated with the sibling
// update-instant-validation-snapshots.mjs script.
export function runInstantValidationTests(
  registerTests: (ctx: InstantValidationCaseContext) => void
) {
  describe('instant validation', () => {
    const { next, skipped, isNextDev, isNextStart, isTurbopack } =
      nextTestSetup({
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
        // cliOutput shrank since we started the test, so something (like a `sandbox`) reset the logs
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
      /**
       * Navigate to a page either via initial load or soft navigation.
       * For soft nav, navigates to the index page first, then clicks the link.
       */
      async function navigateTo(href: string) {
        if (!isClientNav) {
          // Initial load - navigate directly
          const browser = await next.browser(href)
          await browser.elementByCss('main')
          return browser
        }

        // Soft nav - go to index page first, then click link.
        // We have multiple root layouts, so each needs a separate index page
        // because navigating between root layouts would be an MPA nav,
        // and we want to test soft navs.
        const indexPage = ((): string => {
          if (href.startsWith('/shells/')) {
            // If this is the root params page, use the same root param value
            let match: ReturnType<String['match']>
            if (
              (match = href.match(
                /^\/shells\/with-root-param\/(?<lang>[^/]+)\/.*/
              ))
            ) {
              const lang = match.groups!.lang
              return `/shells/with-root-param/${lang}`
            } else {
              return '/shells'
            }
          }
          for (const prefix of ['/default', '/suspense-in-root']) {
            if (href.startsWith(prefix + '/')) {
              return prefix
            }
          }
          throw new Error(`Could not find index page for ${href}`)
        })()

        const browser = await next.browser(indexPage)

        const initialRootLayoutTimestamp = await browser
          .elementById('root-layout-timestamp')
          .text()

        await browser
          .elementByCss(`[data-link-type="soft"][href="${href}"]`)
          .click()

        await retry(
          async () => {
            expect(await browser.url()).toContain(href)
          },
          // Webpack can be slow to compile new routes in CI, which blocks the
          // navigation. Instant Validation itself is non-blocking and does not
          // affect this, so this is only covering for compilation speed.
          isTurbopack ? 5_000 : 10_000,
          100,
          'wait for url to change'
        )

        // Sanity check: we shouldn't have switched or otherwise refetched the root layout
        const finalRootLayoutTimestamp = await browser
          .elementById('root-layout-timestamp')
          .text()
        expect(initialRootLayoutTimestamp).toBe(finalRootLayoutTimestamp)

        return browser
      }

      registerTests({
        next,
        isNextDev,
        isNextStart,
        isTurbopack,
        isClientNav,
        navigateTo,
        expectNoDevValidationErrors,
        getCliOutputSinceMark,
        prerender,
      })
    })
  })
}
