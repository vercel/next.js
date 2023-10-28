/* eslint-env jest */
import { join } from 'path'
import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'next-config-ts',
  {
    files: join(__dirname, './app'),
  },
  ({ next }) => {
    it('should have built and started', async () => {
      const response = await next.fetch('/')
      expect(response.status).toBe(200)
    })
  }
)
