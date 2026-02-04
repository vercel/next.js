import { nextTestSetup } from 'e2e-utils'

describe('pages-to-app-routing', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should work using browser', async () => {
    const browser = await next.browser('/abc')
    expect(await browser.elementByCss('#params').text()).toBe(
      'Params: {"slug":"abc"}'
    )

    await browser
      .elementByCss('#to-about-link')
      .click()
      .waitForElementByCss('#app-page')

    expect(await browser.elementByCss('#app-page').text()).toBe('About')
  })
})
