import { nextTestSetup } from 'e2e-utils'

// TODO-APP: fix test as it's failing randomly
describe.skip('app-dir back button download bug', () => {
  describe('app-dir back button download bug', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
    })

    if (skipped) {
      return
    }

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
