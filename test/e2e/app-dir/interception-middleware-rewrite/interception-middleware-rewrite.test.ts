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

    it('should continue to work after using browser back button and following another intercepting route', async () => {
      const browser = await next.browser('/')
      await check(() => browser.elementById('children').text(), 'root')

      await browser.elementByCss('[href="/photos/1"]').click()
      await check(
        () => browser.elementById('modal').text(),
        'Intercepted Photo ID: 1'
      )
      await browser.back()
      await browser.elementByCss('[href="/photos/2"]').click()
      await check(
        () => browser.elementById('modal').text(),
        'Intercepted Photo ID: 2'
      )
    })

    it('should continue to show the intercepted page when revisiting it', async () => {
      const browser = await next.browser('/')
      await check(() => browser.elementById('children').text(), 'root')

      await browser.elementByCss('[href="/photos/1"]').click()

      // we should be showing the modal and not the page
      await check(
        () => browser.elementById('modal').text(),
        'Intercepted Photo ID: 1'
      )

      await browser.refresh()

      // page should show after reloading the browser
      await check(
        () => browser.elementById('children').text(),
        'Page Photo ID: 1'
      )

      // modal should no longer be showing
      await check(() => browser.elementById('modal').text(), '')

      await browser.back()

      // revisit the same page that was intercepted
      await browser.elementByCss('[href="/photos/1"]').click()

      // ensure that we're still showing the modal and not the page
      await check(
        () => browser.elementById('modal').text(),
        'Intercepted Photo ID: 1'
      )

      // page content should not have changed
      await check(() => browser.elementById('children').text(), 'root')
    })
  }
)
