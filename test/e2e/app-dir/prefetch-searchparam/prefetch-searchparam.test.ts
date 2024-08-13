import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

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
    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe('{"q":"bar"}')
    })

    // navigate to home, should clear the searchParams value
    await browser.elementByCss('[href="/"]').click()
    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe('{}')
    })
  })
})
