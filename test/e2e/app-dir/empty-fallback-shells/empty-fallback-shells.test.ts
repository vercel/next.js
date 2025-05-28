import { nextTestSetup } from 'e2e-utils'

describe('empty-fallback-shells', () => {
  const { next, isNextDev, isNextDeploy, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  describe('without IO', () => {
    it('should start and not postpone the response', async () => {
      const res = await next.fetch('/without-io/world')
      const html = await res.text()
      expect(html).toContain('hello-world')

      if (isNextDeploy) {
        expect(res.headers.get('x-matched-path')).toBe('/without-io/[slug]')
      }

      // If we didn't use the fallback shell, then we didn't postpone the
      // response and therefore shouldn't have sent the postponed header.
      expect(res.headers.get('x-nextjs-postponed')).not.toBe('1')
    })
  })

  describe('with cached IO', () => {
    describe('and the page wrapped in Suspense', () => {
      describe('and the params accessed in the cached page', () => {
        it('resumes a postponed fallback shell', async () => {
          const res = await next.fetch(
            '/with-cached-io/with-suspense/params-in-page/bar'
          )

          const html = await res.text()
          expect(html).toContain('page-bar')

          if (isNextDev) {
            expect(html).toContain('layout-runtime')
          } else {
            expect(html).toContain('layout-buildtime')
          }

          if (isNextDeploy) {
            expect(res.headers.get('x-matched-path')).toBe(
              '/with-cached-io/with-suspense/params-in-page/[slug]'
            )
          } else if (isNextStart) {
            expect(res.headers.get('x-nextjs-postponed')).toBe('1')
          }
        })
      })

      describe('and the params accessed in cached non-page function', () => {
        it('resumes a postponed fallback shell', async () => {
          const res = await next.fetch(
            '/with-cached-io/with-suspense/params-not-in-page/bar'
          )

          const html = await res.text()
          expect(html).toContain('page-bar')

          if (isNextDev) {
            expect(html).toContain('layout-runtime')
          } else {
            expect(html).toContain('layout-buildtime')
          }

          if (isNextDeploy) {
            expect(res.headers.get('x-matched-path')).toBe(
              '/with-cached-io/with-suspense/params-not-in-page/[slug]'
            )
          } else if (isNextStart) {
            expect(res.headers.get('x-nextjs-postponed')).toBe('1')
          }
        })
      })

      describe('and params.then/catch/finally passed to a cached function', () => {
        it('resumes a postponed fallback shell', async () => {
          const res = await next.fetch(
            '/with-cached-io/with-suspense/params-then-in-page/bar'
          )

          const html = await res.text()
          expect(html).toIncludeRepeated('data-testid="page-bar"', 4)

          if (isNextDev) {
            expect(html).toContain('layout-runtime')
          } else {
            expect(html).toContain('layout-buildtime')
          }

          if (isNextDeploy) {
            expect(res.headers.get('x-matched-path')).toBe(
              '/with-cached-io/with-suspense/params-then-in-page/[slug]'
            )
          } else if (isNextStart) {
            expect(res.headers.get('x-nextjs-postponed')).toBe('1')
          }
        })
      })
    })

    describe('and the page not wrapped in Suspense', () => {
      describe('and the params accessed in the cached page', () => {
        it('does not resume a postponed fallback shell', async () => {
          const res = await next.fetch(
            '/with-cached-io/without-suspense/params-in-page/bar'
          )

          const html = await res.text()
          expect(html).toContain('page-bar')
          expect(html).toContain('layout-runtime')

          if (isNextDeploy) {
            expect(res.headers.get('x-matched-path')).toBe(
              '/with-cached-io/without-suspense/params-in-page/[slug]'
            )
          } else {
            expect(res.headers.get('x-nextjs-postponed')).not.toBe('1')
          }
        })

        it('does not render a fallback shell when using a params placeholder', async () => {
          // This should trigger a blocking prerender of the route shell.
          const res = await next.fetch(
            '/with-cached-io/without-suspense/params-in-page/[slug]'
          )

          expect(res.status).toBe(200)

          const html = await res.text()

          // This should render the encoded param in the route shell, and not
          // interpret the param as a fallback param, and subsequently try to
          // render the fallback shell instead, which would fail because of the
          // missing parent suspense boundary.
          expect(html).toContain('page-%5Bslug%5D')
        })
      })

      describe('and the params accessed in a cached non-page function', () => {
        it('does not resume a postponed fallback shell', async () => {
          const res = await next.fetch(
            '/with-cached-io/without-suspense/params-not-in-page/bar'
          )

          const html = await res.text()
          expect(html).toContain('page-bar')
          expect(html).toContain('layout-runtime')

          if (isNextDeploy) {
            expect(res.headers.get('x-matched-path')).toBe(
              '/with-cached-io/without-suspense/params-not-in-page/[slug]'
            )
          } else {
            expect(res.headers.get('x-nextjs-postponed')).not.toBe('1')
          }
        })
      })

      describe('and params.then/catch/finally passed to a cached function', () => {
        it('does not resume a postponed fallback shell', async () => {
          const res = await next.fetch(
            '/with-cached-io/without-suspense/params-then-in-page/bar'
          )

          const html = await res.text()
          expect(html).toIncludeRepeated('data-testid="page-bar"', 4)
          expect(html).toContain('layout-runtime')

          if (isNextDeploy) {
            expect(res.headers.get('x-matched-path')).toBe(
              '/with-cached-io/without-suspense/params-then-in-page/[slug]'
            )
          } else {
            expect(res.headers.get('x-nextjs-postponed')).not.toBe('1')
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
