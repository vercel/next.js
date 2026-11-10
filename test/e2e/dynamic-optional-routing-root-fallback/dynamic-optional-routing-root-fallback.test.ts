import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Dynamic Optional Routing Root Fallback', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('should render optional catch-all top-level route with no segments', async () => {
    const browser = await next.browser('/')
    await browser.waitForElementByCss('#success')
    await retry(async () => {
      expect(await browser.elementByCss('#success').text()).toMatch(/yay/)
    })
  })

  it('should render optional catch-all top-level route with one segment', async () => {
    const browser = await next.browser('/one')
    await browser.waitForElementByCss('#success')
    await retry(async () => {
      expect(await browser.elementByCss('#success').text()).toMatch(/one/)
    })
  })

  it('should render optional catch-all top-level route with two segments', async () => {
    const browser = await next.browser('/one/two')
    await browser.waitForElementByCss('#success')
    await retry(async () => {
      expect(await browser.elementByCss('#success').text()).toMatch(/one,two/)
    })
  })
})
