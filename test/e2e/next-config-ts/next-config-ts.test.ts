import { join } from 'path'
import { createNextDescribe } from 'e2e-utils'

const tests = [
  'cjs',
  'cjs-export-assignment',
  'esm',
  'esm-async',
  'esm-export-as-default',
]
const failingTests = ['esm-no-default-export']

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
        expect(text).toBe('my-value')
      })
    }
  )
})

failingTests.forEach((test) => {
  createNextDescribe(
    test,
    {
      files: join(__dirname, test),
    },
    ({ next }) => {
      it('should not correctly render', async () => {
        const browser = await next.browser('/')
        const text = await browser.elementByCss('h1').text()
        expect(text).not.toBe('my-value')
      })
    }
  )
})
