import { nextTestSetup } from 'e2e-utils'

export function runTest({ next }) {
  it('should allow navigation on not-found', async () => {
    const browser = await next.browser('/trigger-404')
    expect(await browser.elementByCss('#not-found-component').text()).toBe(
      'Not Found!'
    )

    expect(
      await browser
        .elementByCss('#to-result')
        .click()
        .waitForElementByCss('#result-page')
        .text()
    ).toBe('Result Page!')
  })

  it('should allow navigation on error', async () => {
    const browser = await next.browser('/trigger-error')
    expect(await browser.elementByCss('#error-component').text()).toBe(
      'Error Happened!'
    )

    expect(
      await browser
        .elementByCss('#to-result')
        .click()
        .waitForElementByCss('#result-page')
        .text()
    ).toBe('Result Page!')
  })

  it('should allow navigation to other routes on route that was initially not-found', async () => {
    // Intentionally non-existent route.
    const browser = await next.browser('/testabc')
    expect(await browser.elementByCss('#not-found-component').text()).toBe(
      'Not Found!'
    )

    expect(
      await browser
        .elementByCss('#to-result')
        .click()
        .waitForElementByCss('#result-page')
        .text()
    ).toBe('Result Page!')
  })

  it('should allow navigation back to route that was initially not-found', async () => {
    // Intentionally non-existent route.
    const browser = await next.browser('/testabc')
    expect(await browser.elementByCss('#not-found-component').text()).toBe(
      'Not Found!'
    )

    await browser
      .elementByCss('#to-result')
      .click()
      .waitForElementByCss('#result-page')
      .back()
      .waitForElementByCss('#not-found-component')
  })

  it('should allow navigating to a page calling notfound', async () => {
    const browser = await next.browser('/')

    await browser
      .elementByCss('#trigger-404-link')
      .click()
      .waitForElementByCss('#not-found-component')

    expect(await browser.elementByCss('#not-found-component').text()).toBe(
      'Not Found!'
    )

    await browser.back().waitForElementByCss('#homepage')

    expect(await browser.elementByCss('#homepage').text()).toBe('Home')
  })

  it('should allow navigating to a non-existent page', async () => {
    const browser = await next.browser('/')

    await browser
      .elementByCss('#non-existent-link')
      .click()
      .waitForElementByCss('#not-found-component')

    expect(await browser.elementByCss('#not-found-component').text()).toBe(
      'Not Found!'
    )

    await browser.back().waitForElementByCss('#homepage')

    expect(await browser.elementByCss('#homepage').text()).toBe('Home')
  })

  it('should be able to navigate to other page from root not-found page', async () => {
    const browser = await next.browser('/')

    await browser
      .elementByCss('#go-to-404')
      .click()
      .waitForElementByCss('#not-found-component')

    await browser
      .elementByCss('#go-to-dynamic')
      .click()
      .waitForElementByCss('#dynamic')

    expect(await browser.elementByCss('#dynamic').text()).toBe(
      'Dynamic page: foo'
    )

    await browser
      .elementByCss('#go-to-dynamic-404')
      .click()
      .waitForElementByCss('#not-found-component')

    await browser
      .elementByCss('#go-to-index')
      .click()
      .waitForElementByCss('#homepage')
  })
}

describe('app dir - not found navigation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  runTest({ next })
})
