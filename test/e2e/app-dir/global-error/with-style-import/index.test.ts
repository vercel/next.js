import { assertHasRedbox, getRedboxHeader } from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'

async function testDev(browser, errorRegex) {
  await assertHasRedbox(browser)
  expect(await getRedboxHeader(browser)).toMatch(errorRegex)
}

describe('app dir - global error - with style import', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

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
