import { nextTestSetup } from 'e2e-utils'

describe('css-module-with-next-dynamic-and-static-import', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should be able to load the same css module with both next/dynamic and static import', async () => {
    const browser = await next.browser('/')
    await browser.elementById('dynamic-import').click()

    expect(await browser.elementByCss('button').text()).toBe(
      'My background should be red!'
    )

    // button's background should be red, not gray.
    expect(
      await browser.eval(
        `window.getComputedStyle(document.querySelector('button')).backgroundColor`
      )
    ).not.toBe('rgb(239, 239, 239)')

    expect(
      await browser.eval(
        `window.getComputedStyle(document.querySelector('button')).backgroundColor`
      )
    ).toBe('rgb(255, 0, 0)')
  })

  it('should be able to load the same css module with both next/dynamic (variable-inserted path) and static import', async () => {
    const browser = await next.browser('/')
    await browser.elementById('variable-inserted-dynamic-import').click()

    expect(await browser.elementByCss('button').text()).toBe(
      'My background should be red!'
    )

    // button's background should be red, not gray.
    expect(
      await browser.eval(
        `window.getComputedStyle(document.querySelector('button')).backgroundColor`
      )
    ).not.toBe('rgb(239, 239, 239)')

    expect(
      await browser.eval(
        `window.getComputedStyle(document.querySelector('button')).backgroundColor`
      )
    ).toBe('rgb(255, 0, 0)')
  })
})
