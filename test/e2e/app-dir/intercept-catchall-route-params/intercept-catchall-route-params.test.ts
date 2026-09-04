import { nextTestSetup } from 'e2e-utils'

describe('intercept-catchall-route-params', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should keep multi-segment catchall params as an array when intercepting', async () => {
    const browser = await next.browser('/photos')
    await browser.elementByCss('a[href="/photos/a/b"]').click()
    const text = await browser.waitForElementByCss('#intercepted').text()
    expect(JSON.parse(text)).toEqual(['a', 'b'])
  })

  it('should keep single-segment catchall params as an array when intercepting', async () => {
    const browser = await next.browser('/photos')
    await browser.elementByCss('a[href="/photos/only"]').click()
    const text = await browser.waitForElementByCss('#intercepted').text()
    expect(JSON.parse(text)).toEqual(['only'])
  })
})
