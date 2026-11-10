import { nextTestSetup } from 'e2e-utils'
import { assertNoConsoleErrors } from 'next-test-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('fallback-shells', () => {
  const { next, isNextDev, isNextDeploy, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  describe('without IO', () => {
    it('should start and not postpone the response', async () => {
      const { browser, response } =
        await next.browserWithResponse('/without-io/world')

      expect(await browser.elementById('slug').text()).toBe('Hello /world')
      const headers = response.headers()

      // If we didn't use the fallback shell, then we didn't postpone the
      // response, and therefore shouldn't have sent the postponed header.
      expect(headers['x-nextjs-postponed']).not.toBe('1')
    })

    // Coverage for the head (metadata) surviving hydration of a fallback
    // shell page for an uncovered param: the title must be correct after
    // hydration, the head must be included in prefetched data, and a return
    // navigation must be served entirely from the cache that was populated
    // during the initial hydration.
    //
    // NOTE: This does not exercise the client resume path
    // (createInitialRSCPayloadFromFallbackPrerender). In deployed
    // environments an uncovered param currently gets a blocking on-demand
    // render rather than the prerendered fallback shell, and `next start`
    // renders uncovered params on demand as well. The resume script is only
    // present in the build-time fallback shell artifact.
    describe('with metadata', () => {
      if (isNextDev) {
        // Fallback shells (and prefetching) only exist in production builds.
        test('disabled in development', () => {})
        return
      }

      it('preserves metadata when hydrating a fallback shell page', async () => {
        let act: ReturnType<typeof createRouterAct>
        const { browser, response } = await next.browserWithResponse(
          '/without-io/with-metadata/world',
          {
            beforePageLoad(p: Playwright.Page) {
              act = createRouterAct(p)
            },
          }
        )
        expect(response.headers()['x-nextjs-postponed']).not.toBe('1')
        expect(await browser.elementById('slug').text()).toBe('Hello /world')
        expect(await browser.eval('document.title')).toBe(
          'Fallback Shell Metadata Title'
        )

        // Prefetch the hub page. The head (title) should be included in the
        // prefetched data.
        await act(
          async () => {
            const toggle = await browser.elementByCss(
              'input[data-link-accordion="/without-io/metadata-hub"]'
            )
            await toggle.click()
          },
          { includes: 'Metadata Hub Title' }
        )

        // Navigate to the hub. It was fully prefetched, so no additional
        // requests should be needed. This also proves hydration of the
        // initial page completed, since it requires the client router to
        // be interactive.
        await act(async () => {
          const link = await browser.elementByCss(
            'a[href="/without-io/metadata-hub"]'
          )
          await link.click()
        }, 'no-requests')
        expect(await browser.elementById('hub').text()).toBe(
          'Metadata hub page content'
        )
        expect(await browser.eval('document.title')).toBe('Metadata Hub Title')

        // Navigate back to the fallback page. Hydrating the initial page
        // wrote its data — including the head — into the segment cache, so
        // the return navigation should be served entirely from the cache.
        await act(async () => {
          const toggle = await browser.elementByCss(
            'input[data-link-accordion="/without-io/with-metadata/world"]'
          )
          await toggle.click()
        }, 'no-requests')
        await act(async () => {
          const link = await browser.elementByCss(
            'a[href="/without-io/with-metadata/world"]'
          )
          await link.click()
        }, 'no-requests')
        expect(await browser.elementById('slug').text()).toBe('Hello /world')
        expect(await browser.eval('document.title')).toBe(
          'Fallback Shell Metadata Title'
        )
        await assertNoConsoleErrors(browser)
      })
    })
  })

  describe('with cached IO', () => {
    describe('with generateStaticParams', () => {
      describe('and the page wrapped in Suspense', () => {
        describe('and the params accessed in the cached page', () => {
          it('resumes a postponed fallback shell', async () => {
            const { browser, response } = await next.browserWithResponse(
              '/with-cached-io/with-static-params/with-suspense/params-in-page/bar'
            )

            const lastModified = await browser
              .elementById('last-modified')
              .text()
            expect(lastModified).toInclude('Page /bar')
            expect(lastModified).toInclude('runtime')

            const layout = await browser.elementById('root-layout').text()
            expect(layout).toInclude(isNextDev ? 'runtime' : 'buildtime')

            const headers = response.headers()

            if (isNextStart) {
              expect(headers['x-nextjs-postponed']).toBe('1')
            }
          })

          it('does not produce hydration errors when resuming a fallback shell containing a layout with unused params', async () => {
            const browser = await next.browser(
              '/with-cached-io/with-static-params/with-suspense/params-in-page/bar',
              { pushErrorAsConsoleLog: true }
            )

            // There should also be no hydration errors due to a buildtime date
            // being replaced by a new runtime date.
            await assertNoConsoleErrors(browser)
          })

          // TODO: To be implemented in NAR-136.
          it.skip('includes a cached layout with unused params in the fallback shell', async () => {
            const browser = await next.browser(
              '/with-cached-io/with-static-params/with-suspense/params-in-page/bar'
            )

            const layout = await browser.elementById('layout').text()

            // When prerendered, this should be restored from the RDC during the
            // resume of the fallback shell, so it should be "buildtime". If the
            // layout is unexpectedly a cache miss, then it will be "runtime".
            expect(layout).toInclude(isNextDev ? 'runtime' : 'buildtime')
          })

          // TODO: Activate for deploy tests once background revalidation for
          // prerendered pages is not triggered anymore on the first visit.
          if (!isNextDeploy) {
            it('shares a cached parent layout between a prerendered route shell and the fallback shell', async () => {
              // `/foo` was prerendered
              const browser = await next.browser(
                '/with-cached-io/with-static-params/with-suspense/params-in-page/foo'
              )

              const layoutDateRouteShell = await browser
                .elementById('root-layout')
                .text()

              expect(layoutDateRouteShell).toInclude(
                isNextDev ? 'runtime' : 'buildtime'
              )

              await browser.loadPage(
                new URL(
                  // Use a unique slug so earlier tests don't upgrade this route.
                  `/with-cached-io/with-static-params/with-suspense/params-in-page/baz`,
                  next.url
                ).href
              )

              const layoutDateFallbackShell = await browser
                .elementById('root-layout')
                .text()

              expect(layoutDateRouteShell).toInclude(
                isNextDev ? 'runtime' : 'buildtime'
              )

              expect(layoutDateFallbackShell).toBe(layoutDateRouteShell)
            })

            // TODO: To be implemented in NAR-136.
            it.skip('shares a cached layout with unused params between a prerendered route shell and the fallback shell', async () => {
              // `/foo` was prerendered
              const browser = await next.browser(
                '/with-cached-io/with-static-params/with-suspense/params-in-page/foo'
              )

              const layoutDateRouteShell = await browser
                .elementById('layout')
                .text()

              expect(layoutDateRouteShell).toInclude(
                isNextDev ? 'runtime' : 'buildtime'
              )

              // `/bar` was not prerendered, and thus resumes the fallback shell.
              await browser.loadPage(
                new URL(
                  '/with-cached-io/with-static-params/with-suspense/params-in-page/bar',
                  next.url
                ).href
              )

              const layoutDateFallbackShell = await browser
                .elementById('layout')
                .text()

              expect(layoutDateRouteShell).toInclude(
                isNextDev ? 'runtime' : 'buildtime'
              )

              expect(layoutDateFallbackShell).toBe(layoutDateRouteShell)
            })
          }
        })

        describe('and the params accessed in cached non-page function', () => {
          it('resumes a postponed fallback shell', async () => {
            const { browser, response } = await next.browserWithResponse(
              '/with-cached-io/with-static-params/with-suspense/params-not-in-page/bar'
            )

            const lastModified = await browser
              .elementById('last-modified')
              .text()
            expect(lastModified).toInclude('Page /bar')
            expect(lastModified).toInclude('runtime')

            const layout = await browser.elementById('root-layout').text()
            expect(layout).toInclude(isNextDev ? 'runtime' : 'buildtime')

            const headers = response.headers()

            if (isNextStart) {
              expect(headers['x-nextjs-postponed']).toBe('1')
            }
          })
        })

        describe('and params.then/catch/finally passed to a cached function', () => {
          it('resumes a postponed fallback shell', async () => {
            const { browser, response } = await next.browserWithResponse(
              '/with-cached-io/with-static-params/with-suspense/params-then-in-page/bar'
            )

            const lastModified = await browser
              .elementById('last-modified')
              .text()
            expect(lastModified).toInclude('Page /bar')
            expect(lastModified).toInclude('runtime')

            const layout = await browser.elementById('root-layout').text()
            expect(layout).toInclude(isNextDev ? 'runtime' : 'buildtime')

            const headers = response.headers()

            if (isNextStart) {
              expect(headers['x-nextjs-postponed']).toBe('1')
            }
          })
        })

        describe('and the params transformed with an async function and then passed to a cached function', () => {
          it('resumes a postponed fallback shell', async () => {
            const { browser, response } = await next.browserWithResponse(
              '/with-cached-io/with-static-params/with-suspense/params-transformed/bar'
            )

            const lastModified = await browser
              .elementById('last-modified')
              .text()
            expect(lastModified).toInclude('Page /bar')
            expect(lastModified).toInclude('runtime')

            const layout = await browser.elementById('root-layout').text()
            expect(layout).toInclude(isNextDev ? 'runtime' : 'buildtime')

            const headers = response.headers()

            if (isNextStart) {
              expect(headers['x-nextjs-postponed']).toBe('1')
            }
          })
        })
      })

      describe('and the page not wrapped in Suspense', () => {
        describe('and the params accessed in the cached page', () => {
          it('does not resume a postponed fallback shell', async () => {
            const { browser, response } = await next.browserWithResponse(
              '/with-cached-io/with-static-params/without-suspense/params-in-page/bar'
            )

            const lastModified = await browser
              .elementById('last-modified')
              .text()
            expect(lastModified).toInclude('Page /bar')
            expect(lastModified).toInclude('runtime')

            const layout = await browser.elementById('root-layout').text()
            expect(layout).toInclude('runtime')

            const headers = response.headers()

            if (isNextStart) {
              expect(headers['x-nextjs-postponed']).not.toBe('1')
            }
          })

          // TODO: Re-enable as deploy test when (potential) infra issue is
          // resolved.
          if (!isNextDeploy) {
            it('does not render a fallback shell when using a params placeholder', async () => {
              // This should trigger a blocking prerender of the route shell.
              const { browser, response } = await next.browserWithResponse(
                '/with-cached-io/with-static-params/without-suspense/params-in-page/[slug]'
              )

              expect(response.status()).toBe(200)

              // This should render the encoded param in the route shell, and not
              // interpret the param as a fallback param, and subsequently try to
              // render the fallback shell instead, which would fail because of the
              // missing parent suspense boundary.
              const lastModified = await browser
                .elementById('last-modified')
                .text()
              expect(lastModified).toInclude('Page /%5Bslug%5D')
              expect(lastModified).toInclude('runtime')
            })
          }
        })

        describe('and the params accessed in a cached non-page function', () => {
          it('does not resume a postponed fallback shell', async () => {
            const { browser, response } = await next.browserWithResponse(
              '/with-cached-io/with-static-params/without-suspense/params-not-in-page/bar'
            )

            const lastModified = await browser
              .elementById('last-modified')
              .text()
            expect(lastModified).toInclude('Page /bar')
            expect(lastModified).toInclude('runtime')

            const layout = await browser.elementById('root-layout').text()
            expect(layout).toInclude('runtime')

            const headers = response.headers()

            if (isNextStart) {
              expect(headers['x-nextjs-postponed']).not.toBe('1')
            }
          })
        })

        describe('and params.then/catch/finally passed to a cached function', () => {
          it('does not resume a postponed fallback shell', async () => {
            const { browser, response } = await next.browserWithResponse(
              '/with-cached-io/with-static-params/without-suspense/params-then-in-page/bar'
            )

            const lastModified = await browser
              .elementById('last-modified')
              .text()
            expect(lastModified).toInclude('Page /bar')
            expect(lastModified).toInclude('runtime')

            const layout = await browser.elementById('root-layout').text()
            expect(layout).toInclude('runtime')

            const headers = response.headers()

            if (isNextStart) {
              expect(headers['x-nextjs-postponed']).not.toBe('1')
            }
          })
        })

        describe('and the params transformed with an async function and then passed to a cached function', () => {
          it('does not resume a postponed fallback shell', async () => {
            const { browser, response } = await next.browserWithResponse(
              '/with-cached-io/with-static-params/without-suspense/params-transformed/bar'
            )

            const lastModified = await browser
              .elementById('last-modified')
              .text()
            expect(lastModified).toInclude('Page /bar')
            expect(lastModified).toInclude('runtime')

            const layout = await browser.elementById('root-layout').text()
            expect(layout).toInclude('runtime')

            const headers = response.headers()

            if (isNextStart) {
              expect(headers['x-nextjs-postponed']).not.toBe('1')
            }
          })
        })
      })
    })

    describe('without generateStaticParams', () => {
      describe('and the params accessed in the cached page', () => {
        it('resumes a postponed fallback shell', async () => {
          const { browser, response } = await next.browserWithResponse(
            '/with-cached-io/without-static-params/params-in-page/foo'
          )

          const lastModified = await browser.elementById('last-modified').text()
          expect(lastModified).toInclude('Page /foo')
          expect(lastModified).toInclude('runtime')

          const layout = await browser.elementById('root-layout').text()
          expect(layout).toInclude(isNextDev ? 'runtime' : 'buildtime')

          const headers = response.headers()

          if (isNextStart) {
            expect(headers['x-nextjs-postponed']).toBe('1')
          }
        })

        // TODO: To be implemented in NAR-136.
        it.skip('does not produce hydration errors when resuming a fallback shell containing a layout with unused params', async () => {
          const browser = await next.browser(
            '/with-cached-io/without-static-params/params-in-page/bar',
            { pushErrorAsConsoleLog: true }
          )

          // There should also be no hydration errors due to a buildtime date
          // being replaced by a new runtime date.
          await assertNoConsoleErrors(browser)
        })

        // TODO: To be implemented in NAR-136.
        it.skip('includes a cached layout with unused params in the fallback shell', async () => {
          const browser = await next.browser(
            '/with-cached-io/without-static-params/params-in-page/bar'
          )

          const layout = await browser.elementById('layout').text()

          // When prerendered, this should be restored from the RDC during the
          // resume of the fallback shell, so it should be "buildtime". If the
          // layout is unexpectedly a cache miss, then it will be "runtime".
          expect(layout).toInclude(isNextDev ? 'runtime' : 'buildtime')
        })
      })

      describe('and the params accessed in cached non-page function', () => {
        it('resumes a postponed fallback shell', async () => {
          const { browser, response } = await next.browserWithResponse(
            '/with-cached-io/without-static-params/params-not-in-page/foo'
          )

          const lastModified = await browser.elementById('last-modified').text()
          expect(lastModified).toInclude('Page /foo')
          expect(lastModified).toInclude('runtime')

          const layout = await browser.elementById('root-layout').text()
          expect(layout).toInclude(isNextDev ? 'runtime' : 'buildtime')

          const headers = response.headers()

          if (isNextStart) {
            expect(headers['x-nextjs-postponed']).toBe('1')
          }
        })
      })

      describe('and params.then/catch/finally passed to a cached function', () => {
        it('resumes a postponed fallback shell', async () => {
          const { browser, response } = await next.browserWithResponse(
            '/with-cached-io/without-static-params/params-then-in-page/foo'
          )

          const lastModified = await browser.elementById('last-modified').text()
          expect(lastModified).toInclude('Page /foo')
          expect(lastModified).toInclude('runtime')

          const layout = await browser.elementById('root-layout').text()
          expect(layout).toInclude(isNextDev ? 'runtime' : 'buildtime')

          const headers = response.headers()

          if (isNextStart) {
            expect(headers['x-nextjs-postponed']).toBe('1')
          }
        })
      })
    })
  })

  if (isNextStart) {
    it('should not log a HANGING_PROMISE_REJECTION error', async () => {
      expect(next.cliOutput).not.toContain('HANGING_PROMISE_REJECTION')
    })
  }
})
