import NextServer from 'next/dist/server/next-server'
import { loadComponents } from 'next/dist/server/load-components'
import { LazyModule } from 'next/dist/server/lib/lazy-module'
import { RouteKind } from 'next/dist/server/route-kind'

jest.mock('next/dist/server/load-components', () => ({
  loadComponents: jest.fn(),
}))

const mockedLoadComponents = jest.mocked(loadComponents)

describe('route handler startup preloading', () => {
  afterEach(() => {
    mockedLoadComponents.mockReset()
  })

  it.each(['async rejection', 'sync throw'])(
    'patches fetch, awaits userland, and continues after a %s',
    async (failureKind) => {
      const events: string[] = []
      const failure = new Error('userland initialization failed')
      const load = jest.fn(() => {
        events.push('failing:load')
        if (failureKind === 'sync throw') {
          throw failure
        }
        return Promise.resolve().then(() => {
          events.push('failing:reject')
          throw failure
        })
      })
      const failedUserland = new LazyModule(load, jest.fn())
      const ensureFailedUserland = jest.fn(() =>
        failedUserland.waitUntilLoaded()
      )
      const ensureHealthyUserland = jest.fn(async () => {
        events.push('healthy:load')
        await Promise.resolve()
        events.push('healthy:loaded')
      })
      const ensurePageUserland = jest.fn()
      const entries = {
        '/failing/route': {
          patchFetch: () => events.push('failing:patch'),
          routeModule: {
            definition: { kind: RouteKind.APP_ROUTE },
            ensureUserland: ensureFailedUserland,
          },
        },
        '/healthy/route': {
          patchFetch: () => events.push('healthy:patch'),
          routeModule: {
            definition: { kind: RouteKind.APP_ROUTE },
            ensureUserland: ensureHealthyUserland,
          },
        },
        '/page': {
          patchFetch: () => events.push('page:patch'),
          routeModule: {
            definition: { kind: RouteKind.APP_PAGE },
            ensureUserland: ensurePageUserland,
          },
        },
      }
      mockedLoadComponents.mockImplementation(async ({ page, isAppPath }) => {
        events.push(`entry:${page}`)
        return {
          ComponentMod: isAppPath ? entries[page as keyof typeof entries] : {},
        } as Awaited<ReturnType<typeof loadComponents>>
      })

      // Exercise the real preloader with an explicitly ordered manifest, without
      // starting a server or relying on the bundler's manifest ordering.
      const server = {
        prepare: jest.fn(async () => {}),
        getPagesManifest: () => ({ '/control': 'control.js' }),
        getAppPathsManifest: () =>
          Object.fromEntries(Object.keys(entries).map((page) => [page, page])),
        loadCustomCacheHandlers: jest.fn(async () => {}),
        distDir: '.next',
        isDev: false,
        sriEnabled: false,
      }
      await expect(
        NextServer.prototype.unstable_preloadEntries.call(
          server as unknown as NextServer
        )
      ).resolves.toBeUndefined()

      expect(events).toEqual([
        'entry:/control',
        'entry:/failing/route',
        'failing:patch',
        'failing:load',
        ...(failureKind === 'async rejection' ? ['failing:reject'] : []),
        'entry:/healthy/route',
        'healthy:patch',
        'healthy:load',
        'healthy:loaded',
        'entry:/page',
        'page:patch',
      ])
      expect(ensureFailedUserland).toHaveBeenCalledTimes(1)
      expect(ensureHealthyUserland).toHaveBeenCalledTimes(1)
      expect(ensurePageUserland).not.toHaveBeenCalled()

      if (failureKind === 'async rejection') {
        // Preloading must not reset the existing cached rejection.
        await expect(failedUserland.waitUntilLoaded()).rejects.toBe(failure)
        expect(load).toHaveBeenCalledTimes(1)
      }
    }
  )
})
