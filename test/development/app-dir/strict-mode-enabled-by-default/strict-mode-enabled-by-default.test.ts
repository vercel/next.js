import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Strict Mode enabled by default', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })
  it('should work using browser', async () => {
    const browser = await next.browser('/')
    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe('2')
    })
  })
})
