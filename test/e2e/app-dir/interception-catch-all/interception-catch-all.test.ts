import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

describe('interception-catch-all', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should work when interception route is used together with catch-all in implicit children', async () => {
    const browser = await next.browser('/implicit')
    expect(await browser.elementById('children').text()).toBe('Home\nOpen cart')
    expect(await browser.elementById('modal').text()).toBe('default parent')

    await browser.elementByCss('[href="/implicit/cart"]').click()
    await check(() => browser.elementById('children').text(), 'Home\nOpen cart')
    await check(() => browser.elementById('modal').text(), 'cart modal')
  })

  it('should work when interception route is used together with catch-all in explicit children', async () => {
    const browser = await next.browser('/explicit')
    expect(await browser.elementById('children').text()).toBe('Home\nOpen cart')
    expect(await browser.elementById('modal').text()).toBe('default parent')

    await browser.elementByCss('[href="/explicit/cart"]').click()
    await check(() => browser.elementById('children').text(), 'Home\nOpen cart')
    await check(() => browser.elementById('modal').text(), 'cart modal')
  })
})
