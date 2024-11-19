import { nextTestSetup } from 'e2e-utils'

describe('dynamic-css-client-navigation next/dynamic', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not remove style when navigating from static imported component to next/dynamic', async () => {
    const browser = await next.browser('/')
    expect(
      await browser
        .elementByCss('a[href="/next-dynamic"]')
        .click()
        .waitForElementByCss('#red-button')
        .text()
    ).toBe('My background should be red!')

    const buttonBgColor = await browser.eval(
      `window.getComputedStyle(document.querySelector('button')).backgroundColor`
    )
    // not gray
    expect(buttonBgColor).not.toBe('rgb(239, 239, 239)')
    // but red
    expect(buttonBgColor).toBe('rgb(255, 0, 0)')
  })

  it('should not remove style when navigating from static imported component to next/dynamic with ssr: false', async () => {
    const browser = await next.browser('/')
    expect(
      await browser
        .elementByCss('a[href="/next-dynamic-ssr-false"]')
        .click()
        .waitForElementByCss('#red-button')
        .text()
    ).toBe('My background should be red!')

    const buttonBgColor = await browser.eval(
      `window.getComputedStyle(document.querySelector('button')).backgroundColor`
    )
    // not gray
    expect(buttonBgColor).not.toBe('rgb(239, 239, 239)')
    // but red
    expect(buttonBgColor).toBe('rgb(255, 0, 0)')
  })
})
