import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'with babel',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next }) => {
    it('should support babel in app dir', async () => {
      const $ = await next.render$('/')
      expect($('h1').text()).toBe('hello')
    })
  }
)
