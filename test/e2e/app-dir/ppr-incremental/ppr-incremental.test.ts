import { nextTestSetup, isNextDev } from 'e2e-utils'
import type { Route as PlaywrightRoute, Page } from 'playwright'

type Route = {
  route: string
  enabled: boolean
  pathnames: string[]
}

const routes: ReadonlyArray<Route> = [
  {
    route: '/',
    pathnames: ['/'],
    enabled: false,
  },
  {
    route: '/disabled',
    pathnames: ['/disabled'],
    enabled: false,
  },
  {
    route: '/enabled',
    pathnames: ['/enabled'],
    enabled: true,
  },
  {
    route: '/omitted/[slug]',
    pathnames: ['/omitted/a', '/omitted/b', '/omitted/c'],
    enabled: false,
  },
  {
    route: '/omitted/disabled/[slug]',
    pathnames: [
      '/omitted/disabled/a',
      '/omitted/disabled/b',
      '/omitted/disabled/c',
    ],
    enabled: false,
  },
  {
    route: '/omitted/enabled/[slug]',
    pathnames: [
      '/omitted/enabled/a',
      '/omitted/enabled/b',
      '/omitted/enabled/c',
    ],
    enabled: true,
  },
  {
    route: '/dynamic/[slug]',
    pathnames: ['/dynamic/a', '/dynamic/b', '/dynamic/c'],
    enabled: false,
  },
  {
    route: '/dynamic/disabled/[slug]',
    pathnames: [
      '/dynamic/disabled/a',
      '/dynamic/disabled/b',
      '/dynamic/disabled/c',
    ],
    enabled: false,
  },
  {
    route: '/dynamic/enabled/[slug]',
    pathnames: [
      '/dynamic/enabled/a',
      '/dynamic/enabled/b',
      '/dynamic/enabled/c',
    ],
    enabled: true,
  },
  {
    route: '/nested/enabled/[slug]',
    pathnames: ['/nested/enabled/a', '/nested/enabled/b', '/nested/enabled/c'],
    enabled: true,
  },
  {
    route: '/nested/enabled/disabled/[slug]',
    pathnames: [
      '/nested/enabled/disabled/a',
      '/nested/enabled/disabled/b',
      '/nested/enabled/disabled/c',
    ],
    enabled: false,
  },
  {
    route: '/nested/enabled/enabled/[slug]',
    pathnames: [
      '/nested/enabled/enabled/a',
      '/nested/enabled/enabled/b',
      '/nested/enabled/enabled/c',
    ],
    enabled: true,
  },
  {
    route: '/nested/disabled/[slug]',
    pathnames: [
      '/nested/disabled/a',
      '/nested/disabled/b',
      '/nested/disabled/c',
    ],
    enabled: false,
  },
  {
    route: '/nested/disabled/disabled/[slug]',
    pathnames: [
      '/nested/disabled/disabled/a',
      '/nested/disabled/disabled/b',
      '/nested/disabled/disabled/c',
    ],
    enabled: false,
  },
  {
    route: '/nested/disabled/enabled/[slug]',
    pathnames: [
      '/nested/disabled/enabled/a',
      '/nested/disabled/enabled/b',
      '/nested/disabled/enabled/c',
    ],
    enabled: true,
  },
]

describe('ppr-incremental', () => {
  // We don't perform static builds and partial prerendering in development
  // mode.
  if (isNextDev) return it.skip('should skip next dev', () => {})

  const { next } = nextTestSetup({ files: __dirname })

  describe('ppr disabled', () => {
    describe.each(routes.filter(({ enabled }) => !enabled))(
      '$route',
      ({ pathnames }) => {
        // When PPR is disabled, we won't include the fallback in the initial
        // load because the dynamic render will not suspend.
        describe('should render without the fallback in the initial load', () => {
          it.each(pathnames)('%s', async (pathname) => {
            const $ = await next.render$(pathname)
            expect($('#fallback')).toHaveLength(0)
          })
        })

        describe('should not have the dynamic content hidden', () => {
          it.each(pathnames)('%s', async (pathname) => {
            const $ = await next.render$(pathname)
            expect($('#dynamic')).toHaveLength(1)
            expect($('#dynamic').closest('[hidden]')).toHaveLength(0)
          })
        })
      }
    )

    it('should not trigger a dynamic request for static pages', async () => {
      let rscRequests = []
      const browser = await next.browser('/', {
        beforePageLoad(page: Page) {
          page.route('**/static*', async (route: PlaywrightRoute) => {
            const request = route.request()
            const headers = await request.allHeaders()
            const url = new URL(request.url())

            if (headers['rsc'] === '1') {
              rscRequests.push(url.pathname)
              await route.continue()
            }
          })
        },
      })

      await browser.waitForIdleNetwork()
      // we should see an RSC request for the initial prefetch to the static page
      expect(rscRequests).toEqual(expect.arrayContaining(['/static']))

      rscRequests = []

      await browser.elementByCss('[href="/static"]').click()
      await browser.waitForElementByCss('#static-page')
      expect(rscRequests.length).toBe(0)
    })
  })

  describe('ppr enabled', () => {
    describe.each(routes.filter(({ enabled }) => enabled))(
      '$route',
      ({ pathnames }) => {
        // When PPR is enabled, we will always include the fallback in the
        // initial load because the dynamic component uses `unstable_noStore()`.
        describe('should render with the fallback in the initial load', () => {
          it.each(pathnames)('%s', async (pathname) => {
            const $ = await next.render$(pathname)
            expect($('#fallback')).toHaveLength(1)
          })
        })

        describe('should have the dynamic content hidden', () => {
          it.each(pathnames)('%s', async (pathname) => {
            const $ = await next.render$(pathname)
            expect($('#dynamic')).toHaveLength(1)
            expect($('#dynamic').closest('[hidden]')).toHaveLength(1)
          })
        })
      }
    )
  })
})
