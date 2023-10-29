/* eslint-env jest */
import { join } from 'path'
import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'next-config-ts',
  {
    files: join(__dirname, './app'),
  },
  ({ next }) => {
    it('should build and start successfully', async () => {
      const browser = await next.browser('/')
      const text = await browser.elementByCss('h1').text()
      expect(text).toBe('Hello World!')
    })
  }
)
