import { createNextDescribe } from 'e2e-utils'

const pages = [
  { pathname: '/', dynamic: true },
  { pathname: '/nested/a', dynamic: true, revalidate: 60 },
  { pathname: '/nested/b', dynamic: true, revalidate: 60 },
  { pathname: '/nested/c', dynamic: true, revalidate: 60 },
  { pathname: '/on-demand/a', dynamic: true },
  { pathname: '/on-demand/b', dynamic: true },
  { pathname: '/on-demand/c', dynamic: true },
  { pathname: '/loading/a', dynamic: true, revalidate: 60 },
  { pathname: '/loading/b', dynamic: true, revalidate: 60 },
  { pathname: '/loading/c', dynamic: true, revalidate: 60 },
  { pathname: '/static', dynamic: false },
  { pathname: '/no-suspense', dynamic: true },
  { pathname: '/no-suspense/nested/a', dynamic: true },
  { pathname: '/no-suspense/nested/b', dynamic: true },
  { pathname: '/no-suspense/nested/c', dynamic: true },
  // TODO: uncomment when we've fixed the 404 case for force-dynamic pages
  // { pathname: '/dynamic/force-dynamic', dynamic: 'force-dynamic' },
  {
    pathname: '/dynamic/force-static',
    dynamic: 'force-static',
    revalidate: 60,
  },
]

createNextDescribe(
  'ppr-full',
  {
    files: __dirname,
  },
  ({ next, isNextDev, isNextStart, isNextDeploy }) => {
    describe('dynamic pages should resume', () => {
      it.each(pages.filter((p) => p.dynamic === true))(
        'should resume $pathname',
        async ({ pathname }) => {
          const expected = `${Date.now()}:${Math.random()}`
          const res = await next.fetch(pathname, {
            headers: { 'X-Test-Input': expected },
          })
          expect(res.status).toEqual(200)
          expect(res.headers.get('content-type')).toEqual(
            'text/html; charset=utf-8'
          )
          const html = await res.text()
          expect(html).toContain(expected)
          expect(html).toContain('</html>')
        }
      )
    })

    if (!isNextDev) {
      describe('prefetch RSC payloads should return', () => {
        it.each(pages)(
          'should prefetch $pathname',
          async ({ pathname, dynamic, revalidate }) => {
            const unexpected = `${Date.now()}:${Math.random()}`
            const res = await next.fetch(pathname, {
              headers: {
                RSC: '1',
                'Next-Router-Prefetch': '1',
                'X-Test-Input': unexpected,
              },
            })
            expect(res.status).toEqual(200)
            expect(res.headers.get('content-type')).toEqual('text/x-component')

            const cache = res.headers.get('cache-control')

            // cache header handling is different when in minimal mode
            if (isNextDeploy) {
              expect(cache).toContain('public')
              expect(cache).toContain('must-revalidate')
            } else {
              expect(cache).toContain(`s-maxage=${revalidate || '31536000'}`)
              expect(cache).toContain('stale-while-revalidate')
            }

            // Expect that static RSC prefetches do not contain the dynamic text.
            const text = await res.text()
            expect(text).not.toContain(unexpected)

            if (dynamic === true) {
              // The dynamic component will contain the text "needle" if it was
              // rendered using dynamic content.
              expect(text).not.toContain('needle')
              expect(res.headers.get('X-NextJS-Postponed')).toEqual('1')
            } else {
              if (dynamic !== false) {
                expect(text).toContain('needle')
              }

              expect(res.headers.has('X-NextJS-Postponed')).toEqual(false)
            }
          }
        )
      })

      describe('dynamic RSC payloads should return', () => {
        it.each(pages)(
          'should fetch $pathname',
          async ({ pathname, dynamic }) => {
            const expected = `${Date.now()}:${Math.random()}`
            const res = await next.fetch(pathname, {
              headers: { RSC: '1', 'X-Test-Input': expected },
            })
            expect(res.status).toEqual(200)
            expect(res.headers.get('content-type')).toEqual('text/x-component')
            expect(res.headers.has('X-NextJS-Postponed')).toEqual(false)

            const cache = res.headers.get('cache-control')

            // cache header handling is different when in minimal mode
            if (isNextDeploy) {
              expect(cache).toContain('private')
              expect(cache).toContain('no-store')
              expect(cache).toContain('no-cache')
              expect(cache).toContain('max-age=0')
              expect(cache).toContain('must-revalidate')
            } else {
              expect(cache).toContain('s-maxage=1')
              expect(cache).toContain('stale-while-revalidate')
            }

            const text = await res.text()

            if (dynamic !== false) {
              expect(text).toContain('needle')
            }

            if (dynamic === true) {
              // Expect that dynamic RSC prefetches do contain the dynamic text.
              expect(text).toContain(expected)
            } else {
              // Expect that dynamic RSC prefetches do not contain the dynamic text
              // when we're forced static.
              expect(text).not.toContain(expected)
            }
          }
        )
      })
    }
  }
)
