import { nextTestSetup } from 'e2e-utils'

describe('initial-css-order', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should serve styles in the correct order for the page', async () => {
    const browser = await next.browser('/')

    expect(
      await browser.eval(
        `window.getComputedStyle(document.querySelector('body')).backgroundColor`
      )
    ).toBe('rgb(0, 128, 0)')
  })

  it('should serve styles in the correct order for global-not-found', async () => {
    const browser = await next.browser('/404')

    expect(
      await browser.eval(
        `window.getComputedStyle(document.querySelector('body')).backgroundColor`
      )
    ).toBe('rgb(255, 0, 0)')
  })
})
