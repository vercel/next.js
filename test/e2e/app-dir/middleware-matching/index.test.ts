import { nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// No deploy-specific incompatibility is documented.
// @force-gate !deploy
describe('app dir - middleware with custom matcher', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should match /:id (without asterisk)', async () => {
    const browser = await next.browser('/chat/123')
    expect(await browser.elementByCss('p').text()).toBe('Home')
  })
})
