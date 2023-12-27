import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'fetch-cache-limit',
  {
    files: __dirname,
    // don't have access to runtime logs on deploy
    skipDeployment: true,
  },
  ({ next }) => {
    it('when awaiting `fetch` using an unknown domain, stack traces are preserved', async () => {
      const browser = await next.browser('/')
      await browser.waitForElementByCss('#content')
      await browser.refresh()
      await browser.waitForElementByCss('#content')
      await browser.refresh()
      await browser.waitForElementByCss('#content')
      // console.log(next.cliOutput.match('Load data'))
      expect(next.cliOutput.match('Load data').length).toBe(1)
    })
  }
)
