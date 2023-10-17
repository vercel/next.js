/* eslint-env jest */
import { join } from 'path'
import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'middleware-typescript',
  {
    files: join(__dirname, '../app'),
  },
  ({ next }) => {
    it('should have built and started', async () => {
      const response = await next.fetch('/static')
      expect(response.headers.get('data')).toEqual('hello from middleware')
    })
  }
)
