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
          expect(html).toIncludeRepeated('data-testid="page-bar"', 3)
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
})
