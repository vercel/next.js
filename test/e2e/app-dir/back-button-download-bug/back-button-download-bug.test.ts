import { nextTestSetup } from 'e2e-utils'

// TODO-APP: fix test as it's failing randomly
describe.skip('app-dir back button download bug', () => {
  // TODO(deploy-test-completion): Re-enable this suite in deploy mode.
  // No deploy-specific incompatibility is documented.
  // @force-gate !deploy
  describe('app-dir back button download bug', () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('should redirect route when clicking link', async () => {
      const browser = await next.browser('/')
      const text = await browser
        .elementByCss('#to-post-1')
        .click()
        .waitForElementByCss('#post-page')
        .text()
      expect(text).toBe('This is the post page')

      await browser.back()

      expect(await browser.waitForElementByCss('#home-page').text()).toBe(
        'Home!'
      )
    })
  })
})
