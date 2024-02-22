import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'next-config-cjs-no-default-export',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should build and start', async () => {
      const $ = await next.render$('/')
      expect($('p').text()).toBe('hello world')
    })
  }
)
