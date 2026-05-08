import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type * as Playwright from 'playwright'

describe('offlineNavigations deploy-safe runtime behavior', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    it('skipped in dev', () => {})
    return
  }

  async function waitForOfflineNavigationServiceWorker(
    browser: Awaited<ReturnType<typeof next.browser>>,
    page: Playwright.Page
  ) {
    await retry(
      async () => {
        const state = await browser.eval(async () => {
          if (!('serviceWorker' in navigator)) {
            return {
              controlled: false,
              hasActiveRegistration: false,
            }
          }

          const registrations = await navigator.serviceWorker.getRegistrations()
          return {
            controlled: Boolean(navigator.serviceWorker.controller),
            hasActiveRegistration: registrations.some(
              (registration) =>
                registration.scope.endsWith('/docs/') &&
                registration.active !== null
            ),
          }
        })

        expect(state.hasActiveRegistration).toBe(true)
      },
      10000,
      500
    )

    if (
      !(await browser.eval(() => Boolean(navigator.serviceWorker.controller)))
    ) {
      await page.reload({ waitUntil: 'domcontentloaded' })
    }

    await retry(
      async () => {
        expect(
          await browser.eval(() => Boolean(navigator.serviceWorker.controller))
        ).toBe(true)
      },
      10000,
      500
    )
  }

  async function readOfflineNavigationCacheState(
    browser: Awaited<ReturnType<typeof next.browser>>
  ) {
    return browser.eval(async () => {
      const cacheNames = (await caches.keys()).filter((cacheName) =>
        cacheName.startsWith('next-offline-navigation-v1:')
      )
      const entries: Array<{
        cacheName: string
        pathname: string
        search: string
      }> = []

      for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName)
        const requests = await cache.keys()

        for (const request of requests) {
          const url = new URL(request.url)
          entries.push({
            cacheName,
            pathname: url.pathname,
            search: url.search,
          })
        }
      }

      return { cacheNames, entries }
    })
  }

  it('registers the service worker and serves current-build assets from Cache Storage', async () => {
    let page: Playwright.Page | undefined
    try {
      const serviceWorkerResponse = await next.fetch(
        `/docs/_next/static/_offline-navigation-service-worker.js${next.getDeploymentIdQuery()}`
      )
      expect(serviceWorkerResponse.status).toBe(200)
      expect(serviceWorkerResponse.headers.get('service-worker-allowed')).toBe(
        '/docs/'
      )

      const browser = await next.browser('/docs', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      await waitForOfflineNavigationServiceWorker(browser, page!)
      expect(await browser.elementById('offline-status').text()).toBe('online')

      await retry(async () => {
        const registration = await browser.eval(async () => {
          if (!('serviceWorker' in navigator)) {
            return null
          }

          const registrations = await navigator.serviceWorker.getRegistrations()
          const registration = registrations.find((entry) =>
            entry.scope.endsWith('/docs/')
          )

          if (!registration) {
            return null
          }

          const scriptURL = new URL(registration.active?.scriptURL ?? '')
          return {
            pathname: scriptURL.pathname,
            search: scriptURL.search,
            scope: registration.scope,
          }
        })

        expect(registration).toEqual({
          pathname: '/docs/_next/static/_offline-navigation-service-worker.js',
          search: next.getDeploymentIdQuery(),
          scope: `${next.url}/docs/`,
        })
      })

      const staticAssetPathname = await retry(async () => {
        const cacheState = await readOfflineNavigationCacheState(browser)
        expect(cacheState.cacheNames).toEqual(
          expect.arrayContaining([
            expect.stringMatching(/^next-offline-navigation-v1:/),
          ])
        )
        expect(cacheState.entries).toEqual(
          expect.arrayContaining([
            {
              cacheName: expect.stringMatching(/^next-offline-navigation-v1:/),
              pathname: expect.stringMatching(
                /^\/docs\/_next\/static\/.+\/_offline-navigation-fallback\.html$/
              ),
              search: '',
            },
            {
              cacheName: expect.stringMatching(/^next-offline-navigation-v1:/),
              pathname: expect.stringMatching(
                /^\/app-assets\/_next\/static\/(?:immutable\/)?chunks\/.+\.js$/
              ),
              search: '',
            },
          ])
        )

        return cacheState.entries.find((entry) =>
          /^\/app-assets\/_next\/static\/(?:immutable\/)?chunks\/.+\.js$/.test(
            entry.pathname
          )
        )!.pathname
      })

      await page!.context().setOffline(true)
      const assetResponse = await browser.eval(async (pathname) => {
        const response = await fetch(`${pathname}?dpl=offline-navigation-test`)
        return {
          ok: response.ok,
          status: response.status,
        }
      }, staticAssetPathname)
      expect(assetResponse).toEqual({
        ok: true,
        status: 200,
      })
      await page!.context().setOffline(false)
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
    }
  })
})
