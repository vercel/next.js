import { nextTestSetup } from 'e2e-utils'
import {
  createGetInstantInsight,
  expectBuildValidationSkipped,
} from 'e2e-utils/instant-validation'
import { waitForNoErrorToast } from '../../../lib/next-test-utils'

// This fixture intentionally omits `experimental.instantInsights` from
// next.config.ts. It pins the framework default for `validationLevel` —
// the framework should resolve the default to `'warning'`, which means
// implicit validation fires on bare pages in dev. If the framework default
// ever changes, this test should fail, alerting whoever changes it.
//
// For exhaustive coverage of explicit levels and per-segment overrides,
// see the sibling `instant-validation-level-{warning,manual-warning,error,
// manual-error}` fixtures.
describe('instant validation - default level', () => {
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

  const getInstantInsight = createGetInstantInsight(getCliOutputSinceMark, next)

  if (isNextStart) {
    beforeAll(async () => {
      const result = await next.build({
        args: ['--experimental-build-mode', 'compile'],
      })
      if (result.exitCode !== 0) {
        throw new Error(
          `Build exited with exit code ${result.exitCode}. CLI Output:\n\n${result.cliOutput}`
        )
      }
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

  if (isNextDev) {
    describe('dev', () => {
      it('bare page: framework default matches `warning`, implicit validation fires', async () => {
        const browser = await next.browser('/bare')
        expect(await getInstantInsight(browser)).toMatchInlineSnapshot(`
         {
           "description": "Next.js encountered uncached data during a navigation.",
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

      it('explicit-false page: per-segment opt-out still works under default', async () => {
        const browser = await next.browser('/explicit-false')
        await browser.elementByCss('main')
        await waitForNoErrorToast(browser, { waitInMs: 500 })
      })
    })
  } else {
    describe('build', () => {
      it('bare page: framework default is dev-only, build skips validation', async () => {
        const result = await prerender('/bare')
        expectBuildValidationSkipped(result)
      })

      it('explicit-false page: per-segment opt-out keeps build clean', async () => {
        const result = await prerender('/explicit-false')
        expectBuildValidationSkipped(result)
      })
    })
  }
})
