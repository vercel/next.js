import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'terser-class-static-blocks',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should work using cheerio', async () => {
      const $ = await next.render$('/')
      expect($('p').text()).toBe('Hello world')
    })
  }
)
