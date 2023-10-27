import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

createNextDescribe(
  'interception-middleware-rewrite',
  {
    files: __dirname,
    // TODO: remove after deployment handling is updated
    skipDeployment: true,
  },
  ({ next }) => {
    it('should support intercepting routes with a middleware rewrite', async () => {
      const browser = await next.browser('/')

      await check(() => browser.waitForElementByCss('#children').text(), 'root')

      await check(
        () =>
          browser
            .elementByCss('[href="/feed"]')
            .click()
            .waitForElementByCss('#modal')
            .text(),
        'intercepted'
      )

      await check(
        () => browser.refresh().waitForElementByCss('#children').text(),
        'not intercepted'
      )

      await check(() => browser.waitForElementByCss('#modal').text(), '')
    })
  }
)
