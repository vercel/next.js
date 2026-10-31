import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('worker-module-url', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      // Mirrors the conditional wildcard exports used by worker packages.
      'worker-package': 'file:./worker-package',
    },
  })

  it('should create a worker from a bare module URL', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('button').click()

    await retry(async () => {
      expect(await browser.elementById('status').text()).toBe('ready')
    })
  })
})
