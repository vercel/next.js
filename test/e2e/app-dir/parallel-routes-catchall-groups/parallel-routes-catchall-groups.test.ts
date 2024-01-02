import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

createNextDescribe(
  'parallel-routes-catchall-groups',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should work without throwing any errors about conflicting paths', async () => {
      const browser = await next.browser('/')

      await check(() => browser.elementByCss('body').text(), /Home/)
      await browser.elementByCss('[href="/foo"]').click()
      // Foo has a page route defined, so we'd expect to see the page content
      await check(() => browser.elementByCss('body').text(), /Foo Page/)
      await browser.back()

      // /bar doesn't have an explicit page path. (group-a) defines a catch-all slot with a separate root layout
      // that only renders a slot (ie no children). So we'd expect to see the fallback slot content
      await browser.elementByCss('[href="/bar"]').click()
      await check(() => browser.elementByCss('body').text(), /Catcher/)
    })
  }
)
