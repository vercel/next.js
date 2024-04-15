import { createNextDescribe } from 'e2e-utils'
import { check, retry } from 'next-test-utils'
import { outdent } from 'outdent'

createNextDescribe(
  'parallel-routes-and-interception',
  {
    files: __dirname,
  },
  ({ next, isNextDev, isNextStart }) => {
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
        const $ = await next.render$('/parallel/nested')
        const pageText = $('#parallel-layout').text()
        expect(pageText).toContain('parallel/layout')
        expect(pageText).toContain('parallel/@foo/nested/layout')
        expect(pageText).toContain('parallel/@foo/nested/@a/page')
        expect(pageText).toContain('parallel/@foo/nested/@b/page')
        expect(pageText).toContain('parallel/@bar/nested/layout')
        expect(pageText).toContain('parallel/@bar/nested/@a/page')
        expect(pageText).toContain('parallel/@bar/nested/@b/page')
        expect(pageText).toContain('parallel/nested/page')
      })

      it('should match parallel routes in route groups', async () => {
        const $ = await next.render$('/parallel/nested-2')
        const pageText = $('#parallel-layout').text()
        expect(pageText).toContain('parallel/layout')
        expect(pageText).toContain('parallel/(new)/layout')
        expect(pageText).toContain('parallel/(new)/@baz/nested/page')
      })

      it('should gracefully handle when two page segments match the `children` parallel slot', async () => {
        await next.stop()
        await next.patchFile(
          'app/parallel/nested-2/page.js',
          outdent`
              export default function Page() {
                return 'hello world'
              }
            `
        )

        await next.start()

        const html = await next.render('/parallel/nested-2')

        // before adding this file, the page would have matched `/app/parallel/(new)/@baz/nested-2/page`
        // but we've added a more specific page, so it should match that instead
        if (process.env.TURBOPACK) {
          // TODO: this matches differently in Turbopack because the Webpack loader does some sorting on the paths
          // Investigate the discrepancy in a follow-up. For now, since no errors are being thrown (and since this test was previously ignored in Turbopack),
          // we'll just verify that the page is rendered and some content was matched.
          expect(html).toContain('parallel/(new)/@baz/nested/page')
        } else {
          expect(html).toContain('hello world')
        }

        await next.stop()
        await next.deleteFile('app/parallel/nested-2/page.js')
        await next.start()
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

      it('should support layout files in parallel routes', async () => {
        const browser = await next.browser('/parallel-layout')
        await check(
          () => browser.waitForElementByCss('#parallel-layout').text(),
          'parallel layout'
        )

        // navigate to /parallel-layout/subroute
        await browser.elementByCss('[href="/parallel-layout/subroute"]').click()
        await check(
          () => browser.waitForElementByCss('#parallel-layout').text(),
          'parallel layout'
        )
        await check(
          () => browser.waitForElementByCss('#parallel-subroute').text(),
          'parallel subroute layout'
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
          'bar slot'
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

        await browser.elementByCss('[href="/parallel-catchall/baz"]').click()
        await check(
          () => browser.waitForElementByCss('#main').text(),
          /main catchall/
        )
        await check(
          () => browser.waitForElementByCss('#main').text(),
          /catchall page client component/
        )
        await check(
          () => browser.waitForElementByCss('#slot-content').text(),
          'baz slot'
        )
      })

      it('should match the catch-all routes of the more specific path, if there is more than one catch-all route', async () => {
        const browser = await next.browser('/parallel-nested-catchall')

        await browser
          .elementByCss('[href="/parallel-nested-catchall/foo"]')
          .click()
        await check(() => browser.waitForElementByCss('#main').text(), 'foo')
        await check(
          () => browser.waitForElementByCss('#slot-content').text(),
          'foo slot'
        )

        await browser
          .elementByCss('[href="/parallel-nested-catchall/bar"]')
          .click()
        await check(() => browser.waitForElementByCss('#main').text(), 'bar')
        await check(
          () => browser.waitForElementByCss('#slot-content').text(),
          'slot catchall'
        )

        await browser
          .elementByCss('[href="/parallel-nested-catchall/foo/123"]')
          .click()
        await check(() => browser.waitForElementByCss('#main').text(), 'foo id')
        await check(
          () => browser.waitForElementByCss('#slot-content').text(),
          'foo id catchAll'
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

      it('should load CSS for a default page that exports another page', async () => {
        const browser = await next.browser('/default-css')

        expect(
          await browser.eval(
            `window.getComputedStyle(document.getElementById("red-text")).color`
          )
        ).toBe('rgb(255, 0, 0)')

        // the more page will now be using the page's `default.tsx` file, which re-exports the root page.
        await browser.elementByCss('[href="/default-css/more"]').click()

        expect(
          await browser.eval(
            `window.getComputedStyle(document.getElementById("red-text")).color`
          )
        ).toBe('rgb(255, 0, 0)')

        // ensure that everything still works on a fresh load
        await browser.refresh()

        expect(
          await browser.eval(
            `window.getComputedStyle(document.getElementById("red-text")).color`
          )
        ).toBe('rgb(255, 0, 0)')
      })

      it('should handle a loading state', async () => {
        const browser = await next.browser('/with-loading')
        expect(await browser.elementById('slot').text()).toBe('Root Slot')
        expect(await browser.elementById('children').text()).toBe('Root Page')

        // should have triggered a loading state
        expect(
          await browser
            .elementByCss('[href="/with-loading/foo"]')
            .click()
            .waitForElementByCss('#loading-page')
            .text()
        ).toBe('Loading...')

        // should eventually load the full page
        await retry(async () => {
          expect(await browser.elementById('slot').text()).toBe('Nested Slot')
          expect(await browser.elementById('children').text()).toBe(
            'Welcome to Foo Page'
          )
        })
      })

      if (isNextDev) {
        it('should support parallel routes with no page component', async () => {
          const browser = await next.browser('/parallel-no-page/foo')
          const timestamp = await browser.elementByCss('#timestamp').text()

          await new Promise((resolve) => {
            setTimeout(resolve, 3000)
          })

          await check(async () => {
            // an invalid response triggers a fast refresh, so if the timestamp doesn't update, this behaved correctly
            const newTimestamp = await browser.elementByCss('#timestamp').text()
            return newTimestamp !== timestamp ? 'failure' : 'success'
          }, 'success')
        })

        it('should support nested parallel routes', async () => {
          const browser = await next.browser('parallel-nested/home/nested')
          const timestamp = await browser.elementByCss('#timestamp').text()

          await new Promise((resolve) => {
            setTimeout(resolve, 3000)
          })

          await check(async () => {
            // an invalid response triggers a fast refresh, so if the timestamp doesn't update, this behaved correctly
            const newTimestamp = await browser.elementByCss('#timestamp').text()
            return newTimestamp !== timestamp ? 'failure' : 'success'
          }, 'success')
        })
      }
    })

    describe('route intercepting with dynamic routes', () => {
      it('should render intercepted route', async () => {
        const browser = await next.browser(
          '/intercepting-routes-dynamic/photos'
        )

        // Check if navigation to modal route works
        await check(
          () =>
            browser
              .elementByCss(
                '[href="/intercepting-routes-dynamic/photos/next/123"]'
              )
              .click()
              .waitForElementByCss('#user-intercept-page')
              .text(),
          'Intercepted Page'
        )

        // Check if url matches even though it was intercepted.
        await check(
          () => browser.url(),
          next.url + '/intercepting-routes-dynamic/photos/next/123'
        )

        // Trigger a refresh, this should load the normal page, not the modal.
        await check(
          () =>
            browser.refresh().waitForElementByCss('#user-regular-page').text(),
          'Regular Page'
        )

        // Check if the url matches still.
        await check(
          () => browser.url(),
          next.url + '/intercepting-routes-dynamic/photos/next/123'
        )
      })
    })

    describe('route intercepting with dynamic optional catch-all routes', () => {
      it('should render intercepted route', async () => {
        const browser = await next.browser(
          '/intercepting-routes-dynamic-catchall/photos'
        )

        // Check if navigation to modal route works
        await check(
          () =>
            browser
              .elementByCss(
                '[href="/intercepting-routes-dynamic-catchall/photos/optional-catchall/123"]'
              )
              .click()
              .waitForElementByCss('#optional-catchall-intercept-page')
              .text(),
          'Intercepted Page'
        )

        // Check if url matches even though it was intercepted.
        await check(
          () => browser.url(),
          next.url +
            '/intercepting-routes-dynamic-catchall/photos/optional-catchall/123'
        )

        // Trigger a refresh, this should load the normal page, not the modal.
        await check(
          () =>
            browser
              .refresh()
              .waitForElementByCss('#optional-catchall-regular-page')
              .text(),
          'Regular Page'
        )

        // Check if the url matches still.
        await check(
          () => browser.url(),
          next.url +
            '/intercepting-routes-dynamic-catchall/photos/optional-catchall/123'
        )
      })
    })

    describe('route intercepting with dynamic catch-all routes', () => {
      it('should render intercepted route', async () => {
        const browser = await next.browser(
          '/intercepting-routes-dynamic-catchall/photos'
        )

        // Check if navigation to modal route works
        await check(
          () =>
            browser
              .elementByCss(
                '[href="/intercepting-routes-dynamic-catchall/photos/catchall/123"]'
              )
              .click()
              .waitForElementByCss('#catchall-intercept-page')
              .text(),
          'Intercepted Page'
        )

        // Check if url matches even though it was intercepted.
        await check(
          () => browser.url(),
          next.url + '/intercepting-routes-dynamic-catchall/photos/catchall/123'
        )

        // Trigger a refresh, this should load the normal page, not the modal.
        await check(
          () =>
            browser
              .refresh()
              .waitForElementByCss('#catchall-regular-page')
              .text(),
          'Regular Page'
        )

        // Check if the url matches still.
        await check(
          () => browser.url(),
          next.url + '/intercepting-routes-dynamic-catchall/photos/catchall/123'
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

        // Check if the client component is rendered
        await check(
          () => browser.waitForElementByCss('#interception-slot-client').text(),
          'client component'
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

      it('should support intercepting local dynamic sibling routes', async () => {
        const browser = await next.browser('/intercepting-siblings')

        await check(
          () =>
            browser
              .elementByCss('[href="/intercepting-siblings/1"]')
              .click()
              .waitForElementByCss('#intercepted-sibling')
              .text(),
          '1'
        )
        await check(
          () =>
            browser
              .elementByCss('[href="/intercepting-siblings/2"]')
              .click()
              .waitForElementByCss('#intercepted-sibling')
              .text(),
          '2'
        )
        await check(
          () =>
            browser
              .elementByCss('[href="/intercepting-siblings/3"]')
              .click()
              .waitForElementByCss('#intercepted-sibling')
              .text(),
          '3'
        )

        await next.browser('/intercepting-siblings/1')

        await check(() => browser.waitForElementByCss('#main-slot').text(), '1')
      })

      if (isNextStart) {
        it('should not have /default paths in the prerender manifest', async () => {
          const prerenderManifest = JSON.parse(
            await next.readFile('.next/prerender-manifest.json')
          )

          const routes = Object.keys(prerenderManifest.routes)

          for (const route of routes) {
            expect(route.endsWith('/default')).toBe(false)
          }
        })
      }
    })
  }
)
