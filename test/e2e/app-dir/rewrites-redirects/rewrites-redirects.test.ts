import { createNextDescribe } from 'e2e-utils'
import { waitFor } from 'next-test-utils'

createNextDescribe(
  'redirects and rewrites',
  {
    files: __dirname,
    dependencies: {
      react: 'latest',
      'react-dom': 'latest',
      typescript: 'latest',
      '@types/react': 'latest',
      '@types/node': 'latest',
    },
  },
  ({ next }) => {
    /**
     * All test will use a link/button to navigate to '/*-before' which should be redirected by correct redirect/rewrite to '/*-after'
     */
    describe.each(['link', 'button'])('navigation using %s', (testType) => {
      it('should rewrite from middleware correctly', async () => {
        const browser = await next.browser('/')
        browser.elementById(`${testType}-middleware-rewrite`).click()
        await waitFor(200)

        expect(await browser.elementById('page').text()).toBe(
          'middleware-rewrite-after'
        )
        const url = new URL(await browser.url())
        expect(url.pathname).toEndWith('-before')
      })

      it('should redirect from middleware correctly', async () => {
        const browser = await next.browser('/')
        browser.elementById(`${testType}-middleware-redirect`).click()
        await waitFor(200)

        expect(await browser.elementById('page').text()).toBe(
          'middleware-redirect-after'
        )
        const url = new URL(await browser.url())
        expect(url.pathname).toEndWith('-after')
      })

      it('should rewrite from next.config.js correctly', async () => {
        const browser = await next.browser('/')
        browser.elementById(`${testType}-config-rewrite`).click()
        await waitFor(200)

        expect(await browser.elementById('page').text()).toBe(
          'config-rewrite-after'
        )
        const url = new URL(await browser.url())
        expect(url.pathname).toEndWith('-before')
      })

      it('should redirect from next.config.js correctly', async () => {
        const browser = await next.browser('/')
        browser.elementById(`${testType}-config-redirect`).click()
        await waitFor(200)

        expect(await browser.elementById('page').text()).toBe(
          'config-redirect-after'
        )
        const url = new URL(await browser.url())
        expect(url.pathname).toEndWith('-after')
      })

      it('should redirect using catchall from next.config.js correctly', async () => {
        const browser = await next.browser('/')
        browser.elementById(`${testType}-config-redirect-catchall`).click()
        await waitFor(200)

        expect(await browser.elementById('page').text()).toBe(
          'config-redirect-catchall-after/thing'
        )
        const url = new URL(await browser.url())
        expect(url.pathname).toEndWith('-after/thing')
      })
    })
  }
)
