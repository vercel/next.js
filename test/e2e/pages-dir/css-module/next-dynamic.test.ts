import { nextTestSetup } from 'e2e-utils'

describe('css-module-with-next-dynamic-and-static-import', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should be able to load the same css module with both next/dynamic and static import', async () => {
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

  it('should be able to load the same css module with both next/dynamic (ssr: false) and static import', async () => {
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
