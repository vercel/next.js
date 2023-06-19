import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

createNextDescribe(
  'root-level-route-interception',
  {
    files: __dirname,
  },
  ({ next }) => {
    describe('route intercepting', () => {
      it('should render intercepted route', async () => {
        const browser = await next.browser('/feed')

        // Check if navigation to modal route works.
        await check(
          () =>
            browser
              .elementByCss('[href="/feed/photos/1"]')
              .click()
              .waitForElementByCss('#photo-intercepted-1')
              .text(),
          'Photo INTERCEPTED 1'
        )

        // Check if url matches even though it was intercepted.
        await check(() => browser.url(), next.url + '/feed/photos/1')

        // Trigger a refresh, this should load the normal page, not the modal.
        await check(
          () => browser.refresh().waitForElementByCss('#photo-page-1').text(),
          'Photo PAGE 1'
        )

        // Check if the url matches still.
        await check(() => browser.url(), next.url + '/feed/photos/1')
      })

      it('should render intercepted route when navigated to from the root', async () => {
        const browser = await next.browser('/')

        // Check if navigation to modal route works.
        await check(
          () =>
            browser
              .elementByCss('[href="/feed/photos/1"]')
              .click()
              .waitForElementByCss('#photo-intercepted-1')
              .text(),
          'Photo INTERCEPTED 1'
        )

        // Check if url matches even though it was intercepted.
        await check(() => browser.url(), next.url + '/feed/photos/1')

        // Trigger a refresh, this should load the normal page, not the modal.
        await check(
          () => browser.refresh().waitForElementByCss('#photo-page-1').text(),
          'Photo PAGE 1'
        )

        // Check if the url matches still.
        await check(() => browser.url(), next.url + '/feed/photos/1')
      })
    })

    describe('route intercepting with dynamic routes', () => {
      it('should render intercepted route', async () => {
        const browser = await next.browser('/photos')

        // Check if navigation to modal route works
        await check(
          () =>
            browser
              .elementByCss('[href="/photos/next/123"]')
              .click()
              .waitForElementByCss('#user-intercept-page')
              .text(),
          'Intercepted Page'
        )

        // Check if url matches even though it was intercepted.
        await check(() => browser.url(), next.url + '/photos/next/123')

        // Trigger a refresh, this should load the normal page, not the modal.
        await check(
          () =>
            browser.refresh().waitForElementByCss('#user-regular-page').text(),
          'Regular Page'
        )

        // Check if the url matches still.
        await check(() => browser.url(), next.url + '/photos/next/123')
      })

      it('should render intercepted route when navigated to from the root', async () => {
        const browser = await next.browser('/')

        // Check if navigation to modal route works
        await check(
          () =>
            browser
              .elementByCss('[href="/photos/next/1"]')
              .click()
              .waitForElementByCss('#user-intercept-page')
              .text(),
          'Intercepted Page'
        )
        // Check if url matches even though it was intercepted.
        await check(() => browser.url(), next.url + '/photos/next/1')

        // Trigger a refresh, this should load the normal page, not the modal.
        await check(
          () =>
            browser.refresh().waitForElementByCss('#user-regular-page').text(),
          'Regular Page'
        )

        // Check if the url matches still.
        await check(() => browser.url(), next.url + '/photos/next/1')
      })
    })
  }
)
