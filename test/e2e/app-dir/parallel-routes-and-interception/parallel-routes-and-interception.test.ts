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

      it('should throw a 404 when no matching parallel route is found', async () => {
        const browser = await next.browser('/parallel-tab-bar')
        // we make sure the page is available through navigating
        await check(
          () => browser.waitForElementByCss('#home').text(),
          'Tab bar page (@children)'
        )
        await browser.elementByCss('#view-duration-link').click()
        await check(
          () => browser.waitForElementByCss('#view-duration').text(),
          'View duration'
        )

        // fetch /parallel-tab-bar/view-duration
        const res = await next.fetch(
          `${next.url}/parallel-tab-bar/view-duration`
        )
        const html = await res.text()
        expect(html).toContain('page could not be found')
      })

      it('should render nested parallel routes', async () => {
        const browser = await next.browser('/parallel-side-bar/nested/deeper')
        await check(
          () => browser.waitForElementByCss('#nested-deeper-main').text(),
          'Nested deeper page'
        )

        await check(
          () => browser.waitForElementByCss('#nested-deeper-sidebar').text(),
          'Nested deeper sidebar here'
        )

        await browser.elementByCss('[href="/parallel-side-bar/nested"]').click()

        await check(
          () => browser.waitForElementByCss('#nested-main').text(),
          'Nested page'
        )

        await check(
          () => browser.waitForElementByCss('#nested-sidebar').text(),
          'Nested sidebar here'
        )

        await browser.elementByCss('[href="/parallel-side-bar"]').click()

        await check(
          () => browser.waitForElementByCss('#main').text(),
          'homepage'
        )

        await check(
          () => browser.waitForElementByCss('#sidebar-main').text(),
          'root sidebar here'
        )
      })

      it('should only scroll to the parallel route that was navigated to', async () => {
        const browser = await next.browser('/parallel-scroll')

        await browser.eval('window.scrollTo(0, 1000)')
        const position = await browser.eval('window.scrollY')
        console.log('position', position)
        await browser.elementByCss('[href="/parallel-scroll/nav"]').click()
        await browser.waitForElementByCss('#modal')
        // check that we didn't scroll back to the top
        await check(() => browser.eval('window.scrollY'), position)
      })

      it('should apply the catch-all route to the parallel route if no matching route is found', async () => {
        const browser = await next.browser('/parallel-catchall')

        await browser.elementByCss('[href="/parallel-catchall/bar"]').click()
        await check(
          () => browser.waitForElementByCss('#main').text(),
          'main catchall'
        )
        await check(
          () => browser.waitForElementByCss('#slot-content').text(),
          'slot catchall'
        )

        await browser.elementByCss('[href="/parallel-catchall/foo"]').click()
        await check(() => browser.waitForElementByCss('#main').text(), 'foo')
        await check(
          () => browser.waitForElementByCss('#slot-content').text(),
          'foo slot'
        )

        await browser.elementByCss('[href="/parallel-catchall/bar"]').click()
        await check(
          () => browser.waitForElementByCss('#main').text(),
          'main catchall'
        )
        await check(
          () => browser.waitForElementByCss('#slot-content').text(),
          'slot catchall'
        )
      })

      it('should navigate with a link with prefetch=false', async () => {
        const browser = await next.browser('/parallel-prefetch-false')

        // check if the default view loads
        await check(
          () => browser.waitForElementByCss('#default-parallel').text(),
          'default view for parallel'
        )

        // check that navigating to /foo re-renders the layout to display @parallel/foo
        await check(
          () =>
            browser
              .elementByCss('[href="/parallel-prefetch-false/foo"]')
              .click()
              .waitForElementByCss('#parallel-foo')
              .text(),
          'parallel for foo'
        )
      })

      it('should display all parallel route params with useParams', async () => {
        const browser = await next.browser('/parallel-dynamic/foo/bar')

        await check(
          () => browser.waitForElementByCss('#foo').text(),
          `{"slug":"foo","id":"bar"}`
        )

        await check(
          () => browser.waitForElementByCss('#bar').text(),
          `{"slug":"foo","id":"bar"}`
        )
      })
    })

    describe('route intercepting', () => {
      it('should render intercepted route', async () => {
        const browser = await next.browser('/intercepting-routes/feed')

        // Check if navigation to modal route works.
        await check(
          () =>
            browser
              .elementByCss('[href="/intercepting-routes/feed/photos/1"]')
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
          next.url + '/intercepting-routes/feed/photos/1'
        )

        // Trigger a refresh, this should load the normal page, not the modal.
        await check(
          () => browser.refresh().waitForElementByCss('#photo-page-1').text(),
          'Photo PAGE 1'
        )

        // Check if the url matches still.
        await check(
          () => browser.url(),
          next.url + '/intercepting-routes/feed/photos/1'
        )
      })

      it('should render an intercepted route from a slot', async () => {
        const browser = await next.browser('/')

        await check(
          () => browser.waitForElementByCss('#default-slot').text(),
          'default from @slot'
        )

        await check(
          () =>
            browser
              .elementByCss('[href="/nested"]')
              .click()
              .waitForElementByCss('#interception-slot')
              .text(),
          'interception from @slot/nested'
        )

        await check(
          () => browser.refresh().waitForElementByCss('#nested').text(),
          'hello world from /nested'
        )
      })

      it('should render an intercepted route at the top level from a nested path', async () => {
        const browser = await next.browser('/nested-link')

        await check(
          () => browser.waitForElementByCss('#default-slot').text(),
          'default from @slot'
        )

        await check(
          () =>
            browser
              .elementByCss('[href="/nested"]')
              .click()
              .waitForElementByCss('#interception-slot')
              .text(),
          'interception from @slot/nested'
        )

        await check(
          () => browser.refresh().waitForElementByCss('#nested').text(),
          'hello world from /nested'
        )
      })

      it('should render intercepted route from a nested route', async () => {
        const browser = await next.browser('/intercepting-routes/feed/nested')

        // Check if navigation to modal route works.
        await check(
          () =>
            browser
              .elementByCss('[href="/intercepting-routes/feed/photos/1"]')
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
          next.url + '/intercepting-routes/feed/photos/1'
        )

        // Trigger a refresh, this should load the normal page, not the modal.
        await check(
          () => browser.refresh().waitForElementByCss('#photo-page-1').text(),
          'Photo PAGE 1'
        )

        // Check if the url matches still.
        await check(
          () => browser.url(),
          next.url + '/intercepting-routes/feed/photos/1'
        )
      })

      it('should re-render the layout on the server when it had a default child route', async () => {
        const browser = await next.browser('/parallel-non-intercepting')

        // check if the default view loads
        await check(
          () => browser.waitForElementByCss('#default-parallel').text(),
          'default view for parallel'
        )

        // check that navigating to /foo re-renders the layout to display @parallel/foo
        await check(
          () =>
            browser
              .elementByCss('[href="/parallel-non-intercepting/foo"]')
              .click()
              .waitForElementByCss('#parallel-foo')
              .text(),
          'parallel for foo'
        )

        // check that navigating to /foo also re-renders the base children
        await check(() => browser.elementByCss('#children-foo').text(), 'foo')
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

        await check(
          () =>
            browser
              .elementByCss('[href="/intercepting-parallel-modal/photo/2"]')
              .click()
              .waitForElementByCss('#photo-modal-2')
              .text(),
          'Photo MODAL 2'
        )

        // Check if modal was rendered while existing page content is preserved.
        await check(
          () => browser.elementByCss('#user-page').text(),
          'Feed for vercel'
        )

        // Check if url matches even though it was intercepted.
        await check(
          () => browser.url(),
          next.url + '/intercepting-parallel-modal/photo/2'
        )

        // Trigger a refresh, this should load the normal page, not the modal.
        await check(
          () => browser.refresh().waitForElementByCss('#photo-page-2').text(),
          'Photo PAGE 2'
        )

        // Check if the url matches still.
        await check(
          () => browser.url(),
          next.url + '/intercepting-parallel-modal/photo/2'
        )
      })

      it('should support intercepting with beforeFiles rewrites', async () => {
        const browser = await next.browser('/foo')

        await check(
          () =>
            browser
              .elementByCss('[href="/photos"]')
              .click()
              .waitForElementByCss('#intercepted')
              .text(),
          'intercepted'
        )
      })
    })
  }
)
