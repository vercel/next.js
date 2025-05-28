import { nextTestSetup } from 'e2e-utils'

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
    describe('and the page wrapped in Suspense', () => {
      describe('and the params accessed in the cached page', () => {
        it('resumes a postponed fallback shell', async () => {
          const { browser, response } = await next.browserWithResponse(
            '/with-cached-io/with-suspense/params-in-page/bar'
          )

          const lastModified = await browser.elementById('last-modified').text()
          expect(lastModified).toInclude('Page /bar')
          expect(lastModified).toInclude('runtime')

          const layout = await browser.elementById('layout').text()
          expect(layout).toInclude(isNextDev ? 'runtime' : 'buildtime')

          const headers = response.headers()

          if (isNextDeploy) {
            expect(headers['x-matched-path']).toBe(
              '/with-cached-io/with-suspense/params-in-page/[slug]'
            )
          } else if (isNextStart) {
            expect(headers['x-nextjs-postponed']).toBe('1')
          }
        })

        // TODO: Activate for deploy tests once background revalidation for
        // prerendered pages is not triggered anymore on the first visit.
        if (!isNextDeploy) {
          it('shares a cached layout between a prerendered route shell and the fallback shell', async () => {
            // `/foo` was prerendered
            let $ = await next.render$(
              '/with-cached-io/with-suspense/params-in-page/foo'
            )

            const selector = `[data-testid="layout-${isNextDev ? 'runtime' : 'buildtime'}"]`
            const layoutDateRouteShell = $(selector).text()

            // Sanity check that we've selected the correct element.
            expect(layoutDateRouteShell).toStartWith('Layout:')

            // `/bar` was not prerendered, so the fallback shell is used
            $ = await next.render$(
              '/with-cached-io/with-suspense/params-in-page/bar'
            )

            const layoutDateFallbackShell = $(selector).text()

            expect(layoutDateFallbackShell).toBe(layoutDateRouteShell)
          })
        }
      })

      describe('and the params accessed in cached non-page function', () => {
        it('resumes a postponed fallback shell', async () => {
          const { browser, response } = await next.browserWithResponse(
            '/with-cached-io/with-suspense/params-not-in-page/bar'
          )

          const lastModified = await browser.elementById('last-modified').text()
          expect(lastModified).toInclude('Page /bar')
          expect(lastModified).toInclude('runtime')

          const layout = await browser.elementById('layout').text()
          expect(layout).toInclude(isNextDev ? 'runtime' : 'buildtime')

          const headers = response.headers()

          if (isNextDeploy) {
            expect(headers['x-matched-path']).toBe(
              '/with-cached-io/with-suspense/params-not-in-page/[slug]'
            )
          } else if (isNextStart) {
            expect(headers['x-nextjs-postponed']).toBe('1')
          }
        })
      })

      describe('and params.then/catch/finally passed to a cached function', () => {
        it('resumes a postponed fallback shell', async () => {
          const { browser, response } = await next.browserWithResponse(
            '/with-cached-io/with-suspense/params-then-in-page/bar'
          )

          const lastModified = await browser.elementById('last-modified').text()
          expect(lastModified).toInclude('Page /bar')
          expect(lastModified).toInclude('runtime')

          const layout = await browser.elementById('layout').text()
          expect(layout).toInclude(isNextDev ? 'runtime' : 'buildtime')

          const headers = response.headers()

          if (isNextDeploy) {
            expect(headers['x-matched-path']).toBe(
              '/with-cached-io/with-suspense/params-then-in-page/[slug]'
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
            '/with-cached-io/without-suspense/params-in-page/bar'
          )

          const lastModified = await browser.elementById('last-modified').text()
          expect(lastModified).toInclude('Page /bar')
          expect(lastModified).toInclude('runtime')

          const layout = await browser.elementById('layout').text()
          expect(layout).toInclude('runtime')

          const headers = response.headers()

          if (isNextDeploy) {
            expect(headers['x-matched-path']).toBe(
              '/with-cached-io/without-suspense/params-in-page/[slug]'
            )
          } else if (isNextStart) {
            expect(headers['x-nextjs-postponed']).not.toBe('1')
          }
        })

        it('does not render a fallback shell when using a params placeholder', async () => {
          // This should trigger a blocking prerender of the route shell.
          const { browser, response } = await next.browserWithResponse(
            '/with-cached-io/without-suspense/params-in-page/[slug]'
          )

          expect(response.status()).toBe(200)

          // This should render the encoded param in the route shell, and not
          // interpret the param as a fallback param, and subsequently try to
          // render the fallback shell instead, which would fail because of the
          // missing parent suspense boundary.
          const lastModified = await browser.elementById('last-modified').text()
          expect(lastModified).toInclude('Page /%5Bslug%5D')
          expect(lastModified).toInclude('runtime')
        })
      })

      describe('and the params accessed in a cached non-page function', () => {
        it('does not resume a postponed fallback shell', async () => {
          const { browser, response } = await next.browserWithResponse(
            '/with-cached-io/without-suspense/params-not-in-page/bar'
          )

          const lastModified = await browser.elementById('last-modified').text()
          expect(lastModified).toInclude('Page /bar')
          expect(lastModified).toInclude('runtime')

          const layout = await browser.elementById('layout').text()
          expect(layout).toInclude('runtime')

          const headers = response.headers()

          if (isNextDeploy) {
            expect(headers['x-matched-path']).toBe(
              '/with-cached-io/without-suspense/params-not-in-page/[slug]'
            )
          } else if (isNextStart) {
            expect(headers['x-nextjs-postponed']).not.toBe('1')
          }
        })
      })

      describe('and params.then/catch/finally passed to a cached function', () => {
        it('does not resume a postponed fallback shell', async () => {
          const { browser, response } = await next.browserWithResponse(
            '/with-cached-io/without-suspense/params-then-in-page/bar'
          )

          const lastModified = await browser.elementById('last-modified').text()
          expect(lastModified).toInclude('Page /bar')
          expect(lastModified).toInclude('runtime')

          const layout = await browser.elementById('layout').text()
          expect(layout).toInclude('runtime')

          const headers = response.headers()

          if (isNextDeploy) {
            expect(headers['x-matched-path']).toBe(
              '/with-cached-io/without-suspense/params-then-in-page/[slug]'
            )
          } else if (isNextStart) {
            expect(headers['x-nextjs-postponed']).not.toBe('1')
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
