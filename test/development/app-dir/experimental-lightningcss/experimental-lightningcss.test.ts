import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'experimental-lightningcss',
  {
    files: __dirname,
  },
  ({ next }) => {
    // Recommended for tests that check HTML. Cheerio is a HTML parser that has a jQuery like API.
    it('should work using cheerio', async () => {
      const $ = await next.render$('/')
      expect($('p').text()).toBe('hello world')
      expect($('p').html()).toMatchInlineSnapshot(`"hello world"`)
      expect($('p').attr('class')).toMatchInlineSnapshot(`"style_blue__2oYLK"`)
      expect($('p').css('color')).toBe('red')
    })
  }
)
