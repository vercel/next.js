import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'syntax-highlighter-crash',
  {
    files: __dirname,
    dependencies: {
      'react-syntax-highlighter': '15.5.0',
    },
  },
  ({ next }) => {
    it('should render the page', async () => {
      const $ = await next.render$('/')
      expect($('p').text()).toBe('hello world')
    })
  }
)
