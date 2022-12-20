import { createNextDescribe } from 'e2e-utils'
import path from 'path'

createNextDescribe(
  'with babel',
  {
    files: path.join(__dirname, 'with-babel'),
    skipDeployment: true,
  },
  ({ next }) => {
    it('should support babel in app dir', async () => {
      const $ = await next.render$('/')
      expect($('h1').text()).toBe('hello')
    })
  }
)
