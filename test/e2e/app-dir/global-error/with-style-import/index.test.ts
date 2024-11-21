import { assertHasRedbox, getRedboxHeader } from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'

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
      await assertHasRedbox(browser, { pageResponseCode: 500 })
      expect(await getRedboxHeader(browser)).toMatch(/Root Layout Error/)
      return
    }

    const h2 = await browser.elementByCss('h2')
    expect(await h2.getComputedCss('color')).toBe('rgb(255, 255, 0)') // yellow
  })
})
