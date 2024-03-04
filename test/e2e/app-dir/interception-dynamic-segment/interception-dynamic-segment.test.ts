import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

createNextDescribe(
  'interception-dynamic-segment',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should work when interception route is paired with a dynamic segment', async () => {
      const browser = await next.browser('/')

      await browser.elementByCss('[href="/foo/1"]').click()
      await check(() => browser.elementById('modal').text(), /intercepted/)
      await browser.refresh()
      await check(() => browser.elementById('modal').text(), '')
      await check(
        () => browser.elementById('children').text(),
        /not intercepted/
      )
    })
  }
)
