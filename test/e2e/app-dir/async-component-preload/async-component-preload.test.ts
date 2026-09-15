import { nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// No deploy-specific incompatibility is documented.
// @force-gate !deploy
describe('async-component-preload', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should handle redirect in an async page', async () => {
    const browser = await next.browser('/')
    expect(await browser.waitForElementByCss('#success').text()).toBe('Success')
  })
})
