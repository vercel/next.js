import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('not-found-search-params-reset', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should reset the not-found boundary when navigating away from a search-param-only mismatch', async () => {
    const browser = await next.browser('/blog?category=invalid')

    expect(await browser.elementByCss('#blog-not-found').text()).toBe(
      'Not Found'
    )

    await browser.elementById('back-to-blog').click()

    await retry(async () => {
      expect(await browser.elementByCss('#blog-page').text()).toBe('blog page')
    })
  })
})
