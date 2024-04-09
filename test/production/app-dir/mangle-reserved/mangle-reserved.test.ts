import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'mangle-reserved',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should preserve the name', async () => {
      const $ = await next.render$('/')
      expect($('p').text()).toBe('AbortSignal')
    })
  }
)
