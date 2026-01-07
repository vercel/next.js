import { nextTestSetup, FileRef } from 'e2e-utils'
import { NextConfig } from 'next'
import { retry } from 'next-test-utils'
import path from 'path'

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/foo',
          destination: '/en/foo',
        },
        {
          source: '/photos',
          destination: '/en/photos',
        },
      ],
    }
  },
}

describe.each([true, false])(
  'parallel-routes-and-interception (trailingSlash: %s)',
  (trailingSlash) => {
    const { next, isNextDev, isNextStart } = nextTestSetup({
      files: __dirname,
      nextConfig: {
        trailingSlash,
        ...nextConfig,
      },
    })

    describe('parallel routes', () => {
      it('should support parallel route tab bars', async () => {
        const browser = await next.browser('/parallel-tab-bar')

        const hasHome = async () => {
          await retry(
            async () => {
              expect(await browser.waitForElementByCss('#home').text()).toBe(
                'Tab bar page (@children)'
              )
            },
            30000,
            1000
          )
        }
        const hasViewsHome = async () => {
          await retry(
            async () => {
              expect(
                await browser.waitForElementByCss('#views-home').text()
              ).toBe('Views home')
            },
            30000,
            1000
          )
        }
        const hasViewDuration = async () => {
          await retry(
            async () => {
              expect(
                await browser.waitForElementByCss('#view-duration').text()
              ).toBe('View duration')
            },
            30000,
            1000
          )
        }
        const hasImpressions = async () => {
          await retry(
            async () => {
              expect(
                await browser.waitForElementByCss('#impressions').text()
              ).toBe('Impressions')
            },
            30000,
            1000
          )
        }
        const hasAudienceHome = async () => {
          await retry(
            async () => {
              expect(
                await browser.waitForElementByCss('#audience-home').text()
              ).toBe('Audience home')
            },
            30000,
            1000
          )
        }
        const hasDemographics = async () => {
          await retry(
            async () => {
              expect(
                await browser.waitForElementByCss('#demographics').text()
              ).toBe('Demographics')
            },
            30000,
            1000
          )
        }
        const hasSubscribers = async () => {
          await retry(
            async () => {
              expect(
                await browser.waitForElementByCss('#subscribers').text()
              ).toBe('Subscribers')
            },
            30000,
            1000
          )
        }
        const checkUrlPath = async (path: string) => {
          await retry(
            async () => {
              expect(await browser.url()).toBe(
                `${next.url}/parallel-tab-bar${path}${trailingSlash ? '/' : ''}`
              )
            },
            30000,
            1000
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

      it('should throw a 404 when no matching parallel route is found', async () => {
        const browser = await next.browser('/parallel-tab-bar')
        // we make sure the page is available through navigating
        await retry(
          async () => {
            expect(await browser.waitForElementByCss('#home').text()).toBe(
              'Tab bar page (@children)'
            )
          },
          30000,
          1000
        )
        await browser.elementByCss('#view-duration-link').click()
        await retry(
          async () => {
            expect(
              await browser.waitForElementByCss('#view-duration').text()
            ).toBe('View duration')
          },
          30000,
          1000
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
        await retry(
          async () => {
            expect(
              await browser.waitForElementByCss('#nested-deeper-main').text()
            ).toBe('Nested deeper page')
          },
          30000,
          1000
        )

        await retry(
          async () => {
            expect(
              await browser.waitForElementByCss('#nested-deeper-sidebar').text()
            ).toBe('Nested deeper sidebar here')
          },
          30000,
          1000
        )

        await browser
          .elementByCss(
            `[href="/parallel-side-bar/nested${trailingSlash ? '/' : ''}"]`
          )
          .click()

        await retry(
          async () => {
            expect(
              await browser.waitForElementByCss('#nested-main').text()
            ).toBe('Nested page')
          },
          30000,
          1000
        )

        await retry(
          async () => {
            expect(
              await browser.waitForElementByCss('#nested-sidebar').text()
            ).toBe('Nested sidebar here')
          },
          30000,
          1000
        )

        await browser
          .elementByCss(
            `[href="/parallel-side-bar${trailingSlash ? '/' : ''}"]`
          )
          .click()

        await retry(
          async () => {
            expect(await browser.waitForElementByCss('#main').text()).toBe(
              'homepage'
            )
          },
          30000,
          1000
        )

        await retry(
          async () => {
            expect(
              await browser.waitForElementByCss('#sidebar-main').text()
            ).toBe('root sidebar here')
          },
          30000,
          1000
        )
      })

      it('should support layout files in parallel routes', async () => {
        const browser = await next.browser('/parallel-layout')
        await retry(
          async () => {
            expect(
              await browser.waitForElementByCss('#parallel-layout').text()
            ).toBe('parallel layout')
          },
          30000,
          1000
        )

        // navigate to /parallel-layout/subroute
        await browser
          .elementByCss(
            `[href="/parallel-layout/subroute${trailingSlash ? '/' : ''}"]`
          )
          .click()
        await retry(
          async () => {
            expect(
              await browser.waitForElementByCss('#parallel-layout').text()
            ).toBe('parallel layout')
          },
          30000,
          1000
        )
        await retry(
          async () => {
            expect(
              await browser.waitForElementByCss('#parallel-subroute').text()
            ).toBe('parallel subroute layout')
          },
          30000,
          1000
        )
      })

      it('should only scroll to the parallel route that was navigated to', async () => {
        const browser = await next.browser('/parallel-scroll')

        await browser.eval('window.scrollTo(0, 1000)')
        const position = await browser.eval('window.scrollY')
        console.log('position', position)
        await browser
          .elementByCss(
            `[href="/parallel-scroll/nav${trailingSlash ? '/' : ''}"]`
          )
          .click()
        await browser.waitForElementByCss('#modal')
        // check that we didn't scroll back to the top
        await retry(
          async () => {
            await expect(browser.eval('window.scrollY')).resolves.toBe(position)
          },
          30000,
          1000
        )
      })

      it('should apply the catch-all route to the parallel route if no matching route is found', async () => {
        const browser = await next.browser('/parallel-catchall')

        await browser
          .elementByCss(
            `[href="/parallel-catchall/bar${trailingSlash ? '/' : ''}"]`
          )
          .click()
        await retry(
          async () => {
            expect(await browser.waitForElementByCss('#main').text()).toBe(
              'bar slot'
            )
          },
          30000,
          1000
        )
        await retry(
          async () => {
            expect(
              await browser.waitForElementByCss('#slot-content').text()
            ).toBe('slot catchall')
          },
          30000,
          1000
        )

        await browser
          .elementByCss(
            `[href="/parallel-catchall/foo${trailingSlash ? '/' : ''}"]`
          )
          .click()
        await retry(
          async () => {
            expect(await browser.waitForElementByCss('#main').text()).toBe(
              'foo'
            )
          },
          30000,
          1000
        )
        await retry(
          async () => {
            expect(
              await browser.waitForElementByCss('#slot-content').text()
            ).toBe('foo slot')
          },
          30000,
          1000
        )

        await browser
          .elementByCss(
            `[href="/parallel-catchall/baz${trailingSlash ? '/' : ''}"]`
          )
          .click()
        await retry(
          async () => {
            expect(await browser.waitForElementByCss('#main').text()).toMatch(
              /main catchall/
            )
          },
          30000,
          1000
        )
        await retry(
          async () => {
            expect(await browser.waitForElementByCss('#main').text()).toMatch(
              /catchall page client component/
            )
          },
          30000,
          1000
        )
        await retry(
          async () => {
            expect(
              await browser.waitForElementByCss('#slot-content').text()
            ).toBe('baz slot')
          },
          30000,
          1000
        )
      })

      it('should match the catch-all routes of the more specific path, if there is more than one catch-all route', async () => {
        const browser = await next.browser('/parallel-nested-catchall')

        await browser
          .elementByCss(
            `[href="/parallel-nested-catchall/foo${trailingSlash ? '/' : ''}"]`
          )
          .click()
        await retry(
          async () => {
            expect(await browser.waitForElementByCss('#main').text()).toBe(
              'foo'
            )
          },
          30000,
          1000
        )
        await retry(
          async () => {
            expect(
              await browser.waitForElementByCss('#slot-content').text()
            ).toBe('foo slot')
          },
          30000,
          1000
        )

        await browser
          .elementByCss(
            `[href="/parallel-nested-catchall/bar${trailingSlash ? '/' : ''}"]`
          )
          .click()
        await retry(
          async () => {
            expect(await browser.waitForElementByCss('#main').text()).toBe(
              'bar'
            )
          },
          30000,
          1000
        )
        await retry(
          async () => {
            expect(
              await browser.waitForElementByCss('#slot-content').text()
            ).toBe('slot catchall')
          },
          30000,
          1000
        )

        await browser
          .elementByCss(
            `[href="/parallel-nested-catchall/foo/123${trailingSlash ? '/' : ''}"]`
          )
          .click()
        await retry(
          async () => {
            expect(await browser.waitForElementByCss('#main').text()).toBe(
              'foo id'
            )
          },
          30000,
          1000
        )
        await retry(
          async () => {
            expect(
              await browser.waitForElementByCss('#slot-content').text()
            ).toBe('foo id catchAll')
          },
          30000,
          1000
        )
      })

      it('should navigate with a link with prefetch=false', async () => {
        const browser = await next.browser('/parallel-prefetch-false')

        // check if the default view loads
        await retry(
          async () => {
            expect(
              await browser.waitForElementByCss('#default-parallel').text()
            ).toBe('default view for parallel')
          },
          30000,
          1000
        )

        // check that navigating to /foo re-renders the layout to display @parallel/foo
        await retry(
          async () => {
            await expect(
              browser
                .elementByCss(
                  `[href="/parallel-prefetch-false/foo${trailingSlash ? '/' : ''}"]`
                )
                .click()
                .waitForElementByCss('#parallel-foo')
                .text()
            ).resolves.toBe('parallel for foo')
          },
          30000,
          1000
        )
      })

      it('should display all parallel route params with useParams', async () => {
        const browser = await next.browser('/parallel-dynamic/foo/bar')

        await retry(
          async () => {
            expect(await browser.waitForElementByCss('#foo').text()).toBe(
              `{"slug":"foo","id":"bar"}`
            )
          },
          30000,
          1000
        )

        await retry(
          async () => {
            expect(await browser.waitForElementByCss('#bar').text()).toBe(
              `{"slug":"foo","id":"bar"}`
            )
          },
          30000,
          1000
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
        await browser
          .elementByCss(`[href="/default-css/more${trailingSlash ? '/' : ''}"]`)
          .click()

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
            .elementByCss(
              `[href="/with-loading/foo${trailingSlash ? '/' : ''}"]`
            )
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

          await retry(
            async () => {
              // an invalid response triggers a fast refresh, so if the timestamp doesn't update, this behaved correctly
              const newTimestamp = await browser
                .elementByCss('#timestamp')
                .text()
              return newTimestamp !== timestamp ? 'failure' : 'success'
            },
            30000,
            1000
          )
        })

        it('should support nested parallel routes', async () => {
          const browser = await next.browser('parallel-nested/home/nested')
          const timestamp = await browser.elementByCss('#timestamp').text()

          await new Promise((resolve) => {
            setTimeout(resolve, 3000)
          })

          await retry(
            async () => {
              // an invalid response triggers a fast refresh, so if the timestamp doesn't update, this behaved correctly
              const newTimestamp = await browser
                .elementByCss('#timestamp')
                .text()
              return newTimestamp !== timestamp ? 'failure' : 'success'
            },
            30000,
            1000
          )
        })
      }
    })

    describe('route intercepting with dynamic routes', () => {
      it('should render intercepted route', async () => {
        const browser = await next.browser(
          `/intercepting-routes-dynamic/photos${trailingSlash ? '/' : ''}`
        )

        // Check if navigation to modal route works
        await retry(
          async () => {
            await expect(
              browser
                .elementByCss(
                  `[href="/intercepting-routes-dynamic/photos/next/123${trailingSlash ? '/' : ''}"]`
                )
                .click()
                .waitForElementByCss('#user-intercept-page')
                .text()
            ).resolves.toBe('Intercepted Page')
          },
          30000,
          1000
        )

        // Check if url matches even though it was intercepted.
        await retry(
          async () => {
            expect(await browser.url()).toBe(
              next.url +
                '/intercepting-routes-dynamic/photos/next/123' +
                (trailingSlash ? '/' : '')
            )
          },
          30000,
          1000
        )

        // Trigger a refresh, this should load the normal page, not the modal.
        await retry(
          async () => {
            expect(
              await browser
                .refresh()
                .waitForElementByCss('#user-regular-page')
                .text()
            ).toBe('Regular Page')
          },
          30000,
          1000
        )

        // Check if the url matches still.
        await retry(
          async () => {
            expect(await browser.url()).toBe(
              next.url +
                '/intercepting-routes-dynamic/photos/next/123' +
                (trailingSlash ? '/' : '')
            )
          },
          30000,
          1000
        )
      })
    })

    describe('route intercepting with prerendered dynamic routes ', () => {
      it('should render intercepted route', async () => {
        const browser = await next.browser(
          '/intercepting-routes-dynamic-prerendered/photos'
        )

        // Check if navigation to modal route works.
        await browser
          .elementByCss(
            `[href="/intercepting-routes-dynamic-prerendered/photos/1${trailingSlash ? '/' : ''}"]`
          )
          .click()

        // This should load the intercepted page.
        await retry(async () => {
          expect(
            await browser.waitForElementByCss('#photo-intercepted-1').text()
          ).toBe('Photo INTERCEPTED 1')
        })

        // Check if url matches even though it was intercepted.
        expect(await browser.url()).toBe(
          next.url +
            '/intercepting-routes-dynamic-prerendered/photos/1' +
            (trailingSlash ? '/' : '')
        )

        // There must not be any errors from prefetching the intercepted page.
        expect(
          (await browser.log()).filter(({ source }) => source === 'error')
        ).toEqual([])

        // Trigger a refresh, this should load the normal page, not the modal.
        await browser.refresh()
        expect(await browser.waitForElementByCss('#photo-page-1').text()).toBe(
          'Photo PAGE 1'
        )

        // Check if the url matches still.
        expect(await browser.url()).toBe(
          next.url +
            '/intercepting-routes-dynamic-prerendered/photos/1' +
            (trailingSlash ? '/' : '')
        )
      })
    })

    describe('route intercepting with dynamic optional catch-all routes', () => {
      it('should render intercepted route', async () => {
        const browser = await next.browser(
          `/intercepting-routes-dynamic-catchall/photos${trailingSlash ? '/' : ''}`
        )

        // Check if navigation to modal route works
        await retry(
          async () => {
            await expect(
              browser
                .elementByCss(
                  `[href="/intercepting-routes-dynamic-catchall/photos/optional-catchall/123${trailingSlash ? '/' : ''}"]`
                )
                .click()
                .waitForElementByCss('#optional-catchall-intercept-page')
                .text()
            ).resolves.toBe('Intercepted Page')
          },
          30000,
          1000
        )

        // Check if url matches even though it was intercepted.
        await retry(
          async () => {
            expect(await browser.url()).toBe(
              next.url +
                '/intercepting-routes-dynamic-catchall/photos/optional-catchall/123' +
                (trailingSlash ? '/' : '')
            )
          },
          30000,
          1000
        )

        // Trigger a refresh, this should load the normal page, not the modal.
        await retry(
          async () => {
            await expect(
              browser
                .refresh()
                .waitForElementByCss('#optional-catchall-regular-page')
                .text()
            ).resolves.toBe('Regular Page')
          },
          30000,
          1000
        )

        // Check if the url matches still.
        await retry(
          async () => {
            expect(await browser.url()).toBe(
              next.url +
                '/intercepting-routes-dynamic-catchall/photos/optional-catchall/123' +
                (trailingSlash ? '/' : '')
            )
          },
          30000,
          1000
        )
      })
    })

    describe('route intercepting with dynamic catch-all routes', () => {
      it('should render intercepted route', async () => {
        const browser = await next.browser(
          `/intercepting-routes-dynamic-catchall/photos${trailingSlash ? '/' : ''}`
        )

        // Check if navigation to modal route works
        await retry(
          async () => {
            await expect(
              browser
                .elementByCss(
                  `[href="/intercepting-routes-dynamic-catchall/photos/catchall/123${trailingSlash ? '/' : ''}"]`
                )
                .click()
                .waitForElementByCss('#catchall-intercept-page')
                .text()
            ).resolves.toBe('Intercepted Page')
          },
          30000,
          1000
        )

        // Check if url matches even though it was intercepted.
        await retry(
          async () => {
            expect(await browser.url()).toBe(
              next.url +
                '/intercepting-routes-dynamic-catchall/photos/catchall/123' +
                (trailingSlash ? '/' : '')
            )
          },
          30000,
          1000
        )

        // Trigger a refresh, this should load the normal page, not the modal.
        await retry(
          async () => {
            await expect(
              browser
                .refresh()
                .waitForElementByCss('#catchall-regular-page')
                .text()
            ).resolves.toBe('Regular Page')
          },
          30000,
          1000
        )

        // Check if the url matches still.
        await retry(
          async () => {
            expect(await browser.url()).toBe(
              next.url +
                '/intercepting-routes-dynamic-catchall/photos/catchall/123' +
                (trailingSlash ? '/' : '')
            )
          },
          30000,
          1000
        )
      })
    })

    describe('route intercepting', () => {
      it('should render intercepted route', async () => {
        const browser = await next.browser(
          `/intercepting-routes/feed${trailingSlash ? '/' : ''}`
        )

        // Check if navigation to modal route works.
        await retry(
          async () => {
            await expect(
              browser
                .elementByCss(
                  `[href="/intercepting-routes/feed/photos/1${trailingSlash ? '/' : ''}"]`
                )
                .click()
                .waitForElementByCss('#photo-intercepted-1')
                .text()
            ).resolves.toBe('Photo INTERCEPTED 1')
          },
          30000,
          1000
        )

        // Check if intercepted route was rendered while existing page content was removed.
        // Content would only be preserved when combined with parallel routes.
        // await check(() => browser.elementByCss('#feed-page').text()).not.toBe('Feed')

        // Check if url matches even though it was intercepted.
        await retry(
          async () => {
            expect(await browser.url()).toBe(
              next.url +
                '/intercepting-routes/feed/photos/1' +
                (trailingSlash ? '/' : '')
            )
          },
          30000,
          1000
        )

        // Trigger a refresh, this should load the normal page, not the modal.
        await retry(
          async () => {
            expect(
              await browser
                .refresh()
                .waitForElementByCss('#photo-page-1')
                .text()
            ).toBe('Photo PAGE 1')
          },
          30000,
          1000
        )

        // Check if the url matches still.
        await retry(
          async () => {
            expect(await browser.url()).toBe(
              next.url +
                '/intercepting-routes/feed/photos/1' +
                (trailingSlash ? '/' : '')
            )
          },
          30000,
          1000
        )
      })

      it('should render an intercepted route from a slot', async () => {
        const browser = await next.browser('/')

        await retry(
          async () => {
            expect(
              await browser.waitForElementByCss('#default-slot').text()
            ).toBe('default from @slot')
          },
          30000,
          1000
        )

        await retry(
          async () => {
            await expect(
              browser
                .elementByCss(`[href="/nested${trailingSlash ? '/' : ''}"]`)
                .click()
                .waitForElementByCss('#interception-slot')
                .text()
            ).resolves.toBe('interception from @slot/nested')
          },
          30000,
          1000
        )

        // Check if the client component is rendered
        await retry(
          async () => {
            expect(
              await browser
                .waitForElementByCss('#interception-slot-client')
                .text()
            ).toBe('client component')
          },
          30000,
          1000
        )

        await retry(
          async () => {
            expect(
              await browser.refresh().waitForElementByCss('#nested').text()
            ).toBe('hello world from /nested')
          },
          30000,
          1000
        )
      })

      it('should render an intercepted route at the top level from a nested path', async () => {
        const browser = await next.browser(
          `/nested-link${trailingSlash ? '/' : ''}`
        )

        await retry(
          async () => {
            expect(
              await browser.waitForElementByCss('#default-slot').text()
            ).toBe('default from @slot')
          },
          30000,
          1000
        )

        await retry(
          async () => {
            await expect(
              browser
                .elementByCss(`[href="/nested${trailingSlash ? '/' : ''}"]`)
                .click()
                .waitForElementByCss('#interception-slot')
                .text()
            ).resolves.toBe('interception from @slot/nested')
          },
          30000,
          1000
        )

        await retry(
          async () => {
            expect(
              await browser.refresh().waitForElementByCss('#nested').text()
            ).toBe('hello world from /nested')
          },
          30000,
          1000
        )
      })

      it('should render intercepted route from a nested route', async () => {
        const browser = await next.browser(
          `/intercepting-routes/feed/nested${trailingSlash ? '/' : ''}`
        )

        // Check if navigation to modal route works.
        await retry(
          async () => {
            await expect(
              browser
                .elementByCss(
                  `[href="/intercepting-routes/feed/photos/1${trailingSlash ? '/' : ''}"]`
                )
                .click()
                .waitForElementByCss('#photo-intercepted-1')
                .text()
            ).resolves.toBe('Photo INTERCEPTED 1')
          },
          30000,
          1000
        )

        // Check if intercepted route was rendered while existing page content was removed.
        // Content would only be preserved when combined with parallel routes.
        // await check(() => browser.elementByCss('#feed-page').text()).not.toBe('Feed')

        // Check if url matches even though it was intercepted.
        await retry(
          async () => {
            expect(await browser.url()).toBe(
              next.url +
                '/intercepting-routes/feed/photos/1' +
                (trailingSlash ? '/' : '')
            )
          },
          30000,
          1000
        )

        // Trigger a refresh, this should load the normal page, not the modal.
        await retry(
          async () => {
            expect(
              await browser
                .refresh()
                .waitForElementByCss('#photo-page-1')
                .text()
            ).toBe('Photo PAGE 1')
          },
          30000,
          1000
        )

        // Check if the url matches still.
        await retry(
          async () => {
            expect(await browser.url()).toBe(
              next.url +
                '/intercepting-routes/feed/photos/1' +
                (trailingSlash ? '/' : '')
            )
          },
          30000,
          1000
        )
      })

      it('should re-render the layout on the server when it had a default child route', async () => {
        const browser = await next.browser(
          `/parallel-non-intercepting${trailingSlash ? '/' : ''}`
        )

        // check if the default view loads
        await retry(
          async () => {
            expect(
              await browser.waitForElementByCss('#default-parallel').text()
            ).toBe('default view for parallel')
          },
          30000,
          1000
        )

        // check that navigating to /foo re-renders the layout to display @parallel/foo
        await retry(
          async () => {
            await expect(
              browser
                .elementByCss(
                  `[href="/parallel-non-intercepting/foo${trailingSlash ? '/' : ''}"]`
                )
                .click()
                .waitForElementByCss('#parallel-foo')
                .text()
            ).resolves.toBe('parallel for foo')
          },
          30000,
          1000
        )

        // check that navigating to /foo also re-renders the base children
        await retry(
          async () => {
            expect(await browser.elementByCss('#children-foo').text()).toBe(
              'foo'
            )
          },
          30000,
          1000
        )
      })

      it('should render modal when paired with parallel routes', async () => {
        const browser = await next.browser(
          `/intercepting-parallel-modal/vercel${trailingSlash ? '/' : ''}`
        )
        // Check if navigation to modal route works.
        await retry(
          async () => {
            await expect(
              browser
                .elementByCss(
                  `[href="/intercepting-parallel-modal/photo/1${trailingSlash ? '/' : ''}"]`
                )
                .click()
                .waitForElementByCss('#photo-modal-1')
                .text()
            ).resolves.toBe('Photo MODAL 1')
          },
          30000,
          1000
        )

        await retry(
          async () => {
            await expect(
              browser
                .elementByCss(
                  `[href="/intercepting-parallel-modal/photo/2${trailingSlash ? '/' : ''}"]`
                )
                .click()
                .waitForElementByCss('#photo-modal-2')
                .text()
            ).resolves.toBe('Photo MODAL 2')
          },
          30000,
          1000
        )

        // Check if modal was rendered while existing page content is preserved.
        await retry(
          async () => {
            expect(await browser.elementByCss('#user-page').text()).toBe(
              'Feed for vercel'
            )
          },
          30000,
          1000
        )

        // Check if url matches even though it was intercepted.
        await retry(
          async () => {
            expect(await browser.url()).toBe(
              next.url +
                '/intercepting-parallel-modal/photo/2' +
                (trailingSlash ? '/' : '')
            )
          },
          30000,
          1000
        )

        // Trigger a refresh, this should load the normal page, not the modal.
        await retry(
          async () => {
            expect(
              await browser
                .refresh()
                .waitForElementByCss('#photo-page-2')
                .text()
            ).toBe('Photo PAGE 2')
          },
          30000,
          1000
        )

        // Check if the url matches still.
        await retry(
          async () => {
            expect(await browser.url()).toBe(
              next.url +
                '/intercepting-parallel-modal/photo/2' +
                (trailingSlash ? '/' : '')
            )
          },
          30000,
          1000
        )
      })

      it('should support intercepting with beforeFiles rewrites', async () => {
        const browser = await next.browser(`/foo${trailingSlash ? '/' : ''}`)

        await retry(
          async () => {
            await expect(
              browser
                .elementByCss(`[href="/photos${trailingSlash ? '/' : ''}"]`)
                .click()
                .waitForElementByCss('#intercepted')
                .text()
            ).resolves.toBe('intercepted')
          },
          30000,
          1000
        )
      })

      it('should support intercepting local dynamic sibling routes', async () => {
        const browser = await next.browser(
          `/intercepting-siblings${trailingSlash ? '/' : ''}`
        )

        await retry(
          async () => {
            await expect(
              browser
                .elementByCss(
                  `[href="/intercepting-siblings/1${trailingSlash ? '/' : ''}"]`
                )
                .click()
                .waitForElementByCss('#intercepted-sibling')
                .text()
            ).resolves.toBe('1')
          },
          30000,
          1000
        )
        await retry(
          async () => {
            await expect(
              browser
                .elementByCss(
                  `[href="/intercepting-siblings/2${trailingSlash ? '/' : ''}"]`
                )
                .click()
                .waitForElementByCss('#intercepted-sibling')
                .text()
            ).resolves.toBe('2')
          },
          30000,
          1000
        )
        await retry(
          async () => {
            await expect(
              browser
                .elementByCss(
                  `[href="/intercepting-siblings/3${trailingSlash ? '/' : ''}"]`
                )
                .click()
                .waitForElementByCss('#intercepted-sibling')
                .text()
            ).resolves.toBe('3')
          },
          30000,
          1000
        )

        await next.browser(
          `/intercepting-siblings/1${trailingSlash ? '/' : ''}`
        )

        await retry(
          async () => {
            expect(await browser.waitForElementByCss('#main-slot').text()).toBe(
              '1'
            )
          },
          30000,
          1000
        )
      })

      it('should intercept on routes that contain hyphenated/special dynamic params', async () => {
        const browser = await next.browser(
          `/interception-route-special-params/some-random-param${trailingSlash ? '/' : ''}`
        )

        await browser
          .elementByCss(
            `[href="/interception-route-special-params/some-random-param/some-page${trailingSlash ? '/' : ''}"]`
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
  }
)

describe('parallel-routes-and-interception-conflicting-pages', () => {
  const { next, skipped } = nextTestSetup({
    // This is skipped when deployed as it appears to cause an issue when tracing Next.js files
    // TODO: Investigate why this causes an issue when deployed
    skipDeployment: true,
    files: {
      app: new FileRef(path.join(__dirname, 'app')),
      'app/parallel/nested-2/page.js': `
       export default function Page() {
          return 'hello world'
       }
      `,
    },
    nextConfig,
  })

  if (skipped) return

  it('should gracefully handle when two page segments match the `children` parallel slot', async () => {
    const html = await next.render('/parallel/nested-2')

    // before adding this file, the page would have matched `/app/parallel/(new)/@baz/nested-2/page`
    // but we've added a more specific page, so it should match that instead
    if (process.env.IS_TURBOPACK_TEST) {
      // TODO: this matches differently in Turbopack because the Webpack loader does some sorting on the paths
      // Investigate the discrepancy in a follow-up. For now, since no errors are being thrown (and since this test was previously ignored in Turbopack),
      // we'll just verify that the page is rendered and some content was matched.
      expect(html).toContain('parallel/(new)/@baz/nested/page')
    } else {
      expect(html).toContain('hello world')
    }
  })
})
