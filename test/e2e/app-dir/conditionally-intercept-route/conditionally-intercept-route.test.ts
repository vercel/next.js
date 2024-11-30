import { nextTestSetup } from 'e2e-utils'

describe('link-attribute-to-conditionally-intercept-route', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Recommended for tests that check HTML. Cheerio is a HTML parser that has a jQuery like API.
  it('should intercept by default', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#default-behavior').click()
    await browser.waitForElementByCss('#intercepting-page', 5000)
  })

  it('should intercept if explicitly told to', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#explicitly-intercepted').click()
    await browser.waitForElementByCss('#intercepting-page', 5000)
  })

  it('should not intercept if explicitly told not to', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#explicitly-not-intercepted').click()
    await browser.waitForElementByCss('#non-intercepting-page', 5000)
  })
})
