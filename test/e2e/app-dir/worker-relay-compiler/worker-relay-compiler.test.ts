import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Regression test for https://github.com/vercel/next.js/issues/96597
describe('worker-relay-compiler', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should compile a web worker while the relay transform is enabled', async () => {
    const browser = await next.browser('/')

    await retry(async () =>
      expect(await browser.elementByCss('#worker-state').text()).toBe(
        'hello from worker'
      )
    )
  })
})
