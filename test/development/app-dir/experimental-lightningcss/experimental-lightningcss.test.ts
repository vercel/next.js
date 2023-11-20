import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'experimental-lightningcss',
  {
    files: __dirname,
  },
  ({ next }) => {
    // Recommended for tests that check HTML. Cheerio is a HTML parser that has a jQuery like API.
    ;(process.env.TURBOPACK ? describe : describe.skip)(
      'with it enabled',
      () => {
        it('should support css modules', async () => {
          const $ = await next.render$('/')
          expect($('p').text()).toBe('hello world')
          // swc_css does not include `-module` in the class name, while lightningcss does.
          expect($('p').attr('class')).toBe('style-module__hlQ3RG__blue')
        })
      }
    )
  }
)
