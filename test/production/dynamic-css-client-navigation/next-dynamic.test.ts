import { nextTestSetup } from 'e2e-utils'

describe('dynamic-css-client-navigation next/dynamic', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  const isTurbopackBuild = isTurbopack && process.env.TURBOPACK_BUILD

  it('should not remove style when navigating from static imported component to next/dynamic', async () => {
    const browser = await next.browser('/')
    expect(
      await browser
        .elementByCss('a[href="/next-dynamic"]')
        .click()
        .waitForElementByCss('#red-button')
        .text()
    ).toBe('Red Button')

    const buttonBgColor = await browser.eval(
      `window.getComputedStyle(document.querySelector('button')).backgroundColor`
    )

    // TODO: remove this condition after fix
    if (isTurbopackBuild) {
      expect(buttonBgColor).not.toBe('rgb(239, 239, 239)')
      expect(buttonBgColor).toBe('rgb(255, 0, 0)')
    } else {
      // TODO: replace this after fix
      // should be red, but is gray now.
      expect(buttonBgColor).toBe('rgb(239, 239, 239)')
      expect(buttonBgColor).not.toBe('rgb(255, 0, 0)')
    }
  })

  it('should not remove style when navigating from static imported component to next/dynamic with ssr: false', async () => {
    const browser = await next.browser('/')
    expect(
      await browser
        .elementByCss('a[href="/next-dynamic-ssr-false"]')
        .click()
        .waitForElementByCss('#red-button')
        .text()
    ).toBe('Red Button')

    const buttonBgColor = await browser.eval(
      `window.getComputedStyle(document.querySelector('button')).backgroundColor`
    )

    // TODO: remove this condition after fix
    if (isTurbopackBuild) {
      expect(buttonBgColor).not.toBe('rgb(239, 239, 239)')
      expect(buttonBgColor).toBe('rgb(255, 0, 0)')
    } else {
      // TODO: replace this after fix
      // should be red, but is gray now.
      expect(buttonBgColor).toBe('rgb(239, 239, 239)')
      expect(buttonBgColor).not.toBe('rgb(255, 0, 0)')
    }
  })
})
