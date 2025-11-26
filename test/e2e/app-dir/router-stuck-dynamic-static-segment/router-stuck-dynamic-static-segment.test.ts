import { nextTestSetup } from 'e2e-utils'

describe('router-stuck-dynamic-static-segment', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Checks that you can navigate from `/[slug]` where `slug` is `blog` to `/blog/[slug]` where `slug` is `a-post`.
  it('should allow navigation between dynamic parameter and static parameter of the same value', async () => {
    const browser = await next.browser('/')
    await browser
      .elementByCss('#to-blog')
      .click()
      .waitForElementByCss('#slug-page')
      .elementByCss('#to-blog-post')
      .click()
      .waitForElementByCss('#blog-post-page')
    expect(await browser.elementByCss('h1').text()).toBe('Blog post a-post')
  })
})
