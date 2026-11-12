import { requireCompilerAliasCapability } from 'next/dist/build/swc/test-aliases'
import {
  prepareCompilerAliases,
  withCompilerAliases,
} from 'next/dist/experimental/testing/compiler/aliases'
import {
  retainCompilerTransforms,
  runCompilerTransforms,
  assertTransformSource,
} from 'next/dist/experimental/testing/compiler/transform-hooks'
import {
  openCompilerTransformBroker,
  requestCompilerTransform,
} from 'next/dist/experimental/testing/compiler/transform-broker'
import transformLoader from 'next/dist/experimental/testing/compiler/transform-loader'
import { withCompilerTransforms } from 'next/dist/experimental/testing/compiler/transform-config'
const {
  SourceMapConsumer,
  SourceMapGenerator,
} = require('next/dist/compiled/source-map')
import type { NextConfigComplete } from 'next/dist/server/config-shared'
import { dirname } from 'path'
import { createConnection } from 'net'
import {
  browserFixturePages,
  browserFixtureManifestFiles,
  serializeBrowserFixtureHost,
  requireProductionFixtureCapability,
} from 'next/dist/build/swc/browser-fixtures'
import { requireTestRouteCapability } from 'next/dist/build/swc/test-route'
import { mkdtemp, mkdir, readdir, rm, symlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

jest.mock('next/dist/build/swc', () => ({
  loadBindings: async () => ({ isWasm: false }),
}))
jest.mock('next/dist/build/lockfile', () => ({
  Lockfile: {
    tryAcquire: jest.fn(() => ({ unlock: jest.fn(async () => {}) })),
  },
}))
jest.mock('next/dist/build/swc/dev-project', () => ({
  createDevTurbopackProject: jest.fn(),
}))
let mockCacheComponents = true
jest.mock('next/dist/server/config', () => ({
  __esModule: true,
  default: async () => ({
    ...jest.requireActual('next/dist/server/config-shared').defaultConfig,
    distDir: '.next/dev',
    cacheComponents: mockCacheComponents,
    cacheMaxMemorySize: 123456,
    cacheHandlers: { default: undefined },
    cacheLife: { default: { stale: 300, revalidate: 900, expire: 3600 } },
    staticPageGenerationTimeout: 60,
    assetPrefix: '/assets',
    deploymentId: 'test-deployment',
    experimental: {
      ...jest.requireActual('next/dist/server/config-shared').defaultConfig
        .experimental,
      instantInsights: { validationLevel: 'none' },
      lockDistDir: true,
      allowedRevalidateHeaderKeys: ['x-test-revalidate'],
      fetchCacheKeyPrefix: 'test-cache',
      isrFlushToDisk: true,
      authInterrupts: true,
      useCacheTimeout: 5000,
      durableUseCacheEntries: true,
    },
  }),
}))
jest.mock('next/dist/server/lib/router-utils/filesystem', () => ({
  setupFsCheck: async () => ({
    previewProps: {
      previewModeId: 'test-preview-id',
      previewModeSigningKey: 'test-signing-key',
      previewModeEncryptionKey: 'test-encryption-key',
    },
  }),
}))
jest.mock('next/dist/shared/lib/turbopack/utils', () => ({
  formatIssue: (issue: { message: string }) => issue.message,
}))

const profile = {
  id: 'rsc',
  environment: 'rsc',
  mode: 'development',
  runtime: 'nodejs',
  bundler: 'turbopack',
} as const

describe('native route ABI negotiation', () => {
  it.each([undefined, 0, -1, NaN])(
    'rejects absent or unsupported route capability %s',
    (version) => {
      const binding =
        version === undefined
          ? {}
          : { projectTestEntryRouteVersion: () => version }
      expect(() =>
        requireTestRouteCapability(binding, '/reference/[slug]')
      ).toThrow('does not support native AppProject test routes')
    }
  )
  it('does not request a route capability for existing route-less entries', () => {
    const getter = jest.fn(() => {
      throw new Error('unrequested getter')
    })
    expect(() =>
      requireTestRouteCapability(
        { projectTestEntryRouteVersion: getter },
        undefined
      )
    ).not.toThrow()
    expect(getter).not.toHaveBeenCalled()
  })
  it('accepts an actual supported native route ABI version', () => {
    const getter = jest.fn(() => 1)
    expect(() =>
      requireTestRouteCapability(
        { projectTestEntryRouteVersion: getter },
        '/reference/[slug]'
      )
    ).not.toThrow()
    expect(getter).toHaveBeenCalledTimes(1)
  })
})

describe('private production browser fixture build inputs', () => {
  const host = {
    routePrefix: '/__next_testing_control',
    fixtures: [
      {
        id: 'counter',
        module: '/application/Counter.jsx',
        exportName: 'default',
      },
    ],
  }
  it('declares real App Page keys and normal production manifest/trace filenames', () => {
    expect(browserFixturePages(host)).toEqual([
      {
        pathname: '/__next_testing_control/counter',
        originalName: '/__next_testing_control/counter/page',
      },
    ])
    expect(browserFixtureManifestFiles(host)).toEqual([
      'server/app-paths-manifest.json',
      'app-path-routes-manifest.json',
      'server/app/__next_testing_control/counter/page_client-reference-manifest.js',
      'server/app/__next_testing_control/counter/page.js.nft.json',
    ])
    expect(
      JSON.parse(serializeBrowserFixtureHost('/application', host))
    ).toEqual({
      ...host,
      fixtures: [{ ...host.fixtures[0], module: 'Counter.jsx' }],
    })
  })
  it('leaves ordinary production build inputs without private route inventory', () => {
    expect(browserFixturePages(undefined)).toEqual([])
    expect(browserFixtureManifestFiles(undefined)).toEqual([])
    const getter = jest.fn(() => {
      throw new Error('unrequested native capability')
    })
    expect(() =>
      requireProductionFixtureCapability(
        { projectBrowserFixtureProductionVersion: getter },
        false
      )
    ).not.toThrow()
    expect(getter).not.toHaveBeenCalled()
  })
  it.each([undefined, 0, -1, NaN])(
    'fails closed for unsupported native production fixture capability %s',
    (version) => {
      expect(() =>
        requireProductionFixtureCapability(
          version === undefined
            ? {}
            : { projectBrowserFixtureProductionVersion: () => version },
          true
        )
      ).toThrow('does not support production browser fixture pages')
    }
  )
  it('requires an actual native production fixture capability', () => {
    expect(() =>
      requireProductionFixtureCapability(
        { projectBrowserFixtureProductionVersion: () => 1 },
        true
      )
    ).not.toThrow()
  })
  it.each([
    { ...host, routePrefix: '/application' },
    { ...host, fixtures: [host.fixtures[0], host.fixtures[0]] },
    { ...host, fixtures: [{ ...host.fixtures[0], id: '../counter' }] },
    { ...host, fixtures: [{ ...host.fixtures[0], exportName: 'bad-export' }] },
  ])('rejects invalid private registration %j', (input) =>
    expect(() => browserFixturePages(input)).toThrow()
  )
  it('rejects a fixture source outside the actual application project', () => {
    expect(() =>
      serializeBrowserFixtureHost('/application', {
        ...host,
        fixtures: [{ ...host.fixtures[0], module: '/elsewhere/Counter.jsx' }],
      })
    ).toThrow('contained in the application project')
  })
})

describe('explicit native browser client negotiation', () => {
  const {
    requireBrowserClientCapability,
  } = require('next/dist/build/swc/browser-client')
  it.each([undefined, 0, NaN, 1.5])(
    'rejects unsupported native client version %s before emission',
    (version) => {
      const binding =
        version === undefined
          ? {}
          : { projectTestEntryBrowserClientVersion: () => version }
      expect(() => requireBrowserClientCapability(binding, true)).toThrow(
        /actual Browser Mode/
      )
      expect(() => requireBrowserClientCapability(binding, false)).not.toThrow()
    }
  )
  it('negotiates only explicitly requested client compilation', () => {
    const getter = jest.fn(() => 1)
    requireBrowserClientCapability(
      { projectTestEntryBrowserClientVersion: getter },
      false
    )
    expect(getter).not.toHaveBeenCalled()
    requireBrowserClientCapability(
      { projectTestEntryBrowserClientVersion: getter },
      true
    )
    expect(getter).toHaveBeenCalledTimes(1)
  })
})

describe('private production Browser coverage native ABI', () => {
  const {
    withNativeBrowserSourceCoverage,
  } = require('next/dist/build/swc/browser-client')
  it.each([
    [],
    [true],
    [false, true],
    [false, false, true],
    [false, true, false, ['mapped'], false, 'revision'],
  ])('preserves the exact old native call when absent (%s)', (...features) => {
    const getter = jest.fn(() => {
      throw new Error('must not negotiate')
    })
    expect(
      withNativeBrowserSourceCoverage(
        { projectTestEntryBrowserSourceCoverageVersion: getter },
        features,
        false
      )
    ).toBe(features)
    expect(getter).not.toHaveBeenCalled()
  })
  it.each([undefined, 0, NaN, 1.5, 2])(
    'rejects unsupported native source-coverage version %s',
    (version) => {
      const binding =
        version === undefined
          ? {}
          : { projectTestEntryBrowserSourceCoverageVersion: () => version }
      expect(() =>
        withNativeBrowserSourceCoverage(binding, [false, true], true)
      ).toThrow('source-preserving production Browser coverage')
    }
  )
  it.each([[], [false, false], [false, true, true]])(
    'rejects a source flag without its actual Browser client (%s)',
    (...features) => {
      expect(() =>
        withNativeBrowserSourceCoverage(
          { projectTestEntryBrowserSourceCoverageVersion: () => 1 },
          features,
          true
        )
      ).toThrow('actual client entry')
    }
  )
  it('appends only its new trailing feature while retaining all prior producer fields', () => {
    const getter = jest.fn(() => 1)
    const features = [true, true, false, ['mapped'], true, 'retained-revision']
    expect(
      withNativeBrowserSourceCoverage(
        { projectTestEntryBrowserSourceCoverageVersion: getter },
        features,
        true
      )
    ).toEqual([...features, true])
    expect(features).toEqual([
      true,
      true,
      false,
      ['mapped'],
      true,
      'retained-revision',
    ])
    expect(getter).toHaveBeenCalledTimes(1)
  })
})

describe('Next compiler transform-only hooks', () => {
  const file = '/application/subject.ts'
  const input = {
    file,
    query: '?contract',
    code: 'export const value = 1',
    moduleType: 'ts',
  }
  function retain(plugins: unknown[]) {
    return retainCompilerTransforms({
      plugins,
      test: { include: ['*.case.mjs'] },
    }).retained!
  }

  it('keeps exact async closures in array order and isolates same-named realms', async () => {
    const captured = { value: 2 }
    const hooks = retain([
      false,
      {
        name: 'same',
        async transform(code: string, id: string, options: unknown) {
          expect(id).toBe(file + '?contract')
          expect(options).toEqual({ ssr: true, moduleType: 'ts' })
          return code.replace(
            '1',
            String(await Promise.resolve(captured.value))
          )
        },
      },
      {
        name: 'second',
        transform(code: string) {
          return code + ';export const ordered = true'
        },
      },
    ])
    captured.value = 3
    expect((await runCompilerTransforms(hooks, input)).code).toContain(
      'value = 3;export const ordered = true'
    )
    const other = retain([
      { name: 'same', transform: () => 'export const value = 7' },
    ])
    expect(other.realm).not.toBe(hooks.realm)
    expect((await runCompilerTransforms(other, input)).code).toBe(
      'export const value = 7'
    )
  })

  it.each([
    { name: 'resolve', transform() {}, resolveId() {} },
    { name: 'enforce', transform() {}, enforce: 'pre' },
    { name: 'object-hook', transform: { handler() {} } },
  ])('rejects unsupported plugin fields before cloning ($name)', (plugin) => {
    expect(() => retain([plugin])).toThrow(
      'Unsupported Next test compiler transform'
    )
  })

  it('rejects inherited unsupported hooks and accessors without invoking them', () => {
    expect(() =>
      retain([
        Object.assign(Object.create({ resolveId() {} }), {
          name: 'inherited',
          transform(code: string) {
            return code
          },
        }),
      ])
    ).toThrow('plain object')
    const getter = jest.fn(() => 'getter')
    expect(() =>
      retain([
        {
          get name() {
            return getter()
          },
          transform() {},
        },
      ])
    ).toThrow('accessors')
    expect(getter).not.toHaveBeenCalled()
    const config = {
      test: {},
      get plugins() {
        return getter()
      },
    }
    expect(() => retainCompilerTransforms(config)).toThrow('accessors')
    expect(getter).not.toHaveBeenCalled()
  })

  it('diagnoses unsupported hook context, result metadata and introduced compiler helpers', async () => {
    await expect(
      runCompilerTransforms(
        retain([
          {
            name: 'needs-resolver',
            transform(this: { resolve(): void }) {
              this.resolve()
            },
          },
        ]),
        input
      )
    ).rejects.toThrow('needs-resolver context.resolve is not implemented')
    await expect(
      runCompilerTransforms(
        retain([
          {
            name: 'ast',
            transform() {
              return { code: input.code, ast: {} }
            },
          },
        ]),
        input
      )
    ).rejects.toThrow('result field ast')
    await expect(
      runCompilerTransforms(
        retain([
          {
            name: 'symbol',
            transform() {
              return { code: input.code, [Symbol('ast')]: true }
            },
          },
        ]),
        input
      )
    ).rejects.toThrow('Symbol(ast)')
    await expect(
      runCompilerTransforms(
        retain([
          {
            name: 'introduce',
            transform() {
              return `import {vi as api} from 'vitest';api['mock']('./subject')`
            },
          },
        ]),
        input
      )
    ).rejects.toThrow('native transform/planning phase')
    expect(() =>
      assertTransformSource(`vi[method]('./subject')`, file)
    ).toThrow('native transform/planning phase')
    expect(() =>
      assertTransformSource(
        `if(import.meta.vitest) { test('in source',()=>{}) }`,
        file
      )
    ).toThrow('in-source compiler helpers')
  })

  it('composes real source maps and removes stale coordinates after mapless changes', async () => {
    const previous = new SourceMapGenerator({ file })
    previous.addMapping({
      generated: { line: 1, column: 0 },
      original: { line: 10, column: 2 },
      source: '/original/source.ts',
    })
    previous.setSourceContent('/original/source.ts', 'original')
    const next = new SourceMapGenerator({ file })
    next.addMapping({
      generated: { line: 2, column: 0 },
      original: { line: 1, column: 0 },
      source: file,
    })
    const mapped = await runCompilerTransforms(
      retain([
        {
          name: 'mapped',
          transform: () => ({ code: '\n' + input.code, map: next.toString() }),
        },
      ]),
      { ...input, map: JSON.parse(previous.toString()) }
    )
    expect(
      new SourceMapConsumer(mapped.map!).originalPositionFor({
        line: 2,
        column: 0,
      })
    ).toMatchObject({ source: '/original/source.ts', line: 10, column: 2 })
    const mapless = await runCompilerTransforms(
      retain([{ name: 'mapless', transform: () => '\n' + input.code }]),
      { ...input, map: JSON.parse(previous.toString()) }
    )
    expect(mapless.map).toBeUndefined()
    await expect(
      runCompilerTransforms(
        retain([
          {
            name: 'virtual-map',
            transform: () => ({
              code: input.code,
              map: {
                version: 3,
                sources: ['virtual:source'],
                names: [],
                mappings: '',
              },
            }),
          },
        ]),
        input
      )
    ).rejects.toThrow('file source identities')
  })

  it('owns the real loader request, diagnostics, declared dependencies and stale leases', async () => {
    const hooks = retain([
      {
        name: 'owned',
        transform(
          this: {
            addWatchFile(file: string): void
            warn(message: string): void
          },
          code: string
        ) {
          this.addWatchFile('/application/data.txt')
          this.warn('diagnostic')
          return code.replace('1', '2')
        },
      },
    ])
    const broker = await openCompilerTransformBroker(
      hooks.realm,
      (source) => runCompilerTransforms(hooks, source),
      { configFile: '/application/vitest.config.mjs' }
    )
    try {
      const dependencies: string[] = []
      const warnings: string[] = []
      const result = await new Promise<string>((resolve, reject) =>
        transformLoader.call(
          {
            resourcePath: file,
            resourceQuery: '?contract',
            getOptions: () => ({
              descriptor: broker.descriptor,
              projectRoot: '/application',
              frameworkRoot: '/application/node_modules/next',
            }),
            async: () => (error, code) =>
              error ? reject(error) : resolve(code!),
            addDependency: (dependency) => dependencies.push(dependency),
            emitWarning: (warning) => warnings.push(warning.message),
          },
          input.code
        )
      )
      expect(result).toBe('export const value = 2')
      expect(dependencies).toEqual([
        '/application/vitest.config.mjs',
        '/application/data.txt',
      ])
      expect(warnings).toEqual(['[owned] diagnostic'])
      await expect(
        requestCompilerTransform(
          { ...broker.descriptor, revision: 'obsolete' },
          input
        )
      ).rejects.toThrow('Invalid or closed compiler transform lease')
    } finally {
      await broker.dispose()
    }
    await expect(
      readdir(dirname(broker.descriptor.socket))
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      requestCompilerTransform(broker.descriptor, input)
    ).rejects.toThrow()
  })

  it('settles pending requests and removes sockets on cancellation', async () => {
    let entered!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    let release!: () => void
    const completion = new Promise<void>((resolve) => {
      release = resolve
    })
    const controller = new AbortController()
    const broker = await openCompilerTransformBroker(
      'cancel',
      async () => {
        entered()
        await completion
        return { ...input, dependencies: [], warnings: [] }
      },
      { signal: controller.signal }
    )
    const pending = requestCompilerTransform(broker.descriptor, input)
    const rejected = pending.then(
      () => {
        throw new Error('Cancelled transform unexpectedly succeeded')
      },
      (error: Error) => error
    )
    await started
    controller.abort()
    expect(await rejected).toMatchObject({
      message: expect.stringContaining('disconnected'),
    })
    release()
    await broker.dispose()
    await expect(
      readdir(dirname(broker.descriptor.socket))
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('revokes blocked hooks when a loader consumer disconnects', async () => {
    let entered!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    let cancelled!: () => void
    const cancellation = new Promise<void>((resolve) => {
      cancelled = resolve
    })
    let release!: () => void
    const completion = new Promise<void>((resolve) => {
      release = resolve
    })
    const broker = await openCompilerTransformBroker(
      'disconnect',
      async () => {
        entered()
        await completion
        return { ...input, dependencies: [], warnings: [] }
      },
      { onCancelled: cancelled }
    )
    const socket = createConnection(broker.descriptor.socket)
    socket.on('connect', () =>
      socket.write(
        JSON.stringify({ ...broker.descriptor, requestId: 'owned', input }) +
          '\n'
      )
    )
    try {
      await started
      socket.destroy()
      await cancellation
    } finally {
      release()
      await broker.dispose()
    }
  })

  it('inserts the actual internal loader only in the ephemeral test config', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'next-transform-config-'))
    await mkdir(join(directory, 'node_modules'))
    await symlink(
      dirname(require.resolve('next/package.json')),
      join(directory, 'node_modules/next')
    )
    const config = {
      experimental: {},
      turbopack: { root: directory },
    } as unknown as NextConfigComplete
    const descriptor = {
      version: 1 as const,
      socket: '/owned',
      realm: 'realm',
      revision: 'generation',
    }
    try {
      const result = withCompilerTransforms(
        config,
        directory,
        { ...profile, environment: 'node' },
        descriptor
      )
      expect(result).not.toBe(config)
      expect(config.turbopack.rules).toBeUndefined()
      expect(result.turbopack.root).toBe(directory)
      expect(result.turbopack.rules).toEqual({
        '*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}': {
          loaders: [
            {
              loader: require.resolve(
                'next/dist/experimental/testing/compiler/transform-loader'
              ),
              options: {
                descriptor,
                projectRoot: directory,
                frameworkRoot: dirname(require.resolve('next/package.json')),
              },
            },
          ],
        },
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('preserves application rules and rejects unspecified ordering before project creation', () => {
    const config = {
      experimental: {},
      turbopack: { rules: { '*.ts': { loaders: ['application-loader'] } } },
    } as unknown as NextConfigComplete
    expect(
      withCompilerTransforms(config, '/application', {
        ...profile,
        environment: 'node',
      })
    ).toBe(config)
    const original = JSON.stringify(config)
    expect(() =>
      withCompilerTransforms(
        config,
        '/application',
        { ...profile, environment: 'node' },
        { version: 1, socket: '/owned', realm: 'realm', revision: 'revision' }
      )
    ).toThrow('ordering must remain explicit')
    expect(JSON.stringify(config)).toBe(original)
    expect(() =>
      withCompilerTransforms(
        { ...config, turbopack: {} },
        '/application',
        profile,
        { version: 1, socket: '/owned', realm: 'realm', revision: 'revision' }
      )
    ).toThrow('development Node profile')
  })
})

describe('Next native compiler alias mappings', () => {
  it.each([undefined, 0, 1.5, 2, NaN])(
    'rejects unsupported raw alias boundary version %s before compilation',
    (version) => {
      const binding =
        version === undefined
          ? {}
          : { projectTestEntryAliasVersion: () => version }
      expect(() => requireCompilerAliasCapability(binding, true)).toThrow(
        'raw-request compiler alias boundaries'
      )
      expect(() => requireCompilerAliasCapability(binding, false)).not.toThrow()
    }
  )
  it('negotiates raw alias boundaries only for the owning alias plan', () => {
    const getter = jest.fn(() => 1)
    requireCompilerAliasCapability(
      { projectTestEntryAliasVersion: getter },
      false
    )
    expect(getter).not.toHaveBeenCalled()
    requireCompilerAliasCapability(
      { projectTestEntryAliasVersion: getter },
      true
    )
    expect(getter).toHaveBeenCalledTimes(1)
  })

  const profile = {
    id: 'alias',
    environment: 'node',
    mode: 'development',
    runtime: 'nodejs',
    bundler: 'turbopack',
  } as const
  const config = {
    experimental: {},
    turbopack: { resolveAlias: { unrelated: './existing.mjs' } },
  } as unknown as NextConfigComplete
  it('maps string exact and slash-subpath requests into Next resolver data without mutating app configuration', () => {
    const prepared = prepareCompilerAliases({
      resolve: {
        alias: { '@file': '/app/.hidden.mjs', '@folder': '/app/lib' },
      },
      test: { include: ['*.mjs'] },
    })
    expect(prepared.value).toEqual({ test: { include: ['*.mjs'] } })
    const native = withCompilerAliases(
      config,
      '/app',
      profile,
      prepared.aliases
    )
    expect(native.turbopack.resolveAlias).toEqual({
      unrelated: './existing.mjs',
      '@file': './.hidden.mjs',
      '@file/*': './.hidden.mjs/*',
      '@folder': './lib',
      '@folder/*': './lib/*',
    })
    expect(config.turbopack.resolveAlias).toEqual({
      unrelated: './existing.mjs',
    })
    expect(withCompilerAliases(config, '/app', profile)).toBe(config)
  })
  it('preserves first-match ordering for duplicate, broad and narrower string entries', () => {
    const prepared = prepareCompilerAliases({
      resolve: {
        alias: [
          { find: '@root/specific', replacement: '/app/specific' },
          { find: '@root', replacement: '/app/broad' },
          { find: '@root/shadow', replacement: '/app/never' },
          { find: '@root', replacement: '/app/duplicate' },
        ],
      },
      test: {},
    })
    expect(prepared.aliases?.entries).toEqual([
      { find: '@root/specific', replacement: '/app/specific' },
      { find: '@root', replacement: '/app/broad' },
    ])
    expect(
      Object.keys(
        withCompilerAliases(config, '/app', profile, prepared.aliases).turbopack
          .resolveAlias!
      )
    ).toEqual([
      'unrelated',
      '@root/specific',
      '@root/specific/*',
      '@root',
      '@root/*',
    ])
  })
  it.each([
    { alias: [{ find: /^@root/, replacement: '/app' }] },
    { alias: [{ find: '@root', replacement: '/app', customResolver() {} }] },
    { alias: { '@root': 'relative-file.mjs' } },
    { alias: { 'foo/../bar': '/app/replacement.mjs' } },
    { alias: { 'foo//bar': '/app/replacement.mjs' } },
    { alias: { '@root': 'package-name' } },
    { alias: { vitest: '/app/replacement.mjs' } },
    { alias: { '@root': '/app/replacement.mjs?raw' } },
    { alias: { '@root': '/app/replacement.mjs' }, extensions: ['.ts'] },
  ])('keeps unsupported alias forms explicit (%j)', (resolve) => {
    expect(() => prepareCompilerAliases({ resolve, test: {} })).toThrow(
      'Unsupported setting config.resolve.alias'
    )
  })
  it('keeps a string boundary distinct from a longer non-subpath name', () => {
    const prepared = prepareCompilerAliases({
      resolve: {
        alias: [
          { find: 'foo', replacement: '/app/first' },
          { find: 'foo/bar', replacement: '/app/shadow' },
          { find: 'foobar', replacement: '/app/separate' },
        ],
      },
      test: {},
    })
    expect(prepared.aliases?.entries.map((entry) => entry.find)).toEqual([
      'foo',
      'foobar',
    ])
  })
  it('rejects accessors, inherited mappings and unqualified existing Next alias ordering', () => {
    const getter = jest.fn(() => '/app/replacement.mjs')
    expect(() =>
      prepareCompilerAliases({
        resolve: {
          alias: {
            get app() {
              return getter()
            },
          },
        },
        test: {},
      })
    ).toThrow('accessors')
    expect(getter).not.toHaveBeenCalled()
    expect(() =>
      prepareCompilerAliases(
        Object.assign(Object.create({ resolve: { alias: { app: '/app' } } }), {
          test: {},
        })
      )
    ).toThrow('plain object')
    const aliases = prepareCompilerAliases({
      resolve: { alias: { unrelated: '/app/replacement.mjs' } },
      test: {},
    }).aliases
    expect(() => withCompilerAliases(config, '/app', profile, aliases)).toThrow(
      'ordering with existing Next alias'
    )
    expect(() =>
      withCompilerAliases(
        config,
        '/app',
        { ...profile, environment: 'rsc' },
        aliases
      )
    ).toThrow('development Node profile')
  })
})

describe('private native import coverage negotiation', () => {
  const {
    requireImportCoverageCapability,
  } = require('next/dist/build/swc/test-import-coverage')
  it.each([undefined, 0, 2, NaN, 1.5])(
    'requires both exact native version 1 contracts: %s',
    (version) => {
      const unsupported =
        version === undefined
          ? {}
          : { projectTestEntryImportCoverageVersion: () => version }
      expect(() => requireImportCoverageCapability(unsupported, true)).toThrow(
        'source and import capability version 1'
      )
      const importOnly = {
        projectTestEntryImportCoverageVersion: () => 1,
        ...(version === undefined
          ? {}
          : { projectTestEntrySourceCoverageVersion: () => version }),
      }
      expect(() => requireImportCoverageCapability(importOnly, true)).toThrow(
        'source and import capability version 1'
      )
    }
  )
  it('does not inspect native capabilities without the private request', () => {
    const imported = jest.fn(() => 1),
      source = jest.fn(() => 1)
    const binding = {
      projectTestEntryImportCoverageVersion: imported,
      projectTestEntrySourceCoverageVersion: source,
    }
    requireImportCoverageCapability(binding, false)
    expect(imported).not.toHaveBeenCalled()
    expect(source).not.toHaveBeenCalled()
    requireImportCoverageCapability(binding, true)
    expect(imported).toHaveBeenCalledTimes(1)
    expect(source).toHaveBeenCalledTimes(1)
  })
})

describe('private native TypeScript config provenance ABI', () => {
  const {
    withNativeTsConfigRevision,
  } = require('next/dist/build/swc/test-tsconfig-provenance')
  it('preserves omitted argument arity and never probes capabilities by default', () => {
    const args = [true]
    const binding = {
      get projectTestEntryTsConfigInputsVersion() {
        throw new Error('must not read')
      },
    }
    expect(withNativeTsConfigRevision(binding, args, undefined)).toBe(args)
    expect(args).toEqual([true])
  })
  it.each([undefined, 0, 2])(
    'refuses an unrecognized capability %s',
    (version) => {
      const binding =
        version === undefined
          ? {}
          : { projectTestEntryTsConfigInputsVersion: () => version }
      expect(() =>
        withNativeTsConfigRevision(binding, [], 'parent-revision')
      ).toThrow('capability version 1')
    }
  )
  it('forwards the exact parent revision after every existing optional feature', () => {
    const aliases = ['@mapped']
    const args = [true, false, true, aliases, true]
    const binding = { projectTestEntryTsConfigInputsVersion: jest.fn(() => 1) }
    expect(
      withNativeTsConfigRevision(binding, args, 'parent-revision')
    ).toEqual([...args, 'parent-revision'])
    expect(args).toEqual([true, false, true, aliases, true])
    expect(binding.projectTestEntryTsConfigInputsVersion).toHaveBeenCalledTimes(
      1
    )
  })
  it('pads omitted earlier features without shifting the revision ABI position', () => {
    const binding = { projectTestEntryTsConfigInputsVersion: () => 1 }
    expect(withNativeTsConfigRevision(binding, [], 'parent-revision')).toEqual([
      false,
      false,
      false,
      [],
      false,
      'parent-revision',
    ])
  })
  it.each(['', 'x\0y', '😀'.repeat(100)])(
    'refuses invalid opaque revision bytes',
    (revision) => {
      const binding = {
        projectTestEntryTsConfigInputsVersion: jest.fn(() => 1),
      }
      expect(() => withNativeTsConfigRevision(binding, [], revision)).toThrow(
        'opaque parent revision'
      )
      expect(
        binding.projectTestEntryTsConfigInputsVersion
      ).not.toHaveBeenCalled()
    }
  )
})

// Built SWC exports are read-only getters. These writable test facades delegate
// to the actual modules, retaining their real functions and private reader maps.
// Jest hoists these registrations before the imports above.
jest.mock('next/dist/experimental/testing/compiler/transform-config', () => {
  const actual = jest.requireActual<
    typeof import('next/dist/experimental/testing/compiler/transform-config')
  >('next/dist/experimental/testing/compiler/transform-config')
  return {
    __esModule: true,
    ...actual,
    withCompilerTransforms(
      ...args: Parameters<typeof actual.withCompilerTransforms>
    ) {
      return actual.withCompilerTransforms(...args)
    },
  }
})

// These exercise the actual changed SWC loader closure with synthetic native,
// download and telemetry dependencies. They never load or qualify a native API.
describe('default-only binding attempt isolation (synthetic dependencies)', () => {
  const names = [
    'NODE_OPTIONS',
    'NODE_PATH',
    '__INTERNAL_CUSTOM_TURBOPACK_BINDINGS',
    'NEXT_TEST_NATIVE_DIR',
    'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
    'NEXT_TEST_WASM',
    'NEXT_TEST_WASM_DIR',
    'NEXT_DISABLE_SWC_WASM',
    'NEXT_MINIMAL',
    'NEXT_RSPACK',
    'NEXT_PRIVATE_LOCAL_WEBPACK',
    '__NEXT_PRIVATE_STANDALONE_CONFIG',
    '__NEXT_PRIVATE_RENDER_WORKER',
    'BROWSERSLIST',
    'BROWSERSLIST_CONFIG',
    'BROWSERSLIST_ENV',
    'BROWSERSLIST_DANGEROUS_EXTEND',
    'BROWSERSLIST_ROOT_PATH',
    'BROWSERSLIST_STATS',
    'NEXT_RUNTIME',
  ]
  async function withSyntheticLoader(
    fallbackWorks: boolean,
    run: (
      load: typeof import('next/dist/build/swc').loadBindings,
      counts: {
        local: number
        package: number
        fallback: number
        download: number
      }
    ) => Promise<void>
  ) {
    const saved = new Map(names.map((name) => [name, process.env[name]]))
    for (const name of names) delete process.env[name]
    const fallback = join(
      dirname(require.resolve('next/package.json')),
      'next-swc-fallback',
      '@next/swc-darwin-arm64',
      'next-swc.darwin-arm64.node'
    )
    const counts = { local: 0, package: 0, fallback: 0, download: 0 }
    const missing = () =>
      Object.assign(new Error('synthetic binding is not installed'), {
        code: 'MODULE_NOT_FOUND',
      })
    const mocks = [
      'os',
      '@next/swc/native/next-swc.darwin-arm64.node',
      '@next/swc-darwin-arm64',
      fallback,
      'next/dist/lib/download-swc',
      'next/dist/telemetry/events/swc-load-failure',
      'next/dist/lib/patch-incorrect-lockfile',
      'next/dist/build/output/log',
    ]
    // Jest caches importer/request IDs across in-band suites. Mock an installed
    // binding by its physical ID; reserve virtual IDs for absent dependencies.
    const loaderDirectory = dirname(require.resolve('next/dist/build/swc'))
    const nativeMockOptions = [1, 2, 3].map((index) => {
      try {
        mocks[index] = require.resolve(mocks[index], {
          paths: [loaderDirectory],
        })
        return undefined
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') {
          throw error
        }
        return { virtual: true }
      }
    })
    jest.doMock('os', () => ({
      ...jest.requireActual('os'),
      platform: () => 'darwin',
      arch: () => 'arm64',
    }))
    jest.doMock(
      mocks[1],
      () => {
        counts.local++
        throw missing()
      },
      nativeMockOptions[0]
    )
    jest.doMock(
      mocks[2],
      () => {
        counts.package++
        throw missing()
      },
      nativeMockOptions[1]
    )
    jest.doMock(
      mocks[3],
      () => {
        counts.fallback++
        if (!fallbackWorks) throw missing()
        return { getTargetTriple: () => 'synthetic-policy137' }
      },
      nativeMockOptions[2]
    )
    jest.doMock(mocks[4], () => ({
      downloadNativeNextSwc: async () => {
        counts.download++
      },
    }))
    jest.doMock(mocks[5], () => ({ eventSwcLoadFailure: async () => {} }))
    jest.doMock(mocks[6], () => ({ patchIncorrectLockfile: async () => {} }))
    jest.doMock(mocks[7], () => ({
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
    }))
    try {
      await jest.isolateModulesAsync(async () => {
        const load = jest.requireActual<typeof import('next/dist/build/swc')>(
          'next/dist/build/swc'
        ).loadBindings
        await run(load, counts)
      })
    } finally {
      for (const module of mocks) jest.dontMock(module)
      for (const [name, value] of saved) {
        if (value === undefined) delete process.env[name]
        else process.env[name] = value
      }
    }
  }
  it('does not expose a same-tick private failure to an ordinary fallback attempt', async () => {
    await withSyntheticLoader(true, async (load, counts) => {
      const privateAttempt = load(false, 'default-only')
      const ordinaryAttempt = load(false)
      await expect(privateAttempt).rejects.toThrow(
        /native binding fallback is unavailable/
      )
      const actual = await ordinaryAttempt
      expect(actual.isWasm).toBe(false)
      expect(actual.getTargetTriple?.()).toBe('synthetic-policy137')
      expect(counts.download).toBe(1)
      expect(counts.fallback).toBe(1)
      expect(await load(false)).toBe(actual)
    })
  })
  it('allows a later ordinary fallback after the private rejection is observed', async () => {
    await withSyntheticLoader(true, async (load, counts) => {
      await expect(load(false, 'default-only')).rejects.toThrow(
        /native binding fallback is unavailable/
      )
      expect(counts.download).toBe(0)
      const actual = await load(false)
      expect(actual.getTargetTriple?.()).toBe('synthetic-policy137')
      expect(counts.download).toBe(1)
      const before = { ...counts }
      await expect(load(false, 'default-only')).rejects.toThrow(
        /existing, custom or Wasm bindings are unavailable/
      )
      expect(counts).toEqual(before)
    })
  })
  it('preserves the original ordinary rejected-pending cache and performs no second fallback', async () => {
    await withSyntheticLoader(false, async (load, counts) => {
      process.env.NEXT_DISABLE_SWC_WASM = '1'
      const first = await load(false).then(
        () => {
          throw new Error('ordinary failure expected')
        },
        (error) => error
      )
      expect(first).toBeInstanceOf(Error)
      expect(first.message).toMatch(/Failed to load SWC binary/)
      expect(counts.download).toBe(1)
      const before = { ...counts }
      const second = await load(false).then(
        () => {
          throw new Error('cached ordinary failure expected')
        },
        (error) => error
      )
      expect(second).toBe(first)
      expect(counts).toEqual(before)
    })
  })
})

it('keeps CommonJS Promise values out of namespace then adoption', () => {
  const { execFileSync } = require('node:child_process')
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'cjs-namespace-integration.cjs')],
    { encoding: 'utf8', timeout: 5000 }
  )
  expect(
    JSON.parse(result).map((row: { result: string }) => row.result)
  ).toEqual(['namespace', 'namespace', 'own then', 'inherited then'])
})

it('serializes an explicit fixture layout through the existing native host registration', async () => {
  const host = {
    routePrefix: '/__next_testing_layout',
    fixtures: [
      {
        id: 'component',
        module: '/application/Component.jsx',
        exportName: 'default',
        layout: '/application/app/layout.jsx',
      },
    ],
  }
  expect(JSON.parse(serializeBrowserFixtureHost('/application', host))).toEqual(
    {
      ...host,
      fixtures: [
        {
          ...host.fixtures[0],
          module: 'Component.jsx',
          layout: 'app/layout.jsx',
        },
      ],
    }
  )
  expect(browserFixturePages(host)).toEqual([
    {
      pathname: '/__next_testing_layout/component',
      originalName: '/__next_testing_layout/component/page',
    },
  ])
  for (const layout of [
    'app/layout.jsx',
    '/other/layout.jsx',
    '/application',
  ]) {
    expect(() =>
      serializeBrowserFixtureHost('/application', {
        ...host,
        fixtures: [{ ...host.fixtures[0], layout }],
      })
    ).toThrow(
      'Browser fixture layouts must be contained in the application project'
    )
  }
  const result = require('node:child_process').spawnSync(
    process.execPath,
    [join(__dirname, 'layout-producers.cjs')],
    { encoding: 'utf8', timeout: 20_000 }
  )
  expect(result.error).toBeUndefined()
  expect(result.signal).toBeNull()
  expect(result.status).toBe(0)
  const actual = JSON.parse(result.stdout)
  expect(actual.actualDevFactoryNativeOptionsCaptured).toBe(true)
  expect(actual.development).toEqual(actual.production)
})

it('validates production Browser client profiles without enabling route-aware or non-Node runtimes', () => {
  const {
    validateTestProfile,
  } = require('next/dist/experimental/testing/compiler/original-config-observation')
  const profile = {
    id: 'production-client',
    environment: 'browser',
    browserClient: true,
    mode: 'production',
    runtime: 'nodejs',
    bundler: 'turbopack',
  }
  expect(() => validateTestProfile(profile)).not.toThrow()
  for (const unsupported of [
    { route: '/page' },
    { runtime: 'edge' },
    { bundler: 'webpack' },
    { mode: 'test' },
  ]) {
    expect(() => validateTestProfile({ ...profile, ...unsupported })).toThrow()
  }
})

it.each(['development', 'production'])(
  'validates explicit %s Node RSC AppProject routes',
  (mode) => {
    const {
      validateTestProfile,
    } = require('next/dist/experimental/testing/compiler/original-config-observation')
    const profile = {
      id: 'explicit-route',
      environment: 'rsc',
      mode,
      runtime: 'nodejs',
      bundler: 'turbopack',
      route: '/[tenant]/reference/[...slug]',
    }
    expect(() => validateTestProfile(profile)).not.toThrow()
    for (const unsupported of [
      { environment: 'node' },
      { environment: 'browser' },
      { runtime: 'edge' },
      { bundler: 'webpack' },
      { mode: 'test' },
      { route: 'relative' },
      { route: '/reference?x' },
      { route: '/reference#x' },
    ]) {
      expect(() =>
        validateTestProfile({ ...profile, ...unsupported })
      ).toThrow()
    }
  }
)

it('keeps callable publication namespaces private to each module generation', () => {
  const { execFileSync } = require('node:child_process')
  const actual = JSON.parse(
    execFileSync(
      process.execPath,
      [join(__dirname, 'commonjs-publication-runtime.cjs')],
      {
        encoding: 'utf8',
        timeout: 10000,
      }
    )
  )
  expect(actual).toEqual({ assertions: 20 })
})

describe('private development Node V8 source-preservation native ABI', () => {
  const {
    withNativeNodeSourcePreservation,
  } = require('next/dist/build/swc/test-node-source-preservation')
  it.each([
    [],
    [true],
    [false, true],
    [false, false, true],
    [false, false, false, ['mapped']],
    [false, false, false, [], true],
    [false, false, false, [], false, 'parent-revision'],
    [false, true, false, [], false, undefined, true],
  ])(
    'retains exact old array identity and arity when absent (%s)',
    (...features) => {
      const binding = {
        get projectTestEntryPreserveCoverageSourcesVersion() {
          throw new Error('must not negotiate')
        },
      }
      const before = [...features]
      expect(withNativeNodeSourcePreservation(binding, features, false)).toBe(
        features
      )
      expect(features).toEqual(before)
    }
  )
  it.each([undefined, 0, 2, -1, 1.5, NaN])(
    'rejects unsupported Native version %s before sending the new role',
    (version) => {
      const binding =
        version === undefined
          ? {}
          : { projectTestEntryPreserveCoverageSourcesVersion: () => version }
      expect(() => withNativeNodeSourcePreservation(binding, [], true)).toThrow(
        'does not support source preservation for development Node coverage'
      )
    }
  )
  it('appends only its eighth feature and preserves every earlier value', () => {
    const aliases = ['mapped?query']
    const features = [false, false, false, aliases, true, 'parent-revision']
    const getter = jest.fn(() => 1)
    const actual = withNativeNodeSourcePreservation(
      { projectTestEntryPreserveCoverageSourcesVersion: getter },
      features,
      true
    )
    expect(actual).toEqual([...features, false, true])
    expect(actual[3]).toBe(aliases)
    expect(features).toHaveLength(6)
    expect(getter).toHaveBeenCalledTimes(1)
  })
  it('pads an otherwise empty tuple without shifting existing optional positions', () => {
    expect(
      withNativeNodeSourcePreservation(
        { projectTestEntryPreserveCoverageSourcesVersion: () => 1 },
        [],
        true
      )
    ).toEqual([false, false, false, [], false, undefined, false, true])
  })
  it.each([0, 1, 2, 6])(
    'refuses an incompatible requested feature at index %s',
    (index) => {
      const features = [false, false, false, [], false, undefined, false]
      features[index] = true
      const getter = jest.fn(() => 1)
      expect(() =>
        withNativeNodeSourcePreservation(
          { projectTestEntryPreserveCoverageSourcesVersion: getter },
          features,
          true
        )
      ).toThrow('isolated development Node entry')
      expect(getter).not.toHaveBeenCalled()
    }
  )
})
