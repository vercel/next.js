import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// TODO: re-enable with React 18
describe.skip('Custom error page exception', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should handle errors from _error render', async () => {
    const navSel = '#nav'
    const browser = await next.browser('/')
    await browser.waitForElementByCss(navSel).elementByCss(navSel).click()

    await retry(async () => {
      const html = await browser.eval('document.documentElement.innerHTML')
      expect(html).toMatch(
        /Application error: a client-side exception has occurred/
      )
    })
  })
})
