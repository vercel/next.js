import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

describe('app dir - workers', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should support web workers with dynamic imports', async () => {
    const browser = await next.browser('/classic')
    expect(await browser.elementByCss('#worker-state').text()).toBe('default')

    await browser.elementByCss('button').click()

    await check(
      async () => browser.elementByCss('#worker-state').text(),
      'worker.ts:worker-dep'
    )
  })

  it('should support module web workers with dynamic imports', async () => {
    const browser = await next.browser('/module')
    expect(await browser.elementByCss('#worker-state').text()).toBe('default')

    await browser.elementByCss('button').click()

    await check(
      async () => browser.elementByCss('#worker-state').text(),
      'worker.ts:worker-dep'
    )
  })
})
