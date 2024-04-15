import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'mjs as extension',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should render the page correctly', async () => {
      const $ = await next.render$('/')
      expect($('p').text()).toBe('hello world!')
    })
  }
)
