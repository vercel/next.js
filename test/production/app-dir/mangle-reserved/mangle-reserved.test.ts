import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'mangle-reserved',
  {
    files: __dirname,
  },
  ({ next, isTurbopack }) => {
    it('should work using cheerio', async () => {
      if (!isTurbopack) {
        const $ = await next.render$('/')
        expect($('p').text()).toBe('AbortSignal')
      }
    })
  }
)
