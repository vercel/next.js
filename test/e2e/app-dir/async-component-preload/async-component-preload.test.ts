import { nextTestSetup } from 'e2e-utils'

describe('async-component-preload', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should handle redirect in an async page', async () => {
    const browser = await next.browser('/')
    expect(await browser.waitForElementByCss('#success').text()).toBe('Success')
  })
})
