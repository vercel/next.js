import { nextTestSetup, type Playwright } from 'e2e-utils'
import {
  getDevCliValidationOutput,
  waitForValidation,
} from 'e2e-utils/instant-validation'
import { retry, waitForNoErrorToast } from '../../../lib/next-test-utils'

// Validation observes which fork slots mount by SSR-rendering the
// validated render's recorded chunks when that render had no document SSR
// (client navigations). If a Client Component keeps the observation render
// from settling, validation must give up after a bound and say so rather
// than consume a partial (under-reporting) mounted set. This suite lowers
// the bound to a millisecond and navigates to a fixture whose client fork
// burns CPU, so the observation render is guaranteed to exceed it.
describe('instant validation - mount observation timeout', () => {
  const { next, skipped, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
    env: {
      NEXT_TEST_LOG_VALIDATION: '1',
      NEXT_TEST_MOUNT_OBSERVATION_TIMEOUT_MS: '1',
    },
  })
  if (skipped) return

  if (!isNextDev) {
    // Mount observation only runs in dev; build validation doesn't record
    // fork slots yet.
    it.skip('dev-only suite', () => {})
    return
  }

  beforeAll(async () => {
    await next.start()
  })

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

  async function expectNoDevValidationErrors(
    browser: Playwright,
    url: string
  ): Promise<void> {
    await waitForValidation(url, getCliOutputSinceMark)
    const validationOutput = await getDevCliValidationOutput(
      url,
      getCliOutputSinceMark
    )
    expect(validationOutput).not.toContain('Error:')
    await waitForNoErrorToast(browser, { waitInMs: 500 })
  }

  const href = '/suspense-in-root/parallel/slow-client-auth-fork'

  it('initial load - the document SSR observation is not subject to the observation timeout', async () => {
    // The document SSR observes mounts as a side effect of the render the
    // user is already waiting on, and validation starts only after it has
    // settled — so even a 1ms bound cannot fire. The logged-out branch
    // renders, the children config is vacuous, and validation passes.
    const browser = await next.browser(href)
    const branch = await browser
      .elementByCss('section[data-branch]')
      .getAttribute('data-branch')
    expect(branch).toBe('login')
    await expectNoDevValidationErrors(browser, await browser.url())
  })

  it('client navigation - reports when the observation render cannot settle in time', async () => {
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
    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "description": "Route "/suspense-in-root/parallel/slow-client-auth-fork": Could not validate that this route has instant navigation.

     Next.js could not discover which parallel route slots render because client-side rendering did not settle in time. Something in a Client Component may be preventing rendering from completing.

     Ways to fix this:
       - [retry] Reload the page with a hard refresh to validate against the full document render
       - [ignore] Set \`export const instant = false\` to opt the route out of instant-navigation validation",
       "environmentLabel": "Server",
       "label": "Console Error",
       "source": null,
       "stack": [],
     }
    `)
  })
})
