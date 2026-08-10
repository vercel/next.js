import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'

describe('Ordering with styled-jsx', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'fixtures/with-styled-jsx'),
  })

  it('should have the correct color (css ordering)', async () => {
    const browser = await next.browser('/')

    const currentColor = await browser.eval(
      `window.getComputedStyle(document.querySelector('.my-text')).color`
    )
    expect(currentColor).toMatchInlineSnapshot(`"rgb(0, 128, 0)"`)
  })
})
