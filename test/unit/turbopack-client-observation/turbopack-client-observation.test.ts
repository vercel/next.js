// Exercise source at runtime without importing Next's entire source type graph
// into the root test tsconfig. Core source is checked by Next's own types task.
const { handleRouteType, hasEntrypointForKey } = jest.requireActual(
  '../../../packages/next/src/server/dev/turbopack-utils'
)
import { getEntryKey } from '../../../packages/next/src/shared/lib/turbopack/entry-key'
import type { EntryKey } from '../../../packages/next/src/shared/lib/turbopack/entry-key'
import type {
  Endpoint,
  TurbopackResult,
  WrittenEndpoint,
} from '../../../packages/next/dist/build/swc/types'

async function* changes() {}

function createEndpoint() {
  const written: TurbopackResult<WrittenEndpoint> = {
    value: {
      type: 'nodejs',
      entryPath: 'page.js',
      serverHmrEntryPaths: [],
      clientPaths: [],
      serverPaths: [],
      config: {},
    },
    issues: [],
  }
  return {
    writeToDisk: jest.fn().mockResolvedValue(written),
    clientChanged: jest.fn().mockResolvedValue(changes()),
    serverChanged: jest.fn().mockResolvedValue(changes()),
  } satisfies Endpoint
}

function setup() {
  const app = createEndpoint()
  const html = createEndpoint()
  const observe = jest.fn(async (_key: EntryKey, endpoint: Endpoint) => {
    await endpoint.clientChanged()
  })
  const options = {
    dev: true,
    page: '/',
    pathname: '/',
    route: { type: 'page', htmlEndpoint: html, dataEndpoint: createEndpoint() },
    currentEntryIssues: new Map(),
    entrypoints: {
      global: {
        app,
        document: undefined,
        error: undefined,
        middleware: undefined,
        instrumentation: undefined,
      },
      page: new Map(),
      app: new Map(),
    },
    manifestLoader: {
      loadBuildManifest: jest.fn(),
      loadPagesManifest: jest.fn(),
      loadClientBuildManifest: jest.fn(),
      loadFontManifest: jest.fn(),
      deleteMiddlewareManifest: jest.fn(),
      writeManifests: jest.fn(),
    },
    devRewrites: undefined,
    productionRewrites: undefined,
    logErrors: false,
    hooks: {
      handleWrittenEndpoint: jest.fn().mockReturnValue(false),
      subscribeToChanges: jest.fn().mockResolvedValue(undefined),
      subscribeToClientHmrChanges: observe,
    },
  }
  return { options, app, html, observe }
}

describe('Pages global client observation', () => {
  it('awaits the written global _app baseline before writing the page HTML', async () => {
    const { options, app, html, observe } = setup()
    let started!: () => void
    const setupStarted = new Promise<void>((resolve) => {
      started = resolve
    })
    let ready!: (iterator: ReturnType<typeof changes>) => void
    app.clientChanged.mockImplementation(() => {
      started()
      return new Promise((resolve) => {
        ready = resolve
      })
    })
    const ensure = handleRouteType(options)
    await setupStarted
    expect(app.writeToDisk).toHaveBeenCalledTimes(1)
    expect(observe).toHaveBeenCalledWith(
      getEntryKey('pages', 'client', '_app'),
      app
    )
    expect(html.writeToDisk).not.toHaveBeenCalled()
    ready(changes())
    await ensure
    expect(html.writeToDisk).toHaveBeenCalledTimes(1)
    expect(observe).toHaveBeenLastCalledWith(
      getEntryKey('pages', 'client', '/'),
      html
    )
  })

  it('uses one dedicated global key across distinct ensured Pages', async () => {
    const { options, app, observe } = setup()
    await handleRouteType(options)
    await handleRouteType({ ...options, page: '/other', pathname: '/other' })
    const globalKeys = observe.mock.calls
      .filter(([, endpoint]) => endpoint === app)
      .map(([key]) => key)
    // The real owner deduplicates by this key in changeSubscriptions. This unit
    // checks the caller's keys, not the native subscription owner's internals.
    expect(globalKeys).toEqual([
      getEntryKey('pages', 'client', '_app'),
      getEntryKey('pages', 'client', '_app'),
    ])
  })

  it.each(['production', 'one-shot'] as const)(
    'does not observe the global endpoint for %s compilation',
    async (mode) => {
      const { options, app, html, observe } = setup()
      if (mode === 'production') options.dev = false
      else options.hooks!.subscribeToClientHmrChanges = undefined
      await handleRouteType(options)
      expect(observe).not.toHaveBeenCalled()
      expect(app.clientChanged).not.toHaveBeenCalled()
      expect(html.clientChanged).not.toHaveBeenCalled()
      expect(html.writeToDisk).toHaveBeenCalledTimes(1)
    }
  )

  it('leaves a rejected setup visible to the caller', async () => {
    const { options, app, html } = setup()
    app.clientChanged.mockRejectedValue(new Error('client setup failed'))
    await expect(handleRouteType(options)).rejects.toThrow(
      'client setup failed'
    )
    expect(html.writeToDisk).not.toHaveBeenCalled()
  })

  it('observes only the page when there is no global _app endpoint', async () => {
    const { options, app, html, observe } = setup()
    options.entrypoints.global.app = undefined
    await handleRouteType(options)
    expect(app.writeToDisk).not.toHaveBeenCalled()
    expect(observe.mock.calls).toEqual([
      [getEntryKey('pages', 'client', '/'), html],
    ])
  })

  it('recognizes the global client key for existing map cleanup', () => {
    const { options } = setup()
    const key = getEntryKey('pages', 'client', '_app')
    expect(hasEntrypointForKey(options.entrypoints, key, undefined)).toBe(true)
    options.entrypoints.global.app = undefined
    expect(hasEntrypointForKey(options.entrypoints, key, undefined)).toBe(false)
  })
})
