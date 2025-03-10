import { nextTestSetup } from 'e2e-utils'

describe('redirects and rewrites', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      typescript: 'latest',
      '@types/react': 'latest',
      '@types/node': 'latest',
    },
  })

  // TODO: investigate test failures on deploy
  if ((global as any).isNextDeploy) {
    it('should skip for deploy', () => {})
    return
  }
  /**
   * All test will use a link/button to navigate to '/*-before' which should be redirected by correct redirect/rewrite to '/*-after'
   */
  describe.each(['link', 'button'])('navigation using %s', (testType) => {
    it('should rewrite from middleware correctly', async () => {
      const browser = await next.browser('/')
      await browser
        .elementById(`${testType}-middleware-rewrite`)
        .click()
        .waitForElementByCss('.page_middleware-rewrite-after')
      const url = new URL(await browser.url())
      expect(url.pathname).toEndWith('-before')
    })

    it('should redirect from middleware correctly', async () => {
      const browser = await next.browser('/')
      await browser
        .elementById(`${testType}-middleware-redirect`)
        .click()
        .waitForElementByCss('.page_middleware-redirect-after')
      const url = new URL(await browser.url())
      expect(url.pathname).toEndWith('-after')
    })

    it('should rewrite from next.config.js correctly', async () => {
      const browser = await next.browser('/')
      await browser
        .elementById(`${testType}-config-rewrite`)
        .click()
        .waitForElementByCss('.page_config-rewrite-after')
      const url = new URL(await browser.url())
      expect(url.pathname).toEndWith('-before')
    })

    it('should redirect from next.config.js correctly', async () => {
      const browser = await next.browser('/')
      await browser
        .elementById(`${testType}-config-redirect`)
        .click()
        .waitForElementByCss('.page_config-redirect-after')
      const url = new URL(await browser.url())
      expect(url.pathname).toEndWith('-after')
    })

    it('should redirect using catchall from next.config.js correctly', async () => {
      const browser = await next.browser('/')
      await browser
        .elementById(`${testType}-config-redirect-catchall`)
        .click()
        .waitForElementByCss('.page_config-redirect-catchall-after_thing')
      const url = new URL(await browser.url())
      expect(url.pathname).toEndWith('-after/thing')
    })
    it('should redirect from next.config.js correctly with empty query params', async () => {
      const browser = await next.browser('/?q=1&=')
      await browser
        .elementById(`${testType}-config-redirect`)
        .click()
        .waitForElementByCss('.page_config-redirect-after')
      const url = new URL(await browser.url())
      expect(url.pathname).toEndWith('-after')
    })
  })
})
