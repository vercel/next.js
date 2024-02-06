import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

createNextDescribe(
  'parallel-routes-revalidation',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should submit the action and revalidate the page data', async () => {
      const browser = await next.browser('/')
      await check(() => browser.hasElementByCssSelector('#create-entry'), false)

      // there shouldn't be any data yet
      expect((await browser.elementsByCss('#entries li')).length).toBe(0)

      await browser.elementByCss("[href='/revalidate-modal']").click()

      await check(() => browser.hasElementByCssSelector('#create-entry'), true)

      await browser.elementById('create-entry').click()

      // we created an entry and called revalidate, so we should have 1 entry
      await check(
        async () => (await browser.elementsByCss('#entries li')).length,
        1
      )

      await browser.elementById('create-entry').click()

      // we created an entry and called revalidate, so we should have 2 entries
      await check(
        async () => (await browser.elementsByCss('#entries li')).length,
        2
      )

      await browser.elementByCss("[href='/']").click()

      // following a link back to `/` should close the modal
      await check(() => browser.hasElementByCssSelector('#create-entry'), false)
      await check(() => browser.elementByCss('body').text(), /Current Data/)
    })

    it('should handle router.refresh() when called in a slot', async () => {
      const browser = await next.browser('/')
      await check(
        () => browser.hasElementByCssSelector('#refresh-router'),
        false
      )
      const currentRandomNumber = (
        await browser.elementById('random-number')
      ).text()
      await browser.elementByCss("[href='/refresh-modal']").click()
      await check(
        () => browser.hasElementByCssSelector('#refresh-router'),
        true
      )
      await browser.elementById('refresh-router').click()

      await check(async () => {
        const randomNumber = (await browser.elementById('random-number')).text()
        return randomNumber !== currentRandomNumber
      }, true)

      await browser.elementByCss("[href='/']").click()

      // following a link back to `/` should close the modal
      await check(() => browser.hasElementByCssSelector('#create-entry'), false)
      await check(() => browser.elementByCss('body').text(), /Current Data/)
    })

    it('should handle a redirect action when called in a slot', async () => {
      const browser = await next.browser('/')
      await check(() => browser.hasElementByCssSelector('#redirect'), false)
      await browser.elementByCss("[href='/redirect-modal']").click()
      await check(() => browser.hasElementByCssSelector('#redirect'), true)
      await browser.elementById('redirect').click()

      await check(() => browser.hasElementByCssSelector('#redirect'), false)
      await check(() => browser.elementByCss('body').text(), /Current Data/)
    })
  }
)
