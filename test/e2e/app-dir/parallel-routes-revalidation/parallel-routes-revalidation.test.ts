import { createNextDescribe } from 'e2e-utils'
import { check, retry } from 'next-test-utils'

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

    it.each([
      { path: '/detail-page' },
      { path: '/dynamic/foobar', param: 'foobar' },
      { path: '/catchall/foobar', param: 'foobar' },
    ])(
      'should not trigger interception when calling router.refresh() on an intercepted route ($path)',
      async (route) => {
        const browser = await next.browser(route.path)

        // directly loaded the detail page, so it should not be intercepted.
        expect(await browser.elementById('detail-title').text()).toBe(
          'Detail Page (Non-Intercepted)'
        )
        const randomNumber = (await browser.elementById('random-number')).text()

        // confirm that if the route contained a dynamic parameter, that it's reflected in the UI
        if (route.param) {
          expect(await browser.elementById('params').text()).toBe(route.param)
        }

        // click the refresh button
        await browser.elementByCss('button').click()

        await retry(async () => {
          const newRandomNumber = await browser
            .elementById('random-number')
            .text()

          // we should have received a new random number, indicating the non-intercepted page was refreshed
          expect(randomNumber).not.toBe(newRandomNumber)

          // confirm that the page is still not intercepted
          expect(await browser.elementById('detail-title').text()).toBe(
            'Detail Page (Non-Intercepted)'
          )

          // confirm the params (if previously present) are still present
          if (route.param) {
            expect(await browser.elementById('params').text()).toBe(route.param)
          }
        })
      }
    )

    it('should not trigger full page when calling router.refresh() on an intercepted route', async () => {
      const browser = await next.browser('/dynamic')
      await browser.elementByCss('a').click()

      // we soft-navigated to the route, so it should be intercepted
      expect(await browser.elementById('detail-title').text()).toBe(
        'Detail Page (Intercepted)'
      )
      const randomNumber = (await browser.elementById('random-number')).text()

      // confirm the dynamic param is reflected in the UI
      expect(await browser.elementById('params').text()).toBe('foobar')

      // click the refresh button
      await browser.elementByCss('button').click()

      await retry(async () => {
        // confirm that the intercepted page data was refreshed
        const newRandomNumber = await browser
          .elementById('random-number')
          .text()

        // confirm that the page is still intercepted
        expect(randomNumber).not.toBe(newRandomNumber)

        expect(await browser.elementById('detail-title').text()).toBe(
          'Detail Page (Intercepted)'
        )

        // confirm the paramsare still present
        expect(await browser.elementById('params').text()).toBe('foobar')
      })
    })

    describe('router.refresh', () => {
      it('should correctly refresh data for the intercepted route and previously active page slot', async () => {
        const browser = await next.browser('/refreshing')
        const initialRandomNumber = await browser.elementById('random-number')

        await browser.elementByCss("[href='/refreshing/login']").click()

        // interception modal should be visible
        const initialModalRandomNumber = await browser
          .elementById('modal-random')
          .text()

        // trigger a refresh
        await browser.elementById('refresh-button').click()

        await retry(async () => {
          const newRandomNumber = await browser
            .elementById('random-number')
            .text()
          const newModalRandomNumber = await browser
            .elementById('modal-random')
            .text()
          expect(initialRandomNumber).not.toBe(newRandomNumber)
          expect(initialModalRandomNumber).not.toBe(newModalRandomNumber)
        })

        // reload the page, triggering which will remove the interception route and show the full page
        await browser.refresh()

        const initialLoginPageRandomNumber = await browser
          .elementById('login-page-random')
          .text()

        // trigger a refresh
        await browser.elementById('refresh-button').click()

        await retry(async () => {
          const newLoginPageRandomNumber = await browser
            .elementById('login-page-random')
            .text()

          expect(newLoginPageRandomNumber).not.toBe(
            initialLoginPageRandomNumber
          )
        })
      })

      it('should correctly refresh data for previously intercepted modal and active page slot', async () => {
        const browser = await next.browser('/refreshing')

        await browser.elementByCss("[href='/refreshing/login']").click()

        // interception modal should be visible
        const initialModalRandomNumber = await browser
          .elementById('modal-random')
          .text()

        await browser.elementByCss("[href='/refreshing/other']").click()
        // data for the /other page should be visible

        const initialOtherPageRandomNumber = await browser
          .elementById('other-page-random')
          .text()

        // trigger a refresh
        await browser.elementById('refresh-button').click()

        await retry(async () => {
          const newModalRandomNumber = await browser
            .elementById('modal-random')
            .text()

          const newOtherPageRandomNumber = await browser
            .elementById('other-page-random')
            .text()
          expect(initialModalRandomNumber).not.toBe(newModalRandomNumber)
          expect(initialOtherPageRandomNumber).not.toBe(
            newOtherPageRandomNumber
          )
        })
      })
    })
  }
)
