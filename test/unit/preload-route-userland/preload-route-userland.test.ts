import NextServer from 'next/dist/server/next-server'
import { loadComponents } from 'next/dist/server/load-components'
import { defaultConfig } from 'next/dist/server/config-shared'
import { LazyModule } from 'next/dist/server/lib/lazy-module'
import { RouteKind } from 'next/dist/server/route-kind'

jest.mock('next/dist/server/load-components', () => ({
  loadComponents: jest.fn(),
}))

// Exercise NextServer's actual constructor gates without starting BaseServer's
// filesystem, routing, and process-global setup.
jest.mock('next/dist/server/base-server', () => ({
  __esModule: true,
  default: class {
    nextConfig: unknown
    serverOptions: unknown
    minimalMode: boolean | undefined
    distDir = '.next'
    renderOpts = {}
    prepare = jest.fn(async () => {})

    constructor(options: { conf: unknown; minimalMode?: boolean }) {
      this.nextConfig = options.conf
      this.serverOptions = options
      this.minimalMode = options.minimalMode
    }
  },
}))
jest.mock('next/dist/server/load-manifest.external', () => ({
  ...jest.requireActual('next/dist/server/load-manifest.external'),
  loadManifest: jest.fn(() => ({})),
}))
jest.mock(
  'next/dist/server/node-environment-extensions/global-behaviors',
  () => ({
    installGlobalBehaviors: jest.fn(),
  })
)
jest.mock(
  'next/dist/server/node-environment-extensions/process-error-handlers',
  () => ({ installProcessErrorHandlers: jest.fn() })
)

const mockedLoadComponents = jest.mocked(loadComponents)

type Entry = {
  patchFetch: () => void
  routeModule: {
    definition: { kind: RouteKind }
    ensureUserland: () => Promise<void>
  }
}

async function preload(entries: Record<string, Entry>, events: string[]) {
  mockedLoadComponents.mockImplementation(async ({ page, isAppPath }) => {
    events.push(`entry:${page}`)
    return {
      ComponentMod: isAppPath ? entries[page] : {},
    } as Awaited<ReturnType<typeof loadComponents>>
  })
  // Explicit manifest ordering makes continuation assertions deterministic.
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
  for (const [options] of mockedLoadComponents.mock.calls) {
    expect(options.needsManifestsForLegacyReasons).toBe(false)
  }
}

describe('App Router startup preloading', () => {
  beforeEach(() => {
    mockedLoadComponents.mockReset()
  })

  it.each(['async rejection', 'sync throw'])(
    'patches fetch, awaits userland, and continues after a %s',
    async (failureKind) => {
      const events: string[] = []
      const failure = new Error('userland initialization failed')
      const load = jest.fn(() => {
        events.push('failing:load')
        if (failureKind === 'sync throw') throw failure
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
      const ensurePageUserland = jest.fn(async () => {
        events.push('page:load')
        await Promise.resolve()
        events.push('page:loaded')
      })
      await preload(
        {
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
          '/%5Fencoded/custom-entry': {
            patchFetch: () => events.push('page:patch'),
            routeModule: {
              definition: { kind: RouteKind.APP_PAGE },
              ensureUserland: ensurePageUserland,
            },
          },
        },
        events
      )
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
        'entry:/%5Fencoded/custom-entry',
        'page:patch',
        'page:load',
        'page:loaded',
      ])
      expect(ensureFailedUserland).toHaveBeenCalledTimes(1)
      expect(ensureHealthyUserland).toHaveBeenCalledTimes(1)
      expect(ensurePageUserland).toHaveBeenCalledTimes(1)
      if (failureKind === 'async rejection') {
        // Preloading must not reset the existing cached rejection.
        await expect(failedUserland.waitUntilLoaded()).rejects.toBe(failure)
        expect(load).toHaveBeenCalledTimes(1)
      }
    }
  )

  it('continues after a failing page initialization', async () => {
    const events: string[] = []
    const failure = new Error('page initialization failed')
    const failing = jest.fn(async () => {
      throw failure
    })
    const healthy = jest.fn(async () => {
      events.push('healthy:loaded')
    })
    await preload(
      {
        '/failing/page': {
          patchFetch: () => events.push('failing:patch'),
          routeModule: {
            definition: { kind: RouteKind.APP_PAGE },
            ensureUserland: failing,
          },
        },
        '/healthy/page': {
          patchFetch: () => events.push('healthy:patch'),
          routeModule: {
            definition: { kind: RouteKind.APP_PAGE },
            ensureUserland: healthy,
          },
        },
      },
      events
    )
    expect(failing).toHaveBeenCalledTimes(1)
    expect(healthy).toHaveBeenCalledTimes(1)
    expect(events).toEqual([
      'entry:/control',
      'entry:/failing/page',
      'failing:patch',
      'entry:/healthy/page',
      'healthy:patch',
      'healthy:loaded',
    ])
  })

  it.each([
    { dev: true, minimalMode: false, enabled: true, expected: 0 },
    { dev: false, minimalMode: true, enabled: true, expected: 0 },
    { dev: false, minimalMode: false, enabled: false, expected: 0 },
    { dev: false, minimalMode: false, enabled: true, expected: 1 },
  ])(
    'retains constructor startup gates: %j',
    ({ dev, minimalMode, enabled, expected }) => {
      // A pending preload must not block constructing the server.
      const preloading = jest
        .spyOn(NextServer.prototype, 'unstable_preloadEntries')
        .mockImplementation(() => new Promise(() => {}))
      try {
        const server = new NextServer({
          dir: '.',
          dev,
          minimalMode,
          conf: {
            ...defaultConfig,
            experimental: {
              ...defaultConfig.experimental,
              preloadEntriesOnStart: enabled,
            },
          },
        })
        expect(server).toBeInstanceOf(NextServer)
        expect(preloading).toHaveBeenCalledTimes(expected)
        expect(defaultConfig.experimental.preloadEntriesOnStart).toBe(true)
      } finally {
        preloading.mockRestore()
      }
    }
  )
})
