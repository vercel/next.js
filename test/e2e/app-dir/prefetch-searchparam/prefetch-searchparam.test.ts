import { nextTestSetup } from 'e2e-utils'

describe('prefetch-searchparam', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })
  // Recommended for tests that need a full browser
  it('should work using browser', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').text()).toBe('{}')

    await browser.elementByCss('[id="1"]').click()
    await browser.waitForElementByCss('p', 5000)
    expect(await browser.elementByCss('p').text()).toBe('{"foo":"bar1"}')

    // refresh the page
    await browser.refresh()

    await browser.elementByCss('[id="2"]').click()
    await browser.waitForElementByCss('p', 5000)
    expect(await browser.elementByCss('p').text()).toBe('{"foo":"bar2"}')

    await browser.elementByCss('[id="3"]').click()
    await browser.waitForElementByCss('p', 5000)
    expect(await browser.elementByCss('p').text()).toBe('{}')
  })
})
