import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'cssnano-colormin',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should not minify rgb colors to hsla', async () => {
      const browser = await next.browser('/')
      let color = await browser.eval(
        `window.getComputedStyle(document.querySelector('.foo')).backgroundColor`
      )
      expect(color).toBe('rgba(143, 101, 98, 0.43)')
    })
  }
)
