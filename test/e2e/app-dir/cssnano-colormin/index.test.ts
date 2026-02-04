import { nextTestSetup } from 'e2e-utils'

describe('cssnano-colormin', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not minify rgb colors to hsla', async () => {
    const browser = await next.browser('/')
    let color = await browser.eval(
      `window.getComputedStyle(document.querySelector('.foo')).backgroundColor`
    )
    expect(color).toBe('rgba(143, 101, 98, 0.43)')
  })
})
