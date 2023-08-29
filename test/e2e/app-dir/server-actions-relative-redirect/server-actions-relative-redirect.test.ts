// @ts-check
import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

createNextDescribe(
  'server-actions-relative-redirect',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should work with relative redirect', async () => {
      const browser = await next.browser('/')
      // get relaive redirect button
      await browser.elementByCss('#relative-redirect').click()
      // wait for page to load

      await check(async () => {
        expect(await browser.waitForElementByCss('#page-loaded').text()).toBe(
          'hello nested page'
        )

        return 'success'
      }, 'success')
    })

    it('should work with absolute redirect', async () => {
      const browser = await next.browser('/')
      await browser.elementByCss('#absolute-redirect').click()

      await check(async () => {
        expect(await browser.waitForElementByCss('#page-loaded').text()).toBe(
          'hello nested page'
        )

        return 'success'
      }, 'success')
    })
  }
)
