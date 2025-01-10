import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('parallel-routes-catchall-specificity', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should match the catch-all route when navigating from a page with a similar path depth as the previously matched slot', async () => {
    const browser = await next.browser('/')

    await browser.elementByCss('[href="/comments/some-text"]').click()

    await browser.waitForElementByCss('h1')

    // we're matching @modal/(...comments)/[productId]
    expect(await browser.elementByCss('h1').text()).toBe('Modal')

    await browser.elementByCss('[href="/u/foobar/l"]').click()

    // we're now matching @modal/[...catchAll]
    await retry(async () => {
      expect(await browser.elementByCss('h1').text()).toBe('Profile')
    })

    await browser.back()

    await browser.elementByCss('[href="/trending"]').click()

    await retry(async () => {
      expect(await browser.elementByCss('h1').text()).toBe('Trending')
    })
  })
})
