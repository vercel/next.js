import 'next/dist/server/node-environment'
import { AppPageRouteModule } from 'next/dist/server/route-modules/app-page/module.compiled'
import { RouteKind } from 'next/dist/server/route-kind'
import { DEFAULT_SEGMENT_KEY } from 'next/dist/shared/lib/segment'
import type { LoaderTree } from 'next/dist/server/lib/app-dir-module'
import type { ModuleTuple } from 'next/dist/build/webpack/loaders/metadata/types'
import { join } from 'path'

jest.mock('next/dist/server/load-manifest.external', () => ({
  evalManifestFromRelativePath: jest.fn(),
  loadManifestFromRelativePath: jest.fn(),
}))

const { evalManifestFromRelativePath, loadManifestFromRelativePath } =
  jest.requireMock<{
    evalManifestFromRelativePath: jest.Mock
    loadManifestFromRelativePath: jest.Mock
  }>('next/dist/server/load-manifest.external')
const { getClientReferenceManifest, getServerActionsManifest } =
  jest.requireActual<{
    getClientReferenceManifest: () => { clientModules: Record<string, unknown> }
    getServerActionsManifest: () => typeof serverActionsManifest
  }>('next/dist/server/app-render/manifests-singleton')
const clientReferenceManifest = {
  moduleLoading: { prefix: '' },
  clientModules: { test: { id: 'test', name: '*', chunks: [] } },
  rscModuleMapping: {},
  edgeRscModuleMapping: {},
  ssrModuleMapping: {},
  edgeSSRModuleMapping: {},
  entryCSSFiles: {},
}
const serverActionsManifest = { encryptionKey: 'test-key', node: {}, edge: {} }
type ReferenceManifests = {
  clientReferenceManifest?: typeof clientReferenceManifest
  serverActionsManifest?: typeof serverActionsManifest
}
const { loadReferenceManifests } = jest.requireActual<{
  loadReferenceManifests: (options: {
    page: string
    projectDir: string
    distDir: string
    isDev: boolean
  }) => ReferenceManifests
}>('next/dist/server/load-reference-manifests')
// Keep the request loader's private test access and manifest types local.
const { RouteModule } = jest.requireActual<{
  RouteModule: new (options: {
    definition: {
      kind: RouteKind
      page: string
      pathname: string
      filename: string
      bundlePath: string
    }
    userland: object
    distDir: string
    relativeProjectDir: string
  }) => {
    loadManifests: (page: string, projectDir: string) => ReferenceManifests
  }
}>('next/dist/server/route-modules/route-module')
const manifestsKey = Symbol.for('next.server.manifests')
const manifestsGlobal = globalThis as typeof globalThis & {
  [key: symbol]: unknown
}
let previousManifests: unknown

function routeModule(
  loaderTree: LoaderTree,
  { page = '/page', distDir = '.next', relativeProjectDir = '.' } = {}
) {
  return new AppPageRouteModule({
    definition: {
      kind: RouteKind.APP_PAGE,
      page,
      pathname: '/',
      filename: 'page.js',
      bundlePath: 'app/page',
      appPaths: ['/page'],
    },
    userland: { loaderTree },
    distDir,
    relativeProjectDir,
  })
}

describe('shared Node reference-manifest loading', () => {
  const options = {
    page: '/%5Fencoded/custom-entry',
    projectDir: join(process.cwd(), 'project'),
    distDir: 'custom-build',
    isDev: false,
  }

  beforeEach(() => {
    evalManifestFromRelativePath.mockReset().mockReturnValue({
      __RSC_MANIFEST: { '/_encoded/custom-entry': clientReferenceManifest },
    })
    loadManifestFromRelativePath
      .mockReset()
      .mockReturnValue(serverActionsManifest)
  })

  it.each([false, true])(
    'uses canonical addressing and cache policy with isDev=%s',
    (isDev) => {
      const previous = manifestsGlobal[manifestsKey]
      expect(loadReferenceManifests({ ...options, isDev })).toEqual({
        clientReferenceManifest,
        serverActionsManifest,
      })
      expect(evalManifestFromRelativePath).toHaveBeenCalledTimes(1)
      expect(loadManifestFromRelativePath).toHaveBeenCalledTimes(1)
      const [clientOptions] = evalManifestFromRelativePath.mock.calls[0]
      expect(clientOptions.projectDir.replace(/\\/g, '/')).toBe(
        options.projectDir.replace(/\\/g, '/')
      )
      expect(clientOptions).toMatchObject({
        distDir: options.distDir,
        manifest:
          'server/app/_encoded/custom-entry_client-reference-manifest.js',
        shouldCache: !isDev,
        handleMissing: true,
      })
      expect(loadManifestFromRelativePath).toHaveBeenCalledWith({
        projectDir: clientOptions.projectDir,
        distDir: options.distDir,
        manifest: 'server/server-reference-manifest.json',
        shouldCache: !isDev,
        handleMissing: true,
      })
      expect(
        evalManifestFromRelativePath.mock.invocationCallOrder[0]
      ).toBeLessThan(loadManifestFromRelativePath.mock.invocationCallOrder[0])
      expect(manifestsGlobal[manifestsKey]).toBe(previous)
    }
  )

  it.each(['client context', 'client entry', 'actions'])(
    'returns optional references with missing %s',
    (missing) => {
      if (missing === 'client context') {
        evalManifestFromRelativePath.mockReturnValue(undefined)
      } else if (missing === 'client entry') {
        evalManifestFromRelativePath.mockReturnValue({ __RSC_MANIFEST: {} })
      } else {
        loadManifestFromRelativePath.mockReturnValue(undefined)
      }
      expect(loadReferenceManifests(options)).toEqual({
        clientReferenceManifest:
          missing === 'actions' ? clientReferenceManifest : undefined,
        serverActionsManifest:
          missing === 'actions' ? undefined : serverActionsManifest,
      })
    }
  )

  it.each([
    ['/favicon.ico/route', false],
    ['/nested/icon.png/route', false],
    ['/robots.txt/route', true],
    ['/nested/sitemap.xml/route', true],
  ])('preserves static metadata exclusion for %s', (page, readsClient) => {
    evalManifestFromRelativePath.mockReturnValue({
      __RSC_MANIFEST: { [page]: clientReferenceManifest },
    })
    expect(loadReferenceManifests({ ...options, page })).toEqual({
      clientReferenceManifest: readsClient
        ? clientReferenceManifest
        : undefined,
      serverActionsManifest,
    })
    expect(evalManifestFromRelativePath).toHaveBeenCalledTimes(
      readsClient ? 1 : 0
    )
    expect(loadManifestFromRelativePath).toHaveBeenCalledTimes(1)
  })

  it.each(['client', 'actions'])(
    'propagates %s reader errors',
    (failedReader) => {
      const failure = new Error('shared reader failed')
      const reader =
        failedReader === 'client'
          ? evalManifestFromRelativePath
          : loadManifestFromRelativePath
      reader.mockImplementation(() => {
        throw failure
      })
      expect(() => loadReferenceManifests(options)).toThrow(failure)
      if (failedReader === 'client')
        expect(loadManifestFromRelativePath).not.toHaveBeenCalled()
    }
  )

  it.each([
    [RouteKind.APP_PAGE, '/%5Fencoded/custom-entry', true],
    [RouteKind.APP_ROUTE, '/api/route', true],
    [RouteKind.APP_ROUTE, '/favicon.ico/route', false],
    [RouteKind.PAGES, '/page', false],
    [RouteKind.PAGES_API, '/api', false],
  ])(
    'preserves request references and registration timing for %s %s',
    (kind, page, readsClient) => {
      const previous = manifestsGlobal[manifestsKey]
      evalManifestFromRelativePath.mockReturnValue({
        __RSC_MANIFEST: {
          [page.replace(/%5F/g, '_')]: clientReferenceManifest,
        },
      })
      loadManifestFromRelativePath.mockImplementation(({ manifest }) => {
        if (manifest === 'server/server-reference-manifest.json')
          return serverActionsManifest
        if (manifest === 'routes-manifest.json')
          return { rewrites: { beforeFiles: [] } }
        return {}
      })
      const route = new RouteModule({
        definition: {
          kind,
          page,
          pathname: '/',
          filename: 'entry.js',
          bundlePath: 'app/entry',
        },
        userland: {},
        distDir: options.distDir,
        relativeProjectDir: 'project',
      })
      const references = route.loadManifests(page, options.projectDir)
      const isApp = kind === RouteKind.APP_PAGE || kind === RouteKind.APP_ROUTE
      expect(references).toMatchObject({
        clientReferenceManifest: readsClient
          ? clientReferenceManifest
          : undefined,
        serverActionsManifest: isApp ? serverActionsManifest : {},
      })
      expect(evalManifestFromRelativePath).toHaveBeenCalledTimes(
        readsClient ? 1 : 0
      )
      const actionReads = loadManifestFromRelativePath.mock.calls.filter(
        ([{ manifest }]) => manifest === 'server/server-reference-manifest.json'
      )
      expect(actionReads).toHaveLength(isApp ? 1 : 0)
      if (readsClient) {
        const [clientOptions] = evalManifestFromRelativePath.mock.calls[0]
        expect(clientOptions.projectDir.replace(/\\/g, '/')).toBe(
          options.projectDir.replace(/\\/g, '/')
        )
        expect(clientOptions.distDir).toBe(options.distDir)
        expect(clientOptions.manifest).toBe(
          `server/app${page.replace(/%5F/g, '_')}_client-reference-manifest.js`
        )
      }
      expect(manifestsGlobal[manifestsKey]).toBe(previous)
    }
  )
})

describe('App Page userland preloading', () => {
  beforeEach(() => {
    previousManifests = manifestsGlobal[manifestsKey]
    delete manifestsGlobal[manifestsKey]
    evalManifestFromRelativePath.mockReset().mockReturnValue({
      __RSC_MANIFEST: { '/page': clientReferenceManifest },
    })
    loadManifestFromRelativePath
      .mockReset()
      .mockReturnValue(serverActionsManifest)
  })

  afterEach(() => {
    if (previousManifests === undefined) delete manifestsGlobal[manifestsKey]
    else manifestsGlobal[manifestsKey] = previousManifests
  })

  it('initializes reference manifests before factories using canonical page and project paths', async () => {
    const page = '/%5Fencoded/custom-entry'
    evalManifestFromRelativePath.mockReturnValue({
      __RSC_MANIFEST: { '/_encoded/custom-entry': clientReferenceManifest },
    })
    const factory = jest.fn(async () => {
      expect(getClientReferenceManifest().clientModules.test).toEqual(
        clientReferenceManifest.clientModules.test
      )
      expect(getServerActionsManifest()).toEqual(serverActionsManifest)
      return { default: jest.fn() }
    })
    const route = routeModule(['', {}, { page: [factory, 'page.tsx'] }, null], {
      page,
      relativeProjectDir: 'project',
      distDir: 'custom-build',
    })
    const prepare = jest.spyOn(route, 'prepare')
    await route.ensureUserland()
    expect(factory).toHaveBeenCalledTimes(1)
    expect(prepare).not.toHaveBeenCalled()
    expect(evalManifestFromRelativePath).toHaveBeenCalledTimes(1)
    expect(loadManifestFromRelativePath).toHaveBeenCalledTimes(1)
    const [clientOptions] = evalManifestFromRelativePath.mock.calls[0]
    expect(clientOptions.projectDir.replace(/\\/g, '/')).toBe(
      join(process.cwd(), 'project').replace(/\\/g, '/')
    )
    expect(clientOptions).toMatchObject({
      distDir: 'custom-build',
      manifest: 'server/app/_encoded/custom-entry_client-reference-manifest.js',
      shouldCache: true,
      handleMissing: true,
    })
    expect(loadManifestFromRelativePath).toHaveBeenCalledWith({
      projectDir: clientOptions.projectDir,
      distDir: 'custom-build',
      manifest: 'server/server-reference-manifest.json',
      shouldCache: true,
      handleMissing: true,
    })
    prepare.mockRestore()
  })

  it.each(['client context', 'client entry', 'actions'])(
    'allows an absent optional %s manifest',
    async (missing) => {
      if (missing === 'client context') {
        evalManifestFromRelativePath.mockReturnValue(undefined)
      } else if (missing === 'client entry') {
        evalManifestFromRelativePath.mockReturnValue({ __RSC_MANIFEST: {} })
      } else {
        loadManifestFromRelativePath.mockReturnValue(undefined)
      }
      const factory = jest.fn(async () => ({ default: jest.fn() }))
      await expect(
        routeModule([
          '',
          {},
          { page: [factory, 'page.tsx'] },
          null,
        ]).ensureUserland()
      ).resolves.toBeUndefined()
      expect(factory).toHaveBeenCalledTimes(1)
      expect(manifestsGlobal[manifestsKey]).toBeUndefined()
    }
  )

  it.each(['client', 'actions'])(
    'propagates a %s manifest reader failure before evaluation',
    async (failedReader) => {
      const failure = new Error('manifest reader failed')
      const reader =
        failedReader === 'client'
          ? evalManifestFromRelativePath
          : loadManifestFromRelativePath
      reader.mockImplementation(() => {
        throw failure
      })
      const factory = jest.fn()
      await expect(
        routeModule([
          '',
          {},
          { page: [factory, 'page.tsx'] },
          null,
        ]).ensureUserland()
      ).rejects.toBe(failure)
      expect(factory).not.toHaveBeenCalled()
    }
  )

  it('propagates a manifest registration failure before evaluation', async () => {
    const failure = new Error('manifest registration failed')
    loadManifestFromRelativePath.mockReturnValue({
      get encryptionKey() {
        throw failure
      },
      node: {},
      edge: {},
    })
    const factory = jest.fn()
    await expect(
      routeModule([
        '',
        {},
        { page: [factory, 'page.tsx'] },
        null,
      ]).ensureUserland()
    ).rejects.toBe(failure)
    expect(factory).not.toHaveBeenCalled()
  })

  it('awaits all module tuples and parallel children without rendering or metadata execution', async () => {
    const events: string[] = []
    const component = jest.fn()
    const metadataCallback = jest.fn(() => {
      throw new Error('metadata must not run during preload')
    })
    const loaders: jest.Mock[] = []
    const tuple = (name: string): ModuleTuple => {
      const load = jest.fn(async () => {
        events.push(`${name}:start`)
        await Promise.resolve()
        events.push(`${name}:loaded`)
        return { default: component }
      })
      loaders.push(load)
      return [load, `${name}.tsx`]
    }
    const moduleNames = [
      'layout',
      'page',
      'template',
      'loading',
      'error',
      'global-error',
      'global-not-found',
      'not-found',
      'forbidden',
      'unauthorized',
    ]
    const modules = Object.fromEntries(
      moduleNames.map((name) => [name, tuple(name)])
    ) as LoaderTree[2]
    const tree: LoaderTree = [
      '',
      {
        children: [
          'nested',
          { children: ['leaf', {}, { page: tuple('nested-page') }, null] },
          { layout: tuple('nested-layout') },
          null,
        ],
        slot: [
          DEFAULT_SEGMENT_KEY,
          {},
          { defaultPage: tuple('slot-default'), loading: undefined },
          null,
        ],
      },
      {
        ...modules,
        metadata: {
          icon: [metadataCallback],
          apple: [metadataCallback],
          openGraph: [metadataCallback],
          twitter: [metadataCallback],
          manifest: 'manifest.webmanifest',
        },
      },
      ['static-sibling'],
    ]
    const route = routeModule(tree)
    await expect(route.ensureUserland()).resolves.toBeUndefined()
    expect(events).toEqual(
      [...moduleNames, 'nested-layout', 'nested-page', 'slot-default'].flatMap(
        (name) => [`${name}:start`, `${name}:loaded`]
      )
    )
    for (const load of loaders) expect(load).toHaveBeenCalledTimes(1)
    expect(component).not.toHaveBeenCalled()
    expect(metadataCallback).not.toHaveBeenCalled()
  })

  it.each(['sync throw', 'async rejection'])(
    'propagates a %s without visiting later factories in that tree',
    async (failureKind) => {
      const failure = new Error('page preload failed')
      const first = jest.fn(async () => ({ default: jest.fn() }))
      const failing = jest.fn(() => {
        if (failureKind === 'sync throw') throw failure
        return Promise.resolve().then(() => {
          throw failure
        })
      })
      const later = jest.fn()
      const child = jest.fn()
      const tree: LoaderTree = [
        '',
        { children: ['child', {}, { page: [child, 'child.tsx'] }, null] },
        {
          layout: [first, 'layout.tsx'],
          page: [failing, 'page.tsx'],
          template: [later, 'template.tsx'],
        },
        null,
      ]
      await expect(routeModule(tree).ensureUserland()).rejects.toBe(failure)
      expect(first).toHaveBeenCalledTimes(1)
      expect(failing).toHaveBeenCalledTimes(1)
      expect(later).not.toHaveBeenCalled()
      expect(child).not.toHaveBeenCalled()
    }
  )

  it('handles empty segments and absent module slots', async () => {
    const tree: LoaderTree = [
      '',
      { children: ['empty', {}, { page: undefined, layout: undefined }, null] },
      {},
      null,
    ]
    await expect(routeModule(tree).ensureUserland()).resolves.toBeUndefined()
  })
})
