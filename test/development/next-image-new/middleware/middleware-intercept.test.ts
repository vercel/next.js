import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Image is intercepted by Middleware', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should find log from _next/image intercept', async () => {
    const browser = await next.browser('/')

    await browser.waitForIdleNetwork()

    await retry(async () => {
      expect(next.cliOutput).toContain('GET /')
    })

    expect(next.cliOutput).toContain(`x-_next-image: /small.jpg`)
  })
})
