import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

createNextDescribe(
  'parallel-routes-boundaries',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should show both loading states and then both page content', async () => {
      const browser = await next.browser('/')

      expect(await browser.elementByCss('#form').text()).toBe('loading')
      expect(await browser.elementByCss('#renders').text()).toBe('loading')

      await check(() => browser.waitForElementByCss('#form').text(), 'content')
      await check(
        () => browser.waitForElementByCss('#renders').text(),
        'content'
      )
    })
  }
)
