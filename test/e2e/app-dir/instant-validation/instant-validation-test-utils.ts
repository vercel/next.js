import { nextTestSetup, type NextInstance, type Playwright } from 'e2e-utils'
import {
  expectNoBuildValidationErrors,
  expectBuildValidationSkipped,
  extractBuildValidationError,
  waitForValidation,
} from 'e2e-utils/instant-validation'
import {
  openRedbox,
  retry,
  waitForNoErrorToast,
  waitForRedbox,
} from '../../../lib/next-test-utils'
import {
  createRedboxSnapshot,
  type ErrorSnapshot,
  type RedboxSnapshot,
} from '../../../lib/add-redbox-matchers'
import { getDeterministicOutput } from '../cache-components-errors/utils'

export type { ErrorSnapshot, RedboxSnapshot }

type InstantValidationTestContext = {
  next: NextInstance
  isNextDev: boolean
  isClientNav: boolean
  navigateTo: (href: string) => Promise<Playwright>
  prerender: (pathname: string) => ReturnType<NextInstance['build']>
  getCliOutputSinceMark: () => string
  NO_VALIDATION_ERRORS_WAIT: Parameters<typeof waitForNoErrorToast>[1]
  expectNoDevValidationErrors: (
    browser: Playwright,
    url: string
  ) => Promise<void>
  expectNoBuildValidationErrors: typeof expectNoBuildValidationErrors
  expectBuildValidationSkipped: typeof expectBuildValidationSkipped
  extractBuildValidationError: typeof extractBuildValidationError
  waitForValidation: typeof waitForValidation
  openRedbox: typeof openRedbox
  waitForNoErrorToast: typeof waitForNoErrorToast
  waitForRedbox: typeof waitForRedbox
  createRedboxSnapshot: typeof createRedboxSnapshot
  getDeterministicOutput: typeof getDeterministicOutput
}

export function describeInstantValidationTests(
  defineTests: (context: InstantValidationTestContext) => void
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

    const NO_VALIDATION_ERRORS_WAIT: Parameters<typeof waitForNoErrorToast>[1] =
      {
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

        // Soft nav - go to index page first, then click link
        const indexPage = href.startsWith('/default/')
          ? '/default'
          : '/suspense-in-root'
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
          undefined,
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

      defineTests({
        next,
        isNextDev,
        isClientNav,
        navigateTo,
        prerender,
        getCliOutputSinceMark,
        NO_VALIDATION_ERRORS_WAIT,
        expectNoDevValidationErrors,
        expectNoBuildValidationErrors,
        expectBuildValidationSkipped,
        extractBuildValidationError,
        waitForValidation,
        openRedbox,
        waitForNoErrorToast,
        waitForRedbox,
        createRedboxSnapshot,
        getDeterministicOutput,
      })
    })
  })
}
