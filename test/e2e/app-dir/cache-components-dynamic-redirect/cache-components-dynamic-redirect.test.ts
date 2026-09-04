import { nextTestSetup } from 'e2e-utils'

describe('cache-components-dynamic-redirect', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('follows redirect() on client navigation into a fully-dynamic route', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#home').text()).toBe('home')

    await browser.elementByCss('#to-redirect-blocking').click()
    expect(await browser.waitForElementByCss('#redirect-result').text()).toBe(
      'redirect-result'
    )
    expect(await browser.url()).toContain('/redirect-result')
  })

  it('follows redirect() on client navigation into a Suspense-wrapped route', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#home').text()).toBe('home')

    await browser.elementByCss('#to-redirect-suspense').click()
    expect(await browser.waitForElementByCss('#redirect-result').text()).toBe(
      'redirect-result'
    )
    expect(await browser.url()).toContain('/redirect-result')
  })

  it('follows redirect() on a direct visit to a fully-dynamic route', async () => {
    const browser = await next.browser('/redirect-blocking')
    expect(await browser.waitForElementByCss('#redirect-result').text()).toBe(
      'redirect-result'
    )
    expect(await browser.url()).toContain('/redirect-result')
  })
})
