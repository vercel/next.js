import { nextTestSetup } from 'e2e-utils'

describe('rewrites persist with browser history actions', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('back-button should go back to rewritten path successfully', async () => {
    const browser = await next.browser('/rewrite-me/path')

    expect(await browser.elementByCss('#another').text()).toBe('another page')

    await browser.eval('window.beforeNav = 1')

    await browser
      .elementByCss('#to-index')
      .click()
      .waitForElementByCss('#index')

    await browser.back().waitForElementByCss('#another')

    expect(await browser.waitForElementByCss('#another').text()).toBe(
      'another page'
    )

    expect(await browser.eval('window.beforeNav')).toBe(1)
  })
})
