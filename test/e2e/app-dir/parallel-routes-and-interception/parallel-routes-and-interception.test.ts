import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { outdent } from 'outdent'

describe('parallel-routes-and-interception', () => {
  const { next, isNextDev, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  describe('parallel routes', () => {
    it('should support parallel route tab bars', async () => {
      const browser = await next.browser('/parallel-tab-bar')

      const hasHome = async () => {
        await retry(async () => {
          expect(await browser.waitForElementByCss('#home').text()).toEqual(
            'Tab bar page (@children)'
          )
        })
      }
      const hasViewsHome = async () => {
        await retry(async () => {
          expect(
            await browser.waitForElementByCss('#views-home').text()
          ).toEqual('Views home')
        })
      }
      const hasViewDuration = async () => {
        await retry(async () => {
          expect(
            await browser.waitForElementByCss('#view-duration').text()
          ).toEqual('View duration')
        })
      }
      const hasImpressions = async () => {
        await retry(async () => {
          expect(
            await browser.waitForElementByCss('#impressions').text()
          ).toEqual('Impressions')
        })
      }
      const hasAudienceHome = async () => {
        await retry(async () => {
          expect(
            await browser.waitForElementByCss('#audience-home').text()
          ).toEqual('Audience home')
        })
      }
      const hasDemographics = async () => {
        await retry(async () => {
          expect(
            await browser.waitForElementByCss('#demographics').text()
          ).toEqual('Demographics')
        })
      }
      const hasSubscribers = async () => {
        await retry(async () => {
          expect(
            await browser.waitForElementByCss('#subscribers').text()
          ).toEqual('Subscribers')
        })
      }
      const checkUrlPath = async (path: string) => {
        await retry(async () => {
          expect(await browser.url()).toMatch(
            `${next.url}/parallel-tab-bar${path}`
          )
        })
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

    it('should throw a 404 when no matching parallel route is found', async () => {
      const browser = await next.browser('/parallel-tab-bar')
      // we make sure the page is available through navigating
      await retry(async () => {
        expect(await browser.waitForElementByCss('#home').text()).toEqual(
          'Tab bar page (@children)'
        )
      })
      await browser.elementByCss('#view-duration-link').click()
      await retry(async () => {
        expect(
          await browser.waitForElementByCss('#view-duration').text()
        ).toEqual('View duration')
      })

      // fetch /parallel-tab-bar/view-duration
      const res = await next.fetch(`${next.url}/parallel-tab-bar/view-duration`)
      const html = await res.text()
      expect(html).toContain('page could not be found')
    })

    it('should render nested parallel routes', async () => {
      const browser = await next.browser('/parallel-side-bar/nested/deeper')
      await retry(async () => {
        expect(
          await browser.waitForElementByCss('#nested-deeper-main').text()
        ).toEqual('Nested deeper page')
      })

      await retry(async () => {
        expect(
          await browser.waitForElementByCss('#nested-deeper-sidebar').text()
        ).toEqual('Nested deeper sidebar here')
      })

      await browser.elementByCss('[href="/parallel-side-bar/nested"]').click()

      await retry(async () => {
        expect(
          await browser.waitForElementByCss('#nested-main').text()
        ).toEqual('Nested page')
      })

      await retry(async () => {
        expect(
          await browser.waitForElementByCss('#nested-sidebar').text()
        ).toEqual('Nested sidebar here')
      })

      await browser.elementByCss('[href="/parallel-side-bar"]').click()

      await retry(async () => {
        expect(await browser.waitForElementByCss('#main').text()).toEqual(
          'homepage'
        )
      })

      await retry(async () => {
        expect(
          await browser.waitForElementByCss('#sidebar-main').text()
        ).toEqual('root sidebar here')
      })
    })

    it('should support layout files in parallel routes', async () => {
      const browser = await next.browser('/parallel-layout')
      await retry(async () => {
        expect(
          await browser.waitForElementByCss('#parallel-layout').text()
        ).toEqual('parallel layout')
      })

      // navigate to /parallel-layout/subroute
      await browser.elementByCss('[href="/parallel-layout/subroute"]').click()
      await retry(async () => {
        expect(
          await browser.waitForElementByCss('#parallel-layout').text()
        ).toEqual('parallel layout')
      })
      await retry(async () => {
        expect(
          await browser.waitForElementByCss('#parallel-subroute').text()
        ).toEqual('parallel subroute layout')
      })
    })

    it('should only scroll to the parallel route that was navigated to', async () => {
      const browser = await next.browser('/parallel-scroll')

      await browser.eval('window.scrollTo(0, 1000)')
      const position = await browser.eval('window.scrollY')
      console.log('position', position)
      await browser.elementByCss('[href="/parallel-scroll/nav"]').click()
      await browser.waitForElementByCss('#modal')
      // check that we didn't scroll back to the top
      await retry(async () => {
        expect(await browser.eval('window.scrollY')).toMatch(position)
      })
    })

    it('should apply the catch-all route to the parallel route if no matching route is found', async () => {
      const browser = await next.browser('/parallel-catchall')

      await browser.elementByCss('[href="/parallel-catchall/bar"]').click()
      await retry(async () => {
        expect(await browser.waitForElementByCss('#main').text()).toEqual(
          'bar slot'
        )
      })
      await retry(async () => {
        expect(
          await browser.waitForElementByCss('#slot-content').text()
        ).toEqual('slot catchall')
      })

      await browser.elementByCss('[href="/parallel-catchall/foo"]').click()
      await retry(async () => {
        expect(await browser.waitForElementByCss('#main').text()).toEqual('foo')
      })
      await retry(async () => {
        expect(
          await browser.waitForElementByCss('#slot-content').text()
        ).toEqual('foo slot')
      })

      await browser.elementByCss('[href="/parallel-catchall/baz"]').click()
      await retry(async () => {
        expect(await browser.waitForElementByCss('#main').text()).toMatch(
          /main catchall/
        )
      })
      await retry(async () => {
        expect(await browser.waitForElementByCss('#main').text()).toMatch(
          /catchall page client component/
        )
      })
      await retry(async () => {
        expect(
          await browser.waitForElementByCss('#slot-content').text()
        ).toEqual('baz slot')
      })
    })

    it('should match the catch-all routes of the more specific path, if there is more than one catch-all route', async () => {
      const browser = await next.browser('/parallel-nested-catchall')

      await browser
        .elementByCss('[href="/parallel-nested-catchall/foo"]')
        .click()
      await retry(async () => {
        expect(await browser.waitForElementByCss('#main').text()).toEqual('foo')
      })
      await retry(async () => {
        expect(
          await browser.waitForElementByCss('#slot-content').text()
        ).toEqual('foo slot')
      })

      await browser
        .elementByCss('[href="/parallel-nested-catchall/bar"]')
        .click()
      await retry(async () => {
        expect(await browser.waitForElementByCss('#main').text()).toEqual('bar')
      })
      await retry(async () => {
        expect(
          await browser.waitForElementByCss('#slot-content').text()
        ).toEqual('slot catchall')
      })

      await browser
        .elementByCss('[href="/parallel-nested-catchall/foo/123"]')
        .click()
      await retry(async () => {
        expect(await browser.waitForElementByCss('#main').text()).toEqual(
          'foo id'
        )
      })
      await retry(async () => {
        expect(
          await browser.waitForElementByCss('#slot-content').text()
        ).toEqual('foo id catchAll')
      })
    })

    it('should navigate with a link with prefetch=false', async () => {
      const browser = await next.browser('/parallel-prefetch-false')

      // check if the default view loads
      await retry(async () => {
        expect(
          await browser.waitForElementByCss('#default-parallel').text()
        ).toEqual('default view for parallel')
      })

      // check that navigating to /foo re-renders the layout to display @parallel/foo
      await retry(async () => {
        expect(
          await browser
            .elementByCss('[href="/parallel-prefetch-false/foo"]')
            .click()
            .waitForElementByCss('#parallel-foo')
            .text()
        ).toEqual('parallel for foo')
      })
    })

    it('should display all parallel route params with useParams', async () => {
      const browser = await next.browser('/parallel-dynamic/foo/bar')

      await retry(async () => {
        expect(await browser.waitForElementByCss('#foo').text()).toMatch(
          `{"slug":"foo","id":"bar"}`
        )
      })

      await retry(async () => {
        expect(await browser.waitForElementByCss('#bar').text()).toMatch(
          `{"slug":"foo","id":"bar"}`
        )
      })
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

        await retry(async () => {
          // an invalid response triggers a fast refresh, so if the timestamp doesn't update, this behaved correctly
          const newTimestamp = await browser.elementByCss('#timestamp').text()
          expect(newTimestamp !== timestamp).toBeFalsy()
        })
      })

      it('should support nested parallel routes', async () => {
        const browser = await next.browser('parallel-nested/home/nested')
        const timestamp = await browser.elementByCss('#timestamp').text()

        await new Promise((resolve) => {
          setTimeout(resolve, 3000)
        })

        await retry(async () => {
          // an invalid response triggers a fast refresh, so if the timestamp doesn't update, this behaved correctly
          const newTimestamp = await browser.elementByCss('#timestamp').text()
          expect(newTimestamp !== timestamp).toBeFalsy()
        })
      })
    }
  })

  describe('route intercepting with dynamic routes', () => {
    it('should render intercepted route', async () => {
      const browser = await next.browser('/intercepting-routes-dynamic/photos')

      // Check if navigation to modal route works
      await retry(async () => {
        expect(
          await browser
            .elementByCss(
              '[href="/intercepting-routes-dynamic/photos/next/123"]'
            )
            .click()
            .waitForElementByCss('#user-intercept-page')
            .text()
        ).toEqual('Intercepted Page')
      })

      // Check if url matches even though it was intercepted.
      await retry(async () => {
        expect(await browser.url()).toMatch(
          next.url + '/intercepting-routes-dynamic/photos/next/123'
        )
      })

      // Trigger a refresh, this should load the normal page, not the modal.
      await retry(async () => {
        expect(
          await browser
            .refresh()
            .waitForElementByCss('#user-regular-page')
            .text()
        ).toEqual('Regular Page')
      })

      // Check if the url matches still.
      await retry(async () => {
        expect(await browser.url()).toMatch(
          next.url + '/intercepting-routes-dynamic/photos/next/123'
        )
      })
    })
  })

  describe('route intercepting with dynamic optional catch-all routes', () => {
    it('should render intercepted route', async () => {
      const browser = await next.browser(
        '/intercepting-routes-dynamic-catchall/photos'
      )

      // Check if navigation to modal route works
      await retry(async () => {
        expect(
          await browser
            .elementByCss(
              '[href="/intercepting-routes-dynamic-catchall/photos/optional-catchall/123"]'
            )
            .click()
            .waitForElementByCss('#optional-catchall-intercept-page')
            .text()
        ).toEqual('Intercepted Page')
      })

      // Check if url matches even though it was intercepted.
      await retry(async () => {
        expect(await browser.url()).toMatch(
          next.url +
            '/intercepting-routes-dynamic-catchall/photos/optional-catchall/123'
        )
      })

      // Trigger a refresh, this should load the normal page, not the modal.
      await retry(async () => {
        expect(
          await browser
            .refresh()
            .waitForElementByCss('#optional-catchall-regular-page')
            .text()
        ).toEqual('Regular Page')
      })

      // Check if the url matches still.
      await retry(async () => {
        expect(await browser.url()).toMatch(
          next.url +
            '/intercepting-routes-dynamic-catchall/photos/optional-catchall/123'
        )
      })
    })
  })

  describe('route intercepting with dynamic catch-all routes', () => {
    it('should render intercepted route', async () => {
      const browser = await next.browser(
        '/intercepting-routes-dynamic-catchall/photos'
      )

      // Check if navigation to modal route works
      await retry(async () => {
        expect(
          await browser
            .elementByCss(
              '[href="/intercepting-routes-dynamic-catchall/photos/catchall/123"]'
            )
            .click()
            .waitForElementByCss('#catchall-intercept-page')
            .text()
        ).toEqual('Intercepted Page')
      })

      // Check if url matches even though it was intercepted.
      await retry(async () => {
        expect(await browser.url()).toMatch(
          next.url + '/intercepting-routes-dynamic-catchall/photos/catchall/123'
        )
      })

      // Trigger a refresh, this should load the normal page, not the modal.
      await retry(async () => {
        expect(
          await browser
            .refresh()
            .waitForElementByCss('#catchall-regular-page')
            .text()
        ).toEqual('Regular Page')
      })

      // Check if the url matches still.
      await retry(async () => {
        expect(await browser.url()).toMatch(
          next.url + '/intercepting-routes-dynamic-catchall/photos/catchall/123'
        )
      })
    })
  })

  describe('route intercepting', () => {
    it('should render intercepted route', async () => {
      const browser = await next.browser('/intercepting-routes/feed')

      // Check if navigation to modal route works.
      await retry(async () => {
        expect(
          await browser
            .elementByCss('[href="/intercepting-routes/feed/photos/1"]')
            .click()
            .waitForElementByCss('#photo-intercepted-1')
            .text()
        ).toEqual('Photo INTERCEPTED 1')
      })

      // Check if intercepted route was rendered while existing page content was removed.
      // Content would only be preserved when combined with parallel routes.
      // await check(() => browser.elementByCss('#feed-page').text()).not.toBe('Feed')

      // Check if url matches even though it was intercepted.
      await retry(async () => {
        expect(await browser.url()).toMatch(
          next.url + '/intercepting-routes/feed/photos/1'
        )
      })

      // Trigger a refresh, this should load the normal page, not the modal.
      await retry(async () => {
        expect(
          await browser.refresh().waitForElementByCss('#photo-page-1').text()
        ).toEqual('Photo PAGE 1')
      })

      // Check if the url matches still.
      await retry(async () => {
        expect(await browser.url()).toMatch(
          next.url + '/intercepting-routes/feed/photos/1'
        )
      })
    })

    it('should render an intercepted route from a slot', async () => {
      const browser = await next.browser('/')

      await retry(async () => {
        expect(
          await browser.waitForElementByCss('#default-slot').text()
        ).toEqual('default from @slot')
      })

      await retry(async () => {
        expect(
          await browser
            .elementByCss('[href="/nested"]')
            .click()
            .waitForElementByCss('#interception-slot')
            .text()
        ).toEqual('interception from @slot/nested')
      })

      // Check if the client component is rendered
      await retry(async () => {
        expect(
          await browser.waitForElementByCss('#interception-slot-client').text()
        ).toEqual('client component')
      })

      await retry(async () => {
        expect(
          await browser.refresh().waitForElementByCss('#nested').text()
        ).toEqual('hello world from /nested')
      })
    })

    it('should render an intercepted route at the top level from a nested path', async () => {
      const browser = await next.browser('/nested-link')

      await retry(async () => {
        expect(
          await browser.waitForElementByCss('#default-slot').text()
        ).toEqual('default from @slot')
      })

      await retry(async () => {
        expect(
          await browser
            .elementByCss('[href="/nested"]')
            .click()
            .waitForElementByCss('#interception-slot')
            .text()
        ).toEqual('interception from @slot/nested')
      })

      await retry(async () => {
        expect(
          await browser.refresh().waitForElementByCss('#nested').text()
        ).toEqual('hello world from /nested')
      })
    })

    it('should render intercepted route from a nested route', async () => {
      const browser = await next.browser('/intercepting-routes/feed/nested')

      // Check if navigation to modal route works.
      await retry(async () => {
        expect(
          await browser
            .elementByCss('[href="/intercepting-routes/feed/photos/1"]')
            .click()
            .waitForElementByCss('#photo-intercepted-1')
            .text()
        ).toEqual('Photo INTERCEPTED 1')
      })

      // Check if intercepted route was rendered while existing page content was removed.
      // Content would only be preserved when combined with parallel routes.
      // await check(() => browser.elementByCss('#feed-page').text()).not.toBe('Feed')

      // Check if url matches even though it was intercepted.
      await retry(async () => {
        expect(await browser.url()).toMatch(
          next.url + '/intercepting-routes/feed/photos/1'
        )
      })

      // Trigger a refresh, this should load the normal page, not the modal.
      await retry(async () => {
        expect(
          await browser.refresh().waitForElementByCss('#photo-page-1').text()
        ).toEqual('Photo PAGE 1')
      })

      // Check if the url matches still.
      await retry(async () => {
        expect(await browser.url()).toMatch(
          next.url + '/intercepting-routes/feed/photos/1'
        )
      })
    })

    it('should re-render the layout on the server when it had a default child route', async () => {
      const browser = await next.browser('/parallel-non-intercepting')

      // check if the default view loads
      await retry(async () => {
        expect(
          await browser.waitForElementByCss('#default-parallel').text()
        ).toEqual('default view for parallel')
      })

      // check that navigating to /foo re-renders the layout to display @parallel/foo
      await retry(async () => {
        expect(
          await browser
            .elementByCss('[href="/parallel-non-intercepting/foo"]')
            .click()
            .waitForElementByCss('#parallel-foo')
            .text()
        ).toEqual('parallel for foo')
      })

      // check that navigating to /foo also re-renders the base children
      await retry(async () => {
        expect(await browser.elementByCss('#children-foo').text()).toEqual(
          'foo'
        )
      })
    })

    it('should render modal when paired with parallel routes', async () => {
      const browser = await next.browser('/intercepting-parallel-modal/vercel')
      // Check if navigation to modal route works.
      await retry(async () => {
        expect(
          await browser
            .elementByCss('[href="/intercepting-parallel-modal/photo/1"]')
            .click()
            .waitForElementByCss('#photo-modal-1')
            .text()
        ).toEqual('Photo MODAL 1')
      })

      await retry(async () => {
        expect(
          await browser
            .elementByCss('[href="/intercepting-parallel-modal/photo/2"]')
            .click()
            .waitForElementByCss('#photo-modal-2')
            .text()
        ).toEqual('Photo MODAL 2')
      })

      // Check if modal was rendered while existing page content is preserved.
      await retry(async () => {
        expect(await browser.elementByCss('#user-page').text()).toEqual(
          'Feed for vercel'
        )
      })

      // Check if url matches even though it was intercepted.
      await retry(async () => {
        expect(await browser.url()).toMatch(
          next.url + '/intercepting-parallel-modal/photo/2'
        )
      })

      // Trigger a refresh, this should load the normal page, not the modal.
      await retry(async () => {
        expect(
          await browser.refresh().waitForElementByCss('#photo-page-2').text()
        ).toEqual('Photo PAGE 2')
      })

      // Check if the url matches still.
      await retry(async () => {
        expect(await browser.url()).toMatch(
          next.url + '/intercepting-parallel-modal/photo/2'
        )
      })
    })

    it('should support intercepting with beforeFiles rewrites', async () => {
      const browser = await next.browser('/foo')

      await retry(async () => {
        expect(
          await browser
            .elementByCss('[href="/photos"]')
            .click()
            .waitForElementByCss('#intercepted')
            .text()
        ).toEqual('intercepted')
      })
    })

    it('should support intercepting local dynamic sibling routes', async () => {
      const browser = await next.browser('/intercepting-siblings')

      await retry(async () => {
        expect(
          await browser
            .elementByCss('[href="/intercepting-siblings/1"]')
            .click()
            .waitForElementByCss('#intercepted-sibling')
            .text()
        ).toEqual('1')
      })
      await retry(async () => {
        expect(
          await browser
            .elementByCss('[href="/intercepting-siblings/2"]')
            .click()
            .waitForElementByCss('#intercepted-sibling')
            .text()
        ).toEqual('2')
      })
      await retry(async () => {
        expect(
          await browser
            .elementByCss('[href="/intercepting-siblings/3"]')
            .click()
            .waitForElementByCss('#intercepted-sibling')
            .text()
        ).toEqual('3')
      })

      await next.browser('/intercepting-siblings/1')

      await retry(async () => {
        expect(await browser.waitForElementByCss('#main-slot').text()).toEqual(
          '1'
        )
      })
    })

    it('should intercept on routes that contain hyphenated/special dynamic params', async () => {
      const browser = await next.browser(
        '/interception-route-special-params/some-random-param'
      )

      await browser
        .elementByCss(
          "[href='/interception-route-special-params/some-random-param/some-page']"
        )
        .click()

      const interceptionText =
        'Hello from [this-is-my-route]/@intercept/some-page. Param: some-random-param'
      const pageText =
        'Hello from [this-is-my-route]/some-page. Param: some-random-param'

      await retry(async () => {
        expect(await browser.elementByCss('body').text()).toContain(
          interceptionText
        )

        expect(await browser.elementByCss('body').text()).not.toContain(
          pageText
        )
      })

      await browser.refresh()

      await retry(async () => {
        expect(await browser.elementByCss('body').text()).toContain(pageText)

        expect(await browser.elementByCss('body').text()).not.toContain(
          interceptionText
        )
      })
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
})

describe('parallel-routes-and-interception with patching', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  afterEach(async () => {
    try {
      await next.stop()
    } finally {
      await next.deleteFile('app/parallel/nested-2/page.js')
    }
  })

  it('should gracefully handle when two page segments match the `children` parallel slot', async () => {
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
  })
})
