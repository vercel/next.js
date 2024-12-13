import { nextTestSetup } from 'e2e-utils'

describe('link-attribute-to-conditionally-intercept-route', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Test cases for the `Link` component
  it('should intercept by default (Link)', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#default-behavior').click()
    await browser.waitForElementByCss('#intercepting-page', 5000)
  })

  it('should intercept if explicitly told to (Link)', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#explicitly-intercepted').click()
    await browser.waitForElementByCss('#intercepting-page', 5000)
  })

  it('should not intercept if explicitly told not to (Link)', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#explicitly-not-intercepted').click()
    await browser.waitForElementByCss('#non-intercepting-page', 5000)
  })

  // Test cases for `useRouter.push`
  it('should intercept by default (useRouter.push)', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#router-push-default-behavior').click()
    await browser.waitForElementByCss('#intercepting-page', 5000)
  })

  it('should intercept if explicitly told to (useRouter.push)', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#router-push-explicitly-intercepted').click()
    await browser.waitForElementByCss('#intercepting-page', 5000)
  })

  it('should not intercept if explicitly told not to (useRouter.push)', async () => {
    const browser = await next.browser('/')
    await browser
      .elementByCss('#router-push-explicitly-not-intercepted')
      .click()
    await browser.waitForElementByCss('#non-intercepting-page', 5000)
  })

  // Test cases for `useRouter.replace`
  it('should intercept by default (useRouter.replace)', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#router-replace-default-behavior').click()
    await browser.waitForElementByCss('#intercepting-page', 5000)
  })

  it('should intercept if explicitly told to (useRouter.replace)', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#router-replace-explicitly-intercepted').click()
    await browser.waitForElementByCss('#intercepting-page', 5000)
  })

  it('should not intercept if explicitly told not to (useRouter.replace)', async () => {
    const browser = await next.browser('/')
    await browser
      .elementByCss('#router-replace-explicitly-not-intercepted')
      .click()
    await browser.waitForElementByCss('#non-intercepting-page', 5000)
  })
})
