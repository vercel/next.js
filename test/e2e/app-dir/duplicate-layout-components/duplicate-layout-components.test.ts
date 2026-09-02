import { nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// No deploy-specific incompatibility is documented.
// @force-gate !deploy
describe('app dir - duplicate layout components', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not duplicate layout elements when navigating to 404', async () => {
    const browser = await next.browser('/solutions/404')

    // Verify counts haven't changed - no duplication
    expect((await browser.elementsByCss('body')).length).toBe(1)
    expect((await browser.elementsByCss('#header')).length).toBe(1)
    expect((await browser.elementsByCss('#footer')).length).toBe(1)
  })
})
