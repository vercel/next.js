import { nextTestSetup } from 'e2e-utils'

describe('i18n-navigations-middleware', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should respect selected locale when navigating to a dynamic route', async () => {
    const browser = await next.browser('/')
    // change to "de" locale
    await browser.elementByCss("[href='/de']").click()
    const dynamicLink = await browser.waitForElementByCss(
      "[href='/de/dynamic/1']"
    )
    expect(await browser.elementById('current-locale').text()).toBe(
      'Current locale: de'
    )

    // navigate to dynamic route
    await dynamicLink.click()

    // the locale should still be "de"
    expect(await browser.elementById('dynamic-locale').text()).toBe(
      'Locale: de'
    )
  })

  it('should respect selected locale when navigating to a static route', async () => {
    const browser = await next.browser('/')
    // change to "de" locale
    await browser.elementByCss("[href='/de']").click()
    const staticLink = await browser.waitForElementByCss("[href='/de/static']")
    expect(await browser.elementById('current-locale').text()).toBe(
      'Current locale: de'
    )

    // navigate to static route
    await staticLink.click()

    // the locale should still be "de"
    expect(await browser.elementById('static-locale').text()).toBe('Locale: de')
  })
})
