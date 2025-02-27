import { nextTestSetup } from 'e2e-utils'
import { check, retry } from 'next-test-utils'

describe('parallel-routes-revalidation', () => {
  const { next, isNextDev, isNextStart, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  // This test is skipped when deployed as it relies on a shared data store
  // For testing purposes we just use an in-memory object, but when deployed
  // this could hit a separate lambda instance that won't share the same reference
  if (!isNextDeploy) {
    it('should submit the action and revalidate the page data', async () => {
      const browser = await next.browser('/')
      await check(() => browser.hasElementByCssSelector('#create-entry'), false)

      // there shouldn't be any data yet
      expect((await browser.elementsByCss('#entries li')).length).toBe(0)

      await browser.elementByCss("[href='/revalidate-modal']").click()

      await check(() => browser.hasElementByCssSelector('#create-entry'), true)

      await browser.elementById('create-entry').click()

      // we created an entry and called revalidate, so we should have 1 entry
      await retry(async () => {
        expect((await browser.elementsByCss('#entries li')).length).toBe(1)
      })

      await browser.elementById('create-entry').click()

      // we created an entry and called revalidate, so we should have 2 entries
      await retry(async () => {
        expect((await browser.elementsByCss('#entries li')).length).toBe(2)
      })

      await browser.elementByCss("[href='/']").click()

      // following a link back to `/` should close the modal
      await check(() => browser.hasElementByCssSelector('#create-entry'), false)
      await check(() => browser.elementByCss('body').text(), /Current Data/)
    })
  }

  it('should handle router.refresh() when called in a slot', async () => {
    const browser = await next.browser('/')
    await check(() => browser.hasElementByCssSelector('#refresh-router'), false)
    const currentRandomNumber = (
      await browser.elementById('random-number')
    ).text()
    await browser.elementByCss("[href='/refresh-modal']").click()
    await check(() => browser.hasElementByCssSelector('#refresh-router'), true)
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
      const newRandomNumber = await browser.elementById('random-number').text()

      // confirm that the page is still intercepted
      expect(randomNumber).not.toBe(newRandomNumber)

      expect(await browser.elementById('detail-title').text()).toBe(
        'Detail Page (Intercepted)'
      )

      // confirm the paramsare still present
      expect(await browser.elementById('params').text()).toBe('foobar')
    })
  })

  it('should not trigger the intercepted route when lazy-fetching missing data', async () => {
    const browser = await next.browser('/')

    // trigger the interception page
    await browser.elementByCss("[href='/detail-page']").click()

    // we should see the intercepted page
    expect(await browser.elementById('detail-title').text()).toBe(
      'Detail Page (Intercepted)'
    )

    // refresh the page
    await browser.refresh()

    // we should see the detail page
    expect(await browser.elementById('detail-title').text()).toBe(
      'Detail Page (Non-Intercepted)'
    )

    // go back to the previous page
    await browser.back()

    // reload the page, which will cause the router to no longer have cache nodes
    await browser.refresh()

    // go forward, this will trigger a lazy fetch for the missing data, and should restore the detail page
    await browser.forward()

    expect(await browser.elementById('detail-title').text()).toBe(
      'Detail Page (Non-Intercepted)'
    )
  })

  // This test is skipped when deployed as it relies on a shared data store
  // For testing purposes we just use an in-memory object, but when deployed
  // this could hit a separate lambda instance that won't share the same reference
  if (!isNextDeploy) {
    it('should refresh the correct page when a server action triggers a redirect', async () => {
      const browser = await next.browser('/redirect')
      await browser.elementByCss('button').click()

      await browser.elementByCss("[href='/revalidate-modal']").click()

      await check(() => browser.hasElementByCssSelector('#create-entry'), true)

      await browser.elementById('clear-entries').click()

      await retry(async () => {
        // confirm there aren't any entries yet
        expect((await browser.elementsByCss('#entries li')).length).toBe(0)
      })

      await browser.elementById('create-entry').click()

      await retry(async () => {
        // we created an entry and called revalidate, so we should have 1 entry
        expect((await browser.elementsByCss('#entries li')).length).toBe(1)
      })
    })
  }

  describe.each([
    { basePath: '/refreshing', label: 'regular', withSearchParams: false },
    { basePath: '/refreshing', label: 'regular', withSearchParams: true },
    {
      basePath: '/dynamic-refresh/foo',
      label: 'dynamic',
      withSearchParams: false,
    },
    {
      basePath: '/dynamic-refresh/foo',
      label: 'dynamic',
      withSearchParams: true,
    },
  ])(
    'router.refresh ($label) - searchParams: $withSearchParams',
    ({ basePath, withSearchParams }) => {
      it('should correctly refresh data for the intercepted route and previously active page slot', async () => {
        const browser = await next.browser(basePath)
        let initialSearchParams: string | undefined

        if (withSearchParams) {
          // add some search params prior to proceeding
          await browser.elementById('update-search-params').click()

          await retry(async () => {
            initialSearchParams = await browser
              .elementById('search-params')
              .text()
            expect(initialSearchParams).toMatch(/^Params: "0\.\d+"$/)
          })
        }

        let initialRandomNumber = await browser.elementById('random-number')
        await browser.elementByCss(`[href='${basePath}/login']`).click()

        // interception modal should be visible
        let initialModalRandomNumber = await browser
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

          // reset the initial values to be the new values, so that we can verify the revalidate case below.
          initialRandomNumber = newRandomNumber
          initialModalRandomNumber = newModalRandomNumber
        })

        // trigger a revalidate
        await browser.elementById('revalidate-button').click()

        await retry(async () => {
          const newRandomNumber = await browser
            .elementById('random-number')
            .text()
          const newModalRandomNumber = await browser
            .elementById('modal-random')
            .text()
          expect(initialRandomNumber).not.toBe(newRandomNumber)
          expect(initialModalRandomNumber).not.toBe(newModalRandomNumber)

          if (withSearchParams) {
            // add additional search params in the new modal
            await browser.elementById('update-search-params-modal').click()
            expect(
              await browser.elementById('search-params-modal').text()
            ).toMatch(/^Params: "0\.\d+"$/)

            // make sure the old params are still there too
            expect(await browser.elementById('search-params').text()).toBe(
              initialSearchParams
            )
          }
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
        const browser = await next.browser(basePath)

        await browser.elementByCss(`[href='${basePath}/login']`).click()

        // interception modal should be visible
        let initialModalRandomNumber = await browser
          .elementById('modal-random')
          .text()

        await browser.elementByCss(`[href='${basePath}/other']`).click()
        // data for the /other page should be visible

        let initialOtherPageRandomNumber = await browser
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
          // reset the initial values to be the new values, so that we can verify the revalidate case below.
          initialOtherPageRandomNumber = newOtherPageRandomNumber
          initialModalRandomNumber = newModalRandomNumber
        })

        // trigger a revalidate
        await browser.elementById('revalidate-button').click()

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
    }
  )

  describe('server action revalidation', () => {
    it('handles refreshing when multiple parallel slots are active', async () => {
      const browser = await next.browser('/nested-revalidate')

      const currentPageTime = await browser.elementById('page-now').text()

      expect(await browser.hasElementByCssSelector('#modal')).toBe(false)
      expect(await browser.hasElementByCssSelector('#drawer')).toBe(false)

      // renders the drawer parallel slot
      await browser.elementByCss("[href='/nested-revalidate/drawer']").click()
      await browser.waitForElementByCss('#drawer')

      // renders the modal slot
      await browser.elementByCss("[href='/nested-revalidate/modal']").click()
      await browser.waitForElementByCss('#modal')

      // Both should be visible, despite only one "matching"
      expect(await browser.hasElementByCssSelector('#modal')).toBe(true)
      expect(await browser.hasElementByCssSelector('#drawer')).toBe(true)

      // grab the current time of the drawer
      const currentDrawerTime = await browser.elementById('drawer-now').text()

      // trigger the revalidation action in the modal.
      await browser.elementById('modal-submit-button').click()

      await retry(async () => {
        // Revalidation should close the modal
        expect(await browser.hasElementByCssSelector('#modal')).toBe(false)

        // But the drawer should still be open
        expect(await browser.hasElementByCssSelector('#drawer')).toBe(true)

        // And the drawer should have a new time
        expect(await browser.elementById('drawer-now').text()).not.toEqual(
          currentDrawerTime
        )

        // And the underlying page should have a new time
        expect(await browser.elementById('page-now').text()).not.toEqual(
          currentPageTime
        )
      })
    })

    it('should not trigger a refresh for the page that is being redirected to', async () => {
      const rscRequests = []
      const prefetchRequests = []
      const browser = await next.browser('/redirect', {
        beforePageLoad(page) {
          page.on('request', async (req) => {
            const headers = await req.allHeaders()
            if (headers['rsc']) {
              const pathname = new URL(req.url()).pathname

              if (headers['next-router-prefetch']) {
                prefetchRequests.push(pathname)
              } else {
                rscRequests.push(pathname)
              }
            }
          })
        },
      })

      await browser.elementByCss('button').click()
      await browser.waitForElementByCss('#root-page')
      await browser.waitForIdleNetwork()

      await retry(async () => {
        if (!isNextDev) {
          expect(rscRequests.length).toBe(0)
        }

        if (isNextStart) {
          expect(prefetchRequests.length).toBe(4)
        }
      })
    })
  })
})
