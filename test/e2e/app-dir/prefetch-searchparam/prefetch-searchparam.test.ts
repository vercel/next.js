import { nextTestSetup } from 'e2e-utils'

describe('prefetch-searchparam', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })
  it('should set prefetch cache properly on different search params', async () => {
    // load WITH search param
    const browser = await next.browser('/?q=foo')
    expect(await browser.elementByCss('p').text()).toBe('{"q":"foo"}')

    // navigate to different search param, should update the search param
    await browser.elementByCss('[href="/?q=bar"]').click()
    await browser.waitForElementByCss('p', 5000)
    expect(await browser.elementByCss('p').text()).toBe('{"q":"bar"}')

    // navigate to home, should clear the searchParams value
    await browser.elementByCss('[href="/"]').click()
    await browser.waitForElementByCss('p', 5000)
    expect(await browser.elementByCss('p').text()).toBe('{}')
  })
})
