import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('prefetching-not-found', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should correctly navigate to/from a global 404 page when following links with prefetch=auto', async () => {
    let browser = await next.browser('/')
    expect(await browser.elementByCss('h1').text()).toBe('Home Page')

    await browser.elementByCss("[href='/fake-link']").click()

    await retry(async () => {
      expect(await browser.elementByCss('body').text()).toContain(
        'This page could not be found.'
      )
    })

    await browser.elementByCss("[href='/']").click()

    await retry(async () => {
      expect(await browser.elementByCss('h1').text()).toBe('Home Page')
    })

    // assert the same behavior, but starting at the not found page. This is to ensure that when we seed the prefetch cache,
    // we don't have any cache collisions that would cause the not-found page to remain rendered when following a link to the home page
    browser = await next.browser('/fake-link')
    expect(await browser.elementByCss('body').text()).toContain(
      'This page could not be found.'
    )

    await browser.elementByCss("[href='/']").click()

    await retry(async () => {
      expect(await browser.elementByCss('h1').text()).toBe('Home Page')
    })
  })
})
