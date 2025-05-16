import { nextTestSetup } from 'e2e-utils'
import { assertNoRedbox } from 'next-test-utils'

describe('metadata-route-like-pages', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should able to visit sitemap page', async () => {
    const browser = await next.browser('/sitemap')
    await assertNoRedbox(browser)
    expect(await browser.elementByCss('h1').text()).toBe('Sitemap')
  })

  it('should able to visit icon page', async () => {
    const browser = await next.browser('/icon')
    await assertNoRedbox(browser)
    expect(await browser.elementByCss('h1').text()).toBe('Icon')
  })
})
