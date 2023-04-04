import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

createNextDescribe(
  'parallel-routes-and-interception',
  {
    files: __dirname,
  },
  ({ next }) => {
    describe('parallel routes', () => {
      it('should support parallel route tab bars', async () => {
        const browser = await next.browser('/parallel-tab-bar')

        const hasHome = async () => {
          await check(
            () => browser.waitForElementByCss('#home').text(),
            'Tab bar page (@children)'
          )
        }
        const hasViewsHome = async () => {
          await check(
            () => browser.waitForElementByCss('#views-home').text(),
            'Views home'
          )
        }
        const hasViewDuration = async () => {
          await check(
            () => browser.waitForElementByCss('#view-duration').text(),
            'View duration'
          )
        }
        const hasImpressions = async () => {
          await check(
            () => browser.waitForElementByCss('#impressions').text(),
            'Impressions'
          )
        }
        const hasAudienceHome = async () => {
          await check(
            () => browser.waitForElementByCss('#audience-home').text(),
            'Audience home'
          )
        }
        const hasDemographics = async () => {
          await check(
            () => browser.waitForElementByCss('#demographics').text(),
            'Demographics'
          )
        }
        const hasSubscribers = async () => {
          await check(
            () => browser.waitForElementByCss('#subscribers').text(),
            'Subscribers'
          )
        }
        const checkUrlPath = async (path: string) => {
          await check(
            () => browser.url(),
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

        console.log('step1')
        // Navigate to /views/duration
        await browser.elementByCss('#view-duration-link').click()

        const step2 = async () => {
          await hasHome()
          await hasViewDuration()
          await hasAudienceHome()
          await checkUrlPath('/view-duration')
        }

        await step2()
        console.log('step2')

        // Navigate to /views/impressions
        await browser.elementByCss('#impressions-link').click()

        const step3 = async () => {
          await hasHome()
          await hasImpressions()
          await hasAudienceHome()
          await checkUrlPath('/impressions')
        }

        await step3()
        console.log('step3')

        // Navigate to /audience/demographics
        await browser.elementByCss('#demographics-link').click()

        const step4 = async () => {
          await hasHome()
          await hasImpressions()
          await hasDemographics()
          await checkUrlPath('/demographics')
        }

        await step4()
        console.log('step4')

        // Navigate to /audience/subscribers
        await browser.elementByCss('#subscribers-link').click()

        const step5 = async () => {
          await hasHome()
          await hasImpressions()
          await hasSubscribers()
          await checkUrlPath('/subscribers')
        }

        await step5()
        console.log('step5')

        // Navigate to /
        await browser.elementByCss('#home-link-audience').click()

        await checkUrlPath('')

        // TODO: home link behavior
        // await step1()

        // TODO: fix back/forward navigation test
        // Test that back navigation works as intended
        await browser.back()
        await step5()
        console.log('step5 back')
        await browser.back()
        await step4()
        console.log('step4 back')
        await browser.back()
        await step3()
        console.log('step3 back')

        await browser.back()
        await step2()
        console.log('step2 back')
        await browser.back()
        await step1()
        console.log('step1 back')
        console.log('step6')

        // Test that forward navigation works as intended
        await browser.forward()
        await step2()
        console.log('step2 forward')
        await browser.forward()
        await step3()
        console.log('step3 forward')
        await browser.forward()
        await step4()
        console.log('step4 forward')
        await browser.forward()
        await step5()
      })

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

      it('should match parallel routes in route groups', async () => {
        const html = await next.render('/parallel/nested-2')
        expect(html).toContain('parallel/layout')
        expect(html).toContain('parallel/(new)/layout')
        expect(html).toContain('parallel/(new)/@baz/nested/page')
      })
    })

    describe('route intercepting', () => {
      it('should render intercepted route', async () => {
        const browser = await next.browser('/intercepting-routes/feed')

        // Check if navigation to modal route works.
        await check(
          () =>
            browser
              .elementByCss('[href="/intercepting-routes/photos/1"]')
              .click()
              .waitForElementByCss('#photo-intercepted-1')
              .text(),
          'Photo INTERCEPTED 1'
        )

        // Check if intercepted route was rendered while existing page content was removed.
        // Content would only be preserved when combined with parallel routes.
        // await check(() => browser.elementByCss('#feed-page').text()).not.toBe('Feed')

        // Check if url matches even though it was intercepted.
        await check(
          () => browser.url(),
          next.url + '/intercepting-routes/photos/1'
        )

        // Trigger a refresh, this should load the normal page, not the modal.
        await check(
          () => browser.refresh().waitForElementByCss('#photo-page-1').text(),
          'Photo PAGE 1'
        )

        // Check if the url matches still.
        await check(
          () => browser.url(),
          next.url + '/intercepting-routes/photos/1'
        )
      })

      it('should render modal when paired with parallel routes', async () => {
        const browser = await next.browser(
          '/intercepting-parallel-modal/vercel'
        )
        // Check if navigation to modal route works.
        await check(
          () =>
            browser
              .elementByCss('[href="/intercepting-parallel-modal/photo/1"]')
              .click()
              .waitForElementByCss('#photo-modal-1')
              .text(),
          'Photo MODAL 1'
        )

        // Check if modal was rendered while existing page content is preserved.
        await check(
          () => browser.elementByCss('#user-page').text(),
          'Feed for vercel'
        )

        // Check if url matches even though it was intercepted.
        await check(
          () => browser.url(),
          next.url + '/intercepting-parallel-modal/photo/1'
        )

        // Trigger a refresh, this should load the normal page, not the modal.
        await check(
          () => browser.refresh().waitForElementByCss('#photo-page-1').text(),
          'Photo PAGE 1'
        )

        // Check if the url matches still.
        await check(
          () => browser.url(),
          next.url + '/intercepting-parallel-modal/photo/1'
        )
      })
    })
  }
)
