import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('prefetch-partial-rsc', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('resolves after a client-side navigation', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#learn-link').click()
    await retry(async () => {
      const text = await browser.elementByCss('#user').text()
      expect(text).toBe('user: Guest')
    })
  })
})
