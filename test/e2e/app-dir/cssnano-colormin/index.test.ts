import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'cssnano-colormin',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should not minify colors to hsla', async () => {
      const $ = await next.render$('/')
      expect($('.foo').css('background-color')).toBe('rgb(143 101 98 / 43%)')
    })
  }
)
