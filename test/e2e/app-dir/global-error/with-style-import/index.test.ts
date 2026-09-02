import { waitForRedbox, getRedboxHeader } from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'

async function testDev(browser, errorRegex) {
  await waitForRedbox(browser)
  expect(await getRedboxHeader(browser)).toMatch(errorRegex)
}

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// No deploy-specific incompatibility is documented.
// @force-gate !deploy
describe('app dir - global error - with style import', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('should render global error with correct styles', async () => {
    const browser = await next.browser('/')

    if (isNextDev) {
      await testDev(browser, /Root Layout Error/)
      return
    }

    const h2 = await browser.elementByCss('h2')
    expect(await h2.getComputedCss('color')).toBe('rgb(255, 255, 0)') // yellow
  })
})
