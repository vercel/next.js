import { createNextDescribe } from 'e2e-utils'

// TODO-APP: remove when parallel routes and interception are implemented
const skipped = true

if (skipped) {
  it.skip('skips parallel routes and interception as it is not implemented yet', () => {})
} else {
  createNextDescribe(
    'parallel-routes-and-interception',
    {
      files: __dirname,
    },
    ({ next, isNextDeploy }) => {
      describe('parallel routes', () => {
        if (!isNextDeploy) {
          it('should match parallel routes', async () => {
            const html = await next.render('/parallel/nested')
            expect(html).toContain('parallel/layout')
            expect(html).toContain('parallel/@foo/nested/layout')
            expect(html).toContain('parallel/@foo/nested/@a/page')
            expect(html).toContain('parallel/@foo/nested/@b/page')
            expect(html).toContain('parallel/@bar/nested/layout')
            expect(html).toContain('parallel/@bar/nested/@a/page')
            expect(html).toContain('parallel/@bar/nested/@b/page')
            expect(html).toContain('parallel/nested/page')
          })
        }

        it('should match parallel routes in route groups', async () => {
          const html = await next.render('/parallel/nested-2')
          expect(html).toContain('parallel/layout')
          expect(html).toContain('parallel/(new)/layout')
          expect(html).toContain('parallel/(new)/@baz/nested/page')
        })

        it('should support parallel route tab bars', async () => {
          const browser = await next.browser('/parallel-tab-bar')

          const hasHome = async () => {
            const text = await browser.waitForElementByCss('#home').text()
            expect(text).toBe('Tab bar page (@children)')
          }
          const hasViewsHome = async () => {
            const text = await browser.waitForElementByCss('#views-home').text()
            expect(text).toBe('Views home')
          }
          const hasViewDuration = async () => {
            const text = await browser
              .waitForElementByCss('#view-duration')
              .text()
            expect(text).toBe('View duration')
          }
          const hasImpressions = async () => {
            const text = await browser
              .waitForElementByCss('#impressions')
              .text()
            expect(text).toBe('Impressions')
          }
          const hasAudienceHome = async () => {
            const text = await browser
              .waitForElementByCss('#audience-home')
              .text()
            expect(text).toBe('Audience home')
          }
          const hasDemographics = async () => {
            const text = await browser
              .waitForElementByCss('#demographics')
              .text()
            expect(text).toBe('Demographics')
          }
          const hasSubscribers = async () => {
            const text = await browser
              .waitForElementByCss('#subscribers')
              .text()
            expect(text).toBe('Subscribers')
          }
          const checkUrlPath = async (path: string) => {
            expect(await browser.url()).toBe(
              `${next.url}/parallel-tab-bar${path}`
            )
          }

          // Initial page
          const step1 = async () => {
            await hasHome()
            await hasViewsHome()
            await hasAudienceHome()
            await checkUrlPath('')
          }

          await step1()

          // Navigate to /views/duration
          await browser.elementByCss('#view-duration-link').click()

          const step2 = async () => {
            await hasHome()
            await hasViewDuration()
            await hasAudienceHome()
            await checkUrlPath('/view-duration')
          }

          await step2()

          // Navigate to /views/impressions
          await browser.elementByCss('#impressions-link').click()

          const step3 = async () => {
            await hasHome()
            await hasImpressions()
            await hasAudienceHome()
            await checkUrlPath('/impressions')
          }

          await step3()

          // Navigate to /audience/demographics
          await browser.elementByCss('#demographics-link').click()

          const step4 = async () => {
            await hasHome()
            await hasImpressions()
            await hasDemographics()
            await checkUrlPath('/demographics')
          }

          await step4()

          // Navigate to /audience/subscribers
          await browser.elementByCss('#subscribers-link').click()

          const step5 = async () => {
            await hasHome()
            await hasImpressions()
            await hasSubscribers()
            await checkUrlPath('/subscribers')
          }

          await step5()

          // Navigate to /
          await browser.elementByCss('#home-link-audience').click()

          // TODO: home link behavior
          await step1()

          // Test that back navigation works as intended
          await browser.back()
          await step5()
          await browser.back()
          await step4()
          await browser.back()
          await step3()
          await browser.back()
          await step2()
          await browser.back()
          await step1()

          // Test that forward navigation works as intended
          await browser.forward()
          await step2()
          await browser.forward()
          await step3()
          await browser.forward()
          await step4()
          await browser.forward()
          await step5()
        })
      })

      describe('route intercepting', () => {
        it('should render intercepted route', async () => {
          const browser = await next.browser('/intercepting-routes/feed')

          // Check if navigation to modal route works.
          expect(
            await browser
              .elementByCss('[href="/intercepting-routes/photos/1"]')
              .click()
              .waitForElementByCss('#photo-intercepted-1')
              .text()
          ).toBe('Photo INTERCEPTED 1')

          // Check if intercepted route was rendered while existing page content was removed.
          // Content would only be preserved when combined with parallel routes.
          expect(await browser.elementByCss('#feed-page').text()).not.toBe(
            'Feed'
          )

          // Check if url matches even though it was intercepted.
          expect(await browser.url()).toBe(
            next.url + '/intercepting-routes/photos/1'
          )

          // Trigger a refresh, this should load the normal page, not the modal.
          expect(
            await browser.refresh().waitForElementByCss('#photo-page-1').text()
          ).toBe('Photo PAGE 1')

          // Check if the url matches still.
          expect(await browser.url()).toBe(
            next.url + '/intercepting-routes/photos/1'
          )
        })

        it('should render modal when paired with parallel routes', async () => {
          const browser = await next.browser(
            '/intercepting-parallel-modal/vercel'
          )
          // Check if navigation to modal route works.
          expect(
            await browser
              .elementByCss('[href="/intercepting-parallel-modal/photos/1"]')
              .click()
              .waitForElementByCss('#photo-modal-1')
              .text()
          ).toBe('Photo MODAL 1')

          // Check if modal was rendered while existing page content is preserved.
          expect(await browser.elementByCss('#user-page').text()).toBe(
            'Feed for vercel'
          )

          // Check if url matches even though it was intercepted.
          expect(await browser.url()).toBe(
            next.url + '/intercepting-parallel-modal/photos/1'
          )

          // Trigger a refresh, this should load the normal page, not the modal.
          expect(
            await browser.refresh().waitForElementByCss('#photo-page-1').text()
          ).toBe('Photo PAGE 1')

          // Check if the url matches still.
          expect(await browser.url()).toBe(
            next.url + '/intercepting-parallel-modal/photos/1'
          )
        })
      })
    }
  )
}
