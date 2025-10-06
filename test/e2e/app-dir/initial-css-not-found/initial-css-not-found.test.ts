import { nextTestSetup } from 'e2e-utils'

describe('initial-css-not-found', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Regression test for a bug where the existence of a not-found page would prevent the css from being discovered.
  // See https://github.com/vercel/next.js/issues/77861 and https://github.com/vercel/next.js/issues/79535
  it('should serve styles', async () => {
    const browser = await next.browser('/')

    // Simply check that our css was served and applied.
    expect(
      await browser.eval(
        `window.getComputedStyle(document.querySelector('body')).color`
      )
    ).toBe('rgb(255, 0, 0)')
  })
})
