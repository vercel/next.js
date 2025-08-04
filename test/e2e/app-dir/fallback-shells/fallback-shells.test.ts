import { nextTestSetup } from 'e2e-utils'
import { assertNoConsoleErrors } from 'next-test-utils'

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

      if (isNextDeploy) {
        expect(headers['x-matched-path']).toBe('/without-io/[slug]')
      }

      // If we didn't use the fallback shell, then we didn't postpone the
      // response and therefore shouldn't have sent the postponed header.
      expect(headers['x-nextjs-postponed']).not.toBe('1')
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

            if (isNextDeploy) {
              expect(headers['x-matched-path']).toBe(
                '/with-cached-io/with-static-params/with-suspense/params-in-page/[slug]'
              )
            } else if (isNextStart) {
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

              // `/bar` was not prerendered, and thus resumes the fallback shell.
              await browser.loadPage(
                new URL(
                  '/with-cached-io/with-static-params/with-suspense/params-in-page/bar',
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

            if (isNextDeploy) {
              expect(headers['x-matched-path']).toBe(
                '/with-cached-io/with-static-params/with-suspense/params-not-in-page/[slug]'
              )
            } else if (isNextStart) {
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

            if (isNextDeploy) {
              expect(headers['x-matched-path']).toBe(
                '/with-cached-io/with-static-params/with-suspense/params-then-in-page/[slug]'
              )
            } else if (isNextStart) {
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

            if (isNextDeploy) {
              expect(headers['x-matched-path']).toBe(
                '/with-cached-io/with-static-params/with-suspense/params-transformed/[slug]'
              )
            } else if (isNextStart) {
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

            if (isNextDeploy) {
              expect(headers['x-matched-path']).toBe(
                '/with-cached-io/with-static-params/without-suspense/params-in-page/[slug]'
              )
            } else if (isNextStart) {
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

            if (isNextDeploy) {
              expect(headers['x-matched-path']).toBe(
                '/with-cached-io/with-static-params/without-suspense/params-not-in-page/[slug]'
              )
            } else if (isNextStart) {
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

            if (isNextDeploy) {
              expect(headers['x-matched-path']).toBe(
                '/with-cached-io/with-static-params/without-suspense/params-then-in-page/[slug]'
              )
            } else if (isNextStart) {
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

            if (isNextDeploy) {
              expect(headers['x-matched-path']).toBe(
                '/with-cached-io/with-static-params/without-suspense/params-transformed/[slug]'
              )
            } else if (isNextStart) {
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

          if (isNextDeploy) {
            expect(headers['x-matched-path']).toBe(
              '/with-cached-io/without-static-params/params-in-page/[slug]'
            )
          } else if (isNextStart) {
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

          if (isNextDeploy) {
            expect(headers['x-matched-path']).toBe(
              '/with-cached-io/without-static-params/params-not-in-page/[slug]'
            )
          } else if (isNextStart) {
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

          if (isNextDeploy) {
            expect(headers['x-matched-path']).toBe(
              '/with-cached-io/without-static-params/params-then-in-page/[slug]'
            )
          } else if (isNextStart) {
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
