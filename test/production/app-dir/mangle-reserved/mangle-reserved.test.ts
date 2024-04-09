import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'mangle-reserved',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should work using cheerio', async () => {
      const $ = await next.render$('/')
      // eslint-disable-next-line jest/no-standalone-expect
      expect($('p').text()).toBe('AbortSignal')
    })
  }
)
