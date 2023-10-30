import { join } from 'path'
import { createNextDescribe } from '../../lib/e2e-utils'

const tests = ['cjs', 'esm']

tests.forEach((test) => {
  createNextDescribe(
    test,
    {
      files: join(__dirname, test),
    },
    ({ next }) => {
      it('should build and start successfully', async () => {
        const browser = await next.browser('/')
        const text = await browser.elementByCss('h1').text()
        expect(text).toBe('Hello World!')
      })
    }
  )
})
