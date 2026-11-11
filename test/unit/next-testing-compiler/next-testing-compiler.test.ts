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
import { createHash } from 'crypto'
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
  symlink,
} from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { createTestCompilerSession } from 'next/dist/experimental/testing/compiler'
import { createDevTurbopackProject } from 'next/dist/build/swc/dev-project'
import { createCompiledRouteRenderOpts } from 'next/dist/experimental/testing/compiler/route-render'
import { serialize, deserialize } from 'v8'

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

describe('client async continuation compiler certificate', () => {
  const {
    readClientDescriptor,
  } = require('next/dist/experimental/testing/compiler/client')
  it.each([undefined, null, '', 'lexical-only', 1])(
    'refuses missing or incorrect async scope provenance %p',
    async (asyncScope) => {
      const root = await mkdtemp(
        join(tmpdir(), 'next-client-scope-certificate-')
      )
      try {
        const path = 'server/next-test/client.client.json'
        await mkdir(join(root, 'server/next-test'), { recursive: true })
        await writeFile(
          join(root, path),
          JSON.stringify({
            version: 1,
            asyncScope,
            scripts: ['static/entry.js'],
            styles: [],
          })
        )
        await expect(
          readClientDescriptor(root, path, [path, 'static/entry.js'], 'client')
        ).rejects.toThrow('Invalid native Browser Mode descriptor')
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    }
  )
  it('retains the native continuation certificate in the published client closure', async () => {
    const root = await mkdtemp(join(tmpdir(), 'next-client-scope-certificate-'))
    try {
      const path = 'server/next-test/client.client.json'
      const expected = {
        version: 1,
        asyncScope: 'promise-continuations-v1',
        scripts: ['static/entry.js'],
        styles: [],
      }
      await mkdir(join(root, 'server/next-test'), { recursive: true })
      await writeFile(join(root, path), JSON.stringify(expected))
      await expect(
        readClientDescriptor(root, path, [path, 'static/entry.js'], 'client')
      ).resolves.toEqual(expected)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
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

// Component-only native/session model. This mocked endpoint is never evidence of
// an actual negotiated native producer; live qualification stays root-owned.
async function createNativeConfigIssuer(
  prefix: string,
  controls: {
    createdRoot(value: string): void
    hashMode(): 'sha256' | 'xxh' | 'mismatch' | 'noncanonical'
    omitListed(): boolean
    deferredSnapshot(): Promise<void> | undefined
    recordSidecarHash(value: string): void
  }
) {
  const { realpath } = await import('fs/promises')
  const root = await realpath(await mkdtemp(prefix))
  controls.createdRoot(root)
  await writeFile(join(root, 'subject.ts'), 'export const value = 1\n')
  await writeFile(join(root, 'config.json'), '{}\n')
  const selectedProfile: import('next/dist/experimental/testing/contracts').TestProfile =
    {
      id: 'native-session-component',
      mode: 'development',
      environment: 'node',
      runtime: 'nodejs',
      bundler: 'turbopack',
    }
  const requests: any[] = []
  const shutdownNative = jest.fn(async () => {})
  const sha = (bytes: string | Buffer) =>
    createHash('sha256').update(bytes).digest('hex')
  jest.mocked(createDevTurbopackProject).mockImplementation(
    async () =>
      ({
        nativeProjectPaths: Object.freeze({
          rootPath: root,
          projectPath: '.',
        }),
        project: {
          shutdown: shutdownNative,
          testEntry: async (input: any) => {
            requests.push({ ...input })
            return {
              writeToDiskSnapshot: async (directory: string) => {
                await controls.deferredSnapshot()
                const destination = join(root, '.next', directory)
                const entryPath = `server/next-test/${input.id}.js`
                await mkdir(dirname(join(destination, entryPath)), {
                  recursive: true,
                })
                const code = 'export const value = 1\n'
                await writeFile(join(destination, entryPath), code)
                const serverPaths = [
                  {
                    path: entryPath,
                    contentHash: 'ordinary-native-opaque-hash',
                  },
                ]
                if (input.tsconfigInputRevision !== undefined) {
                  const nativePath = (file: string) => ({
                    nativePath:
                      file === root ? '' : file.slice(root.length + 1),
                    path: file,
                  })
                  const config = nativePath(join(root, 'config.json'))
                  const records = [
                    'aliases',
                    'decorators',
                    'jsx',
                    'typescript',
                  ].flatMap((consumer) => {
                    const context = {
                      consumer,
                      configuredPath: config,
                      consumerPath: nativePath(root),
                      lookupPath: nativePath(root),
                      request: 'native-options',
                      chainIndex: 0,
                      attemptIndex: 0,
                    }
                    return [
                      {
                        context,
                        order: [],
                        kind: 'selection',
                        path: nativePath(root),
                        fact: { selected: config },
                      },
                      {
                        context,
                        order: [],
                        kind: 'config-read',
                        path: config,
                        fact: {
                          status: 'parsed',
                          sha256: sha('{}\n'),
                          observed: 'file',
                          identity: {
                            status: 'found',
                            target: config,
                            symlinks: [],
                          },
                        },
                      },
                    ]
                  })
                  const payload = {
                    version: 1,
                    kind: 'native-typescript-config-inputs',
                    mode: 'development',
                    environment: 'node',
                    route: null,
                    browserClient: false,
                    sourceCoverage: false,
                    entryId: input.id,
                    entryFile: input.file,
                    entryPath,
                    revision: input.tsconfigInputRevision,
                    filesystemRoot: nativePath(root),
                    projectPath: nativePath(root),
                    complete: true,
                    reasons: [],
                    scripts: [
                      {
                        path: entryPath,
                        sha256: sha(code),
                        mapPath: null,
                        mapSha256: null,
                      },
                    ],
                    records,
                  }
                  const bytes = JSON.stringify(payload),
                    path = entryPath.replace(/\.js$/, '.tsconfig-inputs.json')
                  await writeFile(join(destination, path), bytes)
                  controls.recordSidecarHash(sha(bytes))
                  const nativeHash = createHash('sha256')
                    .update(bytes)
                    .digest('base64')
                  if (!controls.omitListed())
                    serverPaths.push({
                      path,
                      contentHash:
                        controls.hashMode() === 'sha256'
                          ? nativeHash
                          : controls.hashMode() === 'xxh'
                            ? '0123456789abcdef0123456789abcdef'
                            : controls.hashMode() === 'mismatch'
                              ? Buffer.alloc(32).toString('base64')
                              : nativeHash.replace(/=$/, ''),
                    })
                }
                return {
                  value: {
                    type: 'nodejs',
                    entryPath,
                    serverPaths,
                    clientPaths: [],
                  },
                  issues: [],
                }
              },
            }
          },
        },
      }) as any
  )
  return { root, selectedProfile, requests, shutdownNative }
}

describe('private native TypeScript config Session issuance components', () => {
  let root: string
  let owned: Awaited<ReturnType<typeof createTestCompilerSession>> | undefined
  let selectedProfile: import('next/dist/experimental/testing/contracts').TestProfile
  let requests: any[]
  let hashMode: 'sha256' | 'xxh' | 'mismatch' | 'noncanonical'
  let omitListed: boolean
  let emittedSidecarSha256: string | undefined
  let shutdownNative: jest.Mock
  let deferredSnapshot: (() => Promise<void>) | undefined
  const previousEnvironment = process.env.NODE_ENV
  const sha = (bytes: string | Buffer) =>
    createHash('sha256').update(bytes).digest('hex')
  beforeEach(async () => {
    process.env = { ...process.env, NODE_ENV: 'development' }
    hashMode = 'sha256'
    omitListed = false
    emittedSidecarSha256 = undefined
    deferredSnapshot = undefined
    ;({ root, selectedProfile, requests, shutdownNative } =
      await createNativeConfigIssuer(
        '/private/tmp/next-session-native-config-',
        {
          createdRoot: (value) => {
            root = value
          },
          hashMode: () => hashMode,
          omitListed: () => omitListed,
          deferredSnapshot: () => deferredSnapshot?.(),
          recordSidecarHash: (value) => {
            emittedSidecarSha256 = value
          },
        }
      ))
    owned = await createTestCompilerSession(root, selectedProfile)
  })
  afterEach(async () => {
    await owned?.dispose()
    owned = undefined
    await rm(root, { recursive: true, force: true })
    process.env = { ...process.env, NODE_ENV: previousEnvironment }
  })
  async function selection(role: 'runtime' | 'compiler-source' = 'runtime') {
    const { sourceAnalysisEntryId } = await import(
      'next/dist/experimental/testing/coverage/source-analysis'
    )
    const file = join(root, 'subject.ts')
    return {
      version: 1 as const,
      id: 'original-component-request',
      revision: 'original-before-endpoint-revision',
      profile: { ...selectedProfile },
      source: {
        id:
          role === 'runtime'
            ? 'runtime-subject'
            : sourceAnalysisEntryId(selectedProfile, file),
        file,
        sha256: sha(await readFile(file)),
      },
    }
  }
  async function compileRuntime(
    selected: Awaited<ReturnType<typeof selection>>
  ) {
    return owned!.compileRuntimeWithNativeTsConfigInputs(
      {
        id: selected.source.id,
        file: selected.source.file,
        profile: selected.profile,
      },
      {
        selection: selected,
        signal: new AbortController().signal,
        coverage: { version: 1, kind: 'node-line' },
      }
    )
  }
  it.each(['runtime', 'compiler-source'] as const)(
    'models original %s revision, role and Session-sealed fact identities',
    async (role) => {
      const selected = await selection(role)
      const compilation =
        role === 'runtime'
          ? await compileRuntime(selected)
          : await owned!.compileCoverageSourceWithNativeTsConfigInputs(
              { file: selected.source.file, sha256: selected.source.sha256 },
              { selection: selected, signal: new AbortController().signal }
            )
      const artifact =
        compilation.role === 'runtime'
          ? compilation.value
          : compilation.value.artifact
      expect(requests[0].tsconfigInputRevision).toBe(selected.revision)
      expect(artifact.revision).toBe(selected.revision)
      expect(compilation.request.revision).toBe(selected.revision)
      expect(compilation.request.role).toBe(role)
      expect(Object.isFrozen(compilation)).toBe(true)
      expect(Object.isFrozen(artifact)).toBe(true)
      expect(
        Object.getOwnPropertyDescriptor(artifact, 'nativeTsConfigInputs')
      ).toEqual({
        value: artifact.nativeTsConfigInputs,
        enumerable: true,
        writable: false,
        configurable: false,
      })
      const staged = await owned!.prepareNativeTsConfigInputs(compilation, {
        role,
        selection: selected,
        signal: new AbortController().signal,
      })
      const fact = await staged.seal()
      const expected = { request: fact.request, compiler: { ...fact.compiler } }
      await owned!.dispose()
      const { assertSealedSessionNativeTsConfigInputs } = await import(
        'next/dist/experimental/testing/compiler'
      )
      await expect(
        assertSealedSessionNativeTsConfigInputs({
          fact,
          expected,
          signal: new AbortController().signal,
        })
      ).resolves.toBeUndefined()
      await expect(
        assertSealedSessionNativeTsConfigInputs({
          fact: structuredClone(fact),
          expected,
          signal: new AbortController().signal,
        })
      ).rejects.toThrow('original genuine Session issuer')
    }
  )
  it('keeps ordinary unrequested endpoint arguments and fallback revision behavior', async () => {
    const selected = await selection()
    const artifact = await owned!.compile(
      {
        id: selected.source.id,
        file: selected.source.file,
        profile: selected.profile,
      },
      { signal: new AbortController().signal }
    )
    expect(requests).toHaveLength(1)
    expect(Object.hasOwn(requests[0], 'tsconfigInputRevision')).toBe(false)
    expect(Object.hasOwn(artifact, 'nativeTsConfigInputs')).toBe(false)
    expect(artifact.revision).not.toBe(selected.revision)
  })
  it.each(['xxh', 'mismatch', 'noncanonical'] as const)(
    'refuses a native sidecar first-read hash without exact native SHA256 binding: %s',
    async (mode) => {
      hashMode = mode
      await expect(compileRuntime(await selection())).rejects.toThrow(
        mode === 'mismatch'
          ? 'differs from the actual emitted asset'
          : 'canonical SHA256 Base64'
      )
    }
  )
  it('refuses a physically emitted but unlisted native sidecar', async () => {
    omitListed = true
    await expect(compileRuntime(await selection())).rejects.toThrow(
      'original native snapshot allocation/inventory'
    )
  })
  it.each(['clone', 'wrong-role', 'wrong-selection', 'raw-data'] as const)(
    'refuses a borrowed or reconstructed Session wrapper: %s',
    async (kind) => {
      const selected = await selection(),
        compilation = await compileRuntime(selected)
      const value =
        kind === 'clone'
          ? structuredClone(compilation)
          : kind === 'raw-data'
            ? { ...compilation }
            : compilation
      await expect(
        owned!.prepareNativeTsConfigInputs(value, {
          role: kind === 'wrong-role' ? 'compiler-source' : 'runtime',
          selection:
            kind === 'wrong-selection'
              ? { ...selected, revision: 'fresh-revision' }
              : selected,
          signal: new AbortController().signal,
        })
      ).rejects.toThrow('original Session compilation identity')
    }
  )
  it('retains the original published allocation after native compilation shutdown', async () => {
    const selected = await selection(),
      compilation = await compileRuntime(selected)
    await owned!.shutdownCompilation()
    const staged = await owned!.prepareNativeTsConfigInputs(compilation, {
      role: 'runtime',
      selection: selected,
      signal: new AbortController().signal,
    })
    await expect(staged.seal()).resolves.toHaveProperty(
      'request.revision',
      selected.revision
    )
  })
  it('invalidates an already staged seal synchronously when disposal is invoked', async () => {
    const selected = await selection(),
      compilation = await compileRuntime(selected)
    const staged = await owned!.prepareNativeTsConfigInputs(compilation, {
      role: 'runtime',
      selection: selected,
      signal: new AbortController().signal,
    })
    let finish!: () => void
    shutdownNative.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    const disposal = owned!.dispose()
    await expect(staged.seal()).rejects.toThrow(
      'original allocation lease is closed'
    )
    await Promise.resolve()
    finish()
    await disposal
  })
  it('refuses repeated private request identities before another endpoint', async () => {
    const selected = await selection()
    await compileRuntime(selected)
    await expect(compileRuntime(selected)).rejects.toThrow(
      'identity already consumed'
    )
    expect(requests).toHaveLength(1)
  })
  it('binds original request/source/hash data before queued compilation', async () => {
    const selected = await selection()
    const result = compileRuntime(selected)
    selected.revision = 'mutated-request'
    selected.source.sha256 = '0'.repeat(64)
    const compilation = await result
    expect(compilation.request.revision).toBe(
      'original-before-endpoint-revision'
    )
    expect(compilation.request.source.sha256).not.toBe('0'.repeat(64))
  })

  it.each([
    ['compilerAliases', 'delete'],
    ['compilerAliases', 'replace'],
    ['compilerTransforms', 'delete'],
    ['compilerTransforms', 'replace'],
  ] as const)(
    'retains actual configured %s admission when caller options %s during factory await',
    async (field, mutation) => {
      await owned!.dispose()
      const transformConfig = await import(
        'next/dist/experimental/testing/compiler/transform-config'
      )
      const spy = jest
        .spyOn(transformConfig, 'withCompilerTransforms')
        .mockImplementation((config) => config)
      try {
        const options: any = {
          [field]:
            field === 'compilerAliases'
              ? {
                  version: 1,
                  entries: [
                    {
                      find: 'component-alias',
                      replacement: join(root, 'subject.ts'),
                    },
                  ],
                  inputs: [],
                }
              : {
                  version: 1,
                  socket: '/component-only',
                  realm: 'component-only',
                  revision: 'component-only',
                },
        }
        const creating = createTestCompilerSession(
          root,
          selectedProfile,
          options
        )
        if (mutation === 'delete') delete options[field]
        else options[field] = undefined
        owned = await creating
        await expect(compileRuntime(await selection())).rejects.toThrow(
          'original default Session allocation'
        )
        expect(requests).toHaveLength(0)
      } finally {
        spy.mockRestore()
      }
    }
  )
  it.each(['prepare', 'seal'] as const)(
    'vetoes abort in the outer %s continuation and never brands a late fact',
    async (phase) => {
      const selected = await selection(),
        compilation = await compileRuntime(selected)
      const reader = await import(
        'next/dist/experimental/testing/coverage/native-tsconfig-inputs'
      )
      const original = reader.prepareNativeTsConfigInputs
      const controller = new AbortController()
      let rawFact: any
      const spy = jest
        .spyOn(reader, 'prepareNativeTsConfigInputs')
        .mockImplementation(async (options) => {
          const staged = (await original(options))!
          if (phase === 'prepare') {
            controller.abort(new Error('outer prepare abort'))
            return staged
          }
          return {
            watchInputs: staged.watchInputs,
            async seal() {
              rawFact = await staged.seal()
              controller.abort(new Error('outer seal abort'))
              return rawFact
            },
          }
        })
      try {
        const preparing = owned!.prepareNativeTsConfigInputs(compilation, {
          role: 'runtime',
          selection: selected,
          signal: controller.signal,
        })
        if (phase === 'prepare')
          await expect(preparing).rejects.toThrow('outer prepare abort')
        else {
          const staged = await preparing
          await expect(staged.seal()).rejects.toThrow('outer seal abort')
          const { assertSealedSessionNativeTsConfigInputs } = await import(
            'next/dist/experimental/testing/compiler'
          )
          await expect(
            assertSealedSessionNativeTsConfigInputs({
              fact: rawFact,
              expected: {
                request: rawFact.request,
                compiler: { ...rawFact.compiler },
              },
              signal: new AbortController().signal,
            })
          ).rejects.toThrow('original genuine Session issuer')
        }
      } finally {
        spy.mockRestore()
      }
    }
  )
  it('vetoes abort after artifact publication but before the issuer continuation', async () => {
    const selected = await selection(),
      controller = new AbortController()
    const crypto = require('crypto') as typeof import('crypto')
    const original = crypto.createHash
    const spy = jest
      .spyOn(crypto, 'createHash')
      .mockImplementation((...args) => {
        const hash = Reflect.apply(original, crypto, args)
        const digest = hash.digest.bind(hash)
        hash.digest = ((encoding?: import('crypto').BinaryToTextEncoding) => {
          const value = encoding ? digest(encoding) : digest()
          if (encoding === 'hex' && value === emittedSidecarSha256)
            queueMicrotask(() =>
              controller.abort(new Error('outer issue abort'))
            )
          return value
        }) as typeof hash.digest
        return hash
      })
    try {
      await expect(
        owned!.compileRuntimeWithNativeTsConfigInputs(
          {
            id: selected.source.id,
            file: selected.source.file,
            profile: selected.profile,
          },
          {
            selection: selected,
            signal: controller.signal,
            coverage: { version: 1, kind: 'node-line' },
          }
        )
      ).rejects.toThrow('outer issue abort')
    } finally {
      spy.mockRestore()
    }
  })
  it('refuses a raw reader fact issued with a synthetic no-op callback as genuine Session origin', async () => {
    const selected = await selection(),
      compilation = await compileRuntime(selected)
    const artifact =
      compilation.role === 'runtime'
        ? compilation.value
        : compilation.value.artifact
    const { prepareNativeTsConfigInputs } = await import(
      'next/dist/experimental/testing/coverage/native-tsconfig-inputs'
    )
    const raw = await prepareNativeTsConfigInputs({
      artifact,
      reference: artifact.nativeTsConfigInputs,
      authorization: {
        request: compilation.request,
        artifactRoot: artifact.rootDir,
        assertLease() {},
      },
      signal: new AbortController().signal,
    })
    const fact = await raw!.seal()
    const { assertSealedSessionNativeTsConfigInputs } = await import(
      'next/dist/experimental/testing/compiler'
    )
    await expect(
      assertSealedSessionNativeTsConfigInputs({
        fact,
        expected: { request: fact.request, compiler: { ...fact.compiler } },
        signal: new AbortController().signal,
      })
    ).rejects.toThrow('original genuine Session issuer')
  })
  it('refuses an original wrapper borrowed by a different Session', async () => {
    const selected = await selection(),
      compilation = await compileRuntime(selected)
    const other = await createTestCompilerSession(root, selectedProfile)
    try {
      await expect(
        other.prepareNativeTsConfigInputs(compilation, {
          role: 'runtime',
          selection: selected,
          signal: new AbortController().signal,
        })
      ).rejects.toThrow('original Session compilation identity')
    } finally {
      await other.dispose()
    }
  })
  it('does not issue from a pending snapshot after disposal synchronously invalidates the lease', async () => {
    let arrived!: () => void, release!: () => void
    const atSnapshot = new Promise<void>((resolve) => {
        arrived = resolve
      }),
      blocked = new Promise<void>((resolve) => {
        release = resolve
      })
    deferredSnapshot = async () => {
      arrived()
      await blocked
    }
    const compiling = compileRuntime(await selection())
    await atSnapshot
    const disposal = owned!.dispose()
    release()
    await expect(compiling).rejects.toThrow('original')
    await disposal
  })

  it('cannot resurrect an issued wrapper with a fresh prepare signal after original compile cancellation', async () => {
    const selected = await selection(),
      original = new AbortController()
    const compilation = await owned!.compileRuntimeWithNativeTsConfigInputs(
      {
        id: selected.source.id,
        file: selected.source.file,
        profile: selected.profile,
      },
      {
        selection: selected,
        signal: original.signal,
        coverage: { version: 1, kind: 'node-line' },
      }
    )
    original.abort(new Error('original compile cancelled'))
    await expect(
      owned!.prepareNativeTsConfigInputs(compilation, {
        role: 'runtime',
        selection: selected,
        signal: new AbortController().signal,
      })
    ).rejects.toThrow('original compile operation was cancelled')
  })
  it('refuses an unknown private compile flag instead of ignoring it', async () => {
    const selected = await selection()
    await expect(
      owned!.compileRuntimeWithNativeTsConfigInputs(
        {
          id: selected.source.id,
          file: selected.source.file,
          profile: selected.profile,
        },
        {
          selection: selected,
          signal: new AbortController().signal,
          coverage: { version: 1, kind: 'node-line' },
          nativeTsConfigInputs: true,
        } as any
      )
    ).rejects.toThrow('exact data shape')
    expect(requests).toHaveLength(0)
  })

  it('vetoes cancellation in the final retained-origin assertion continuation after disposal', async () => {
    const selected = await selection(),
      compilation = await compileRuntime(selected)
    const staged = await owned!.prepareNativeTsConfigInputs(compilation, {
      role: 'runtime',
      selection: selected,
      signal: new AbortController().signal,
    })
    const fact = await staged.seal()
    await owned!.dispose()
    const reader = await import(
      'next/dist/experimental/testing/coverage/native-tsconfig-inputs'
    )
    const original = reader.assertParentNativeTsConfigFact
    const controller = new AbortController()
    const spy = jest
      .spyOn(reader, 'assertParentNativeTsConfigFact')
      .mockImplementation(async (options) => {
        await original(options)
        controller.abort(new Error('outer retained assertion abort'))
      })
    try {
      const { assertSealedSessionNativeTsConfigInputs } = await import(
        'next/dist/experimental/testing/compiler'
      )
      await expect(
        assertSealedSessionNativeTsConfigInputs({
          fact,
          expected: { request: fact.request, compiler: { ...fact.compiler } },
          signal: controller.signal,
        })
      ).rejects.toThrow('outer retained assertion abort')
    } finally {
      spy.mockRestore()
    }
  })

  it.each(['bad/revision', 'unicode-π', 'revision:1', 'a'.repeat(245)])(
    'refuses an invalid private artifact basename revision before endpoint or allocation: %s',
    async (revision) => {
      const selected = await selection()
      selected.revision = revision
      const before = await readdir(join(root, '.next'))
      await expect(compileRuntime(selected)).rejects.toThrow(
        'private revision must fit the generated artifact basename'
      )
      expect(requests).toHaveLength(0)
      expect(await readdir(join(root, '.next'))).toEqual(before)
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
jest.mock(
  'next/dist/experimental/testing/coverage/native-tsconfig-inputs',
  () => {
    const actual = jest.requireActual<
      typeof import('next/dist/experimental/testing/coverage/native-tsconfig-inputs')
    >('next/dist/experimental/testing/coverage/native-tsconfig-inputs')
    return {
      __esModule: true,
      ...actual,
      prepareNativeTsConfigInputs(
        ...args: Parameters<typeof actual.prepareNativeTsConfigInputs>
      ) {
        return actual.prepareNativeTsConfigInputs(...args)
      },
      assertParentNativeTsConfigFact(
        ...args: Parameters<typeof actual.assertParentNativeTsConfigFact>
      ) {
        return actual.assertParentNativeTsConfigFact(...args)
      },
    }
  }
)

describe('private native runtime conversion grants (component issuer)', () => {
  let root: string
  let owned: Awaited<ReturnType<typeof createTestCompilerSession>> | undefined
  let selectedProfile: import('next/dist/experimental/testing/contracts').TestProfile
  let hashMode: 'sha256' | 'xxh' | 'mismatch' | 'noncanonical'
  let omitListed: boolean
  let emittedSidecarSha256: string | undefined
  let deferredSnapshot: (() => Promise<void>) | undefined
  const previousEnvironment = process.env.NODE_ENV
  const sha = (bytes: string | Buffer) =>
    createHash('sha256').update(bytes).digest('hex')
  beforeEach(async () => {
    process.env = { ...process.env, NODE_ENV: 'development' }
    hashMode = 'sha256'
    omitListed = false
    emittedSidecarSha256 = undefined
    deferredSnapshot = undefined
    ;({ root, selectedProfile } = await createNativeConfigIssuer(
      '/private/tmp/next-session-native-config-',
      {
        createdRoot: (value) => {
          root = value
        },
        hashMode: () => hashMode,
        omitListed: () => omitListed,
        deferredSnapshot: () => deferredSnapshot?.(),
        recordSidecarHash: (value) => {
          emittedSidecarSha256 = value
        },
      }
    ))
    owned = await createTestCompilerSession(root, selectedProfile)
  })
  afterEach(async () => {
    await owned?.dispose()
    owned = undefined
    await rm(root, { recursive: true, force: true })
    process.env = { ...process.env, NODE_ENV: previousEnvironment }
  })
  async function selection(role: 'runtime' | 'compiler-source' = 'runtime') {
    const { sourceAnalysisEntryId } = await import(
      'next/dist/experimental/testing/coverage/source-analysis'
    )
    const file = join(root, 'subject.ts')
    return {
      version: 1 as const,
      id: 'original-component-request',
      revision: 'original-before-endpoint-revision',
      profile: { ...selectedProfile },
      source: {
        id:
          role === 'runtime'
            ? 'runtime-subject'
            : sourceAnalysisEntryId(selectedProfile, file),
        file,
        sha256: sha(await readFile(file)),
      },
    }
  }
  async function compileRuntime(
    selected: Awaited<ReturnType<typeof selection>>
  ) {
    return owned!.compileRuntimeWithNativeTsConfigInputs(
      {
        id: selected.source.id,
        file: selected.source.file,
        profile: selected.profile,
      },
      {
        selection: selected,
        signal: new AbortController().signal,
        coverage: { version: 1, kind: 'node-line' },
      }
    )
  }

  async function issued(role: 'runtime' | 'compiler-source' = 'runtime') {
    const selected = await selection(role)
    const compilation =
      role === 'runtime'
        ? await compileRuntime(selected)
        : await owned!.compileCoverageSourceWithNativeTsConfigInputs(
            { file: selected.source.file, sha256: selected.source.sha256 },
            { selection: selected, signal: new AbortController().signal }
          )
    const staged = await owned!.prepareNativeTsConfigInputs(compilation, {
      role,
      selection: selected,
      signal: new AbortController().signal,
    })
    const fact = await staged.seal()
    expect(fact.reference.nativeMetadata.sha256).toBe(emittedSidecarSha256)
    const artifact =
      compilation.role === 'runtime'
        ? compilation.value
        : compilation.value.artifact
    const signal = new AbortController().signal
    const api = await import('next/dist/experimental/testing/compiler')
    return {
      compilation,
      artifact,
      fact,
      selected,
      signal,
      api,
      options: { compilation, artifact, fact, selection: selected, signal },
    }
  }
  it('seals current bytes with an original grant while preserving the original Session fact', async () => {
    const f = await issued(),
      reader = await import(
        'next/dist/experimental/testing/coverage/native-tsconfig-inputs'
      )
    const original = reader.prepareNativeTsConfigInputs
    let temporary: unknown
    const spy = jest
      .spyOn(reader, 'prepareNativeTsConfigInputs')
      .mockImplementation(async (...args) => {
        const staged = await original(...args)
        return (
          staged && {
            watchInputs: staged.watchInputs,
            async seal() {
              const value = await staged.seal()
              temporary = value
              return value
            },
          }
        )
      })
    let grant:
      | Awaited<ReturnType<typeof f.api.prepareSessionNativeRuntimeConversion>>
      | undefined
    try {
      grant = await f.api.prepareSessionNativeRuntimeConversion(f.options)
      f.api.assertSessionNativeRuntimeConversion(
        grant,
        f.artifact,
        f.fact,
        f.signal
      )
      await f.api.sealSessionNativeRuntimeConversion(
        grant,
        f.artifact,
        f.fact,
        f.signal
      )
      expect(temporary).toBeDefined()
      expect(temporary).not.toBe(f.fact)
      await expect(
        f.api.assertSealedSessionNativeTsConfigInputs({
          fact: temporary as any,
          expected: { request: f.fact.request, compiler: f.fact.compiler },
          signal: f.signal,
        })
      ).rejects.toThrow('original genuine Session issuer')
      await expect(
        f.api.assertSealedSessionNativeTsConfigInputs({
          fact: f.fact,
          expected: { request: f.fact.request, compiler: f.fact.compiler },
          signal: f.signal,
        })
      ).resolves.toBeUndefined()
    } finally {
      if (grant) f.api.retireSessionNativeRuntimeConversion(grant)
      spy.mockRestore()
    }
  })
  it('binds a grant to its exact original fact even when a second fact has the same emission identity', async () => {
    const f = await issued(),
      grant = await f.api.prepareSessionNativeRuntimeConversion(f.options)
    try {
      const stage = await owned!.prepareNativeTsConfigInputs(f.compilation, {
          role: 'runtime',
          selection: f.selected,
          signal: f.signal,
        }),
        second = await stage.seal()
      expect(second).not.toBe(f.fact)
      expect(second).toEqual(f.fact)
      expect(() =>
        f.api.assertSessionNativeRuntimeConversion(
          grant,
          f.artifact,
          second,
          f.signal
        )
      ).toThrow('active runtime native grant')
      expect(() =>
        f.api.assertSessionNativeRuntimeConversion(
          grant,
          f.artifact,
          f.fact,
          f.signal
        )
      ).not.toThrow()
    } finally {
      f.api.retireSessionNativeRuntimeConversion(grant)
    }
  })
  // Incomplete component envelope: only grant/copy lifecycle is exercised, no counts or conversion.
  function incompleteCoverage(f: Awaited<ReturnType<typeof issued>>) {
    const expected = {
      projectDir: root,
      artifactRoot: f.artifact.rootDir,
      revision: f.artifact.revision,
      runId: 'component-copy',
      entry: {
        id: f.selected.source.id,
        file: f.selected.source.file,
        profile: f.selected.profile,
      },
      entrySha256: f.selected.source.sha256,
      selectedSources: [
        { file: f.selected.source.file, sha256: f.selected.source.sha256 },
      ],
      runtimeJSX: { version: 1 as const, assertLease() {} },
    }
    const completion = {
      version: 1,
      runId: expected.runId,
      entryId: f.artifact.entryId,
      revision: f.artifact.revision,
      complete: false,
    } as any
    return {
      expected,
      completion,
      authority: {
        compilation: f.compilation,
        fact: f.fact,
        selection: f.selected,
      },
    }
  }
  it('recognizes only its exact retained copy and removes copy permission at retirement', async () => {
    const f = await issued(),
      input = incompleteCoverage(f),
      api = await import(
        'next/dist/experimental/testing/coverage/runtime-authorization'
      )
    const retained = await api.retainNativeRuntimeCoverageAuthorization(
      f.artifact,
      input.completion,
      input.expected,
      input.authority,
      f.signal
    )
    try {
      await expect(
        api.assertNativeCompilerRuntimeCoverage(
          structuredClone(retained.artifact),
          retained.completion,
          retained.expected,
          f.signal
        )
      ).rejects.toThrow('exact retained native runtime authority')
      await expect(
        api.assertNativeCompilerRuntimeCoverage(
          retained.artifact,
          structuredClone(retained.completion),
          retained.expected,
          f.signal
        )
      ).rejects.toThrow('exact retained native runtime authority')
      await api.sealNativeRuntimeCoverageAuthorization(retained, f.signal)
      expect(() =>
        api.assertSealedNativeRuntimeCoverageAuthorization(retained, f.signal)
      ).not.toThrow()
    } finally {
      api.retireNativeRuntimeCoverageAuthorization(retained)
    }
    expect(() =>
      api.assertSealedNativeRuntimeCoverageAuthorization(retained, f.signal)
    ).toThrow('sealed native runtime authority')
  })
  it('retires the real retained copy when composed pre-conversion validation throws', async () => {
    const f = await issued(),
      input = incompleteCoverage(f),
      api = await import(
        'next/dist/experimental/testing/coverage/runtime-authorization'
      ),
      original = api.retainNativeRuntimeCoverageAuthorization
    let retained: Awaited<ReturnType<typeof original>> | undefined
    const spy = jest
      .spyOn(api, 'retainNativeRuntimeCoverageAuthorization')
      .mockImplementation(async (...args) => {
        retained = await original(...args)
        return retained
      })
    try {
      const { remapCompilerRuntimeCoverageWithNativeTsConfigInputs } =
        await import('next/dist/experimental/testing/coverage/istanbul')
      await expect(
        remapCompilerRuntimeCoverageWithNativeTsConfigInputs(
          f.artifact,
          input.completion,
          input.expected,
          input.authority,
          f.signal
        )
      ).rejects.toThrow(/coverage|Coverage/)
      expect(retained).toBeDefined()
      await expect(
        api.assertNativeCompilerRuntimeCoverage(
          retained!.artifact,
          retained!.completion,
          retained!.expected,
          f.signal
        )
      ).rejects.toThrow('exact retained native runtime authority')
    } finally {
      spy.mockRestore()
      if (retained) api.retireNativeRuntimeCoverageAuthorization(retained)
    }
  })
  it.each(['artifact', 'completion', 'expected', 'signal'] as const)(
    'native line validation refuses an unbound %s before line mapping',
    async (kind) => {
      const f = await issued(),
        input = incompleteCoverage(f),
        authority = await import(
          'next/dist/experimental/testing/coverage/runtime-authorization'
        ),
        line = await import('next/dist/experimental/testing/coverage/remap')
      const retained = await authority.retainNativeRuntimeCoverageAuthorization(
        f.artifact,
        input.completion,
        input.expected,
        input.authority,
        f.signal
      )
      try {
        await expect(
          line.validateNativeRuntimeLineCoverage(
            kind === 'artifact'
              ? structuredClone(retained.artifact)
              : retained.artifact,
            kind === 'completion'
              ? structuredClone(retained.completion)
              : retained.completion,
            kind === 'expected' ? { ...retained.expected } : retained.expected,
            kind === 'signal' ? new AbortController().signal : f.signal
          )
        ).rejects.toThrow('exact retained native runtime authority')
      } finally {
        authority.retireNativeRuntimeCoverageAuthorization(retained)
      }
    }
  )
  it.each(['wrapper', 'fact', 'artifact', 'selection'] as const)(
    'refuses cloned or changed original %s before grant issuance',
    async (kind) => {
      const f = await issued(),
        options = { ...f.options }
      if (kind === 'wrapper')
        options.compilation = structuredClone(f.compilation)
      if (kind === 'fact') options.fact = structuredClone(f.fact)
      if (kind === 'artifact') options.artifact = structuredClone(f.artifact)
      if (kind === 'selection')
        options.selection = { ...f.selected, id: 'foreign' }
      await expect(
        f.api.prepareSessionNativeRuntimeConversion(options)
      ).rejects.toThrow(
        /original runtime compilation\/fact|original live emission|foreign runtime parent selection/
      )
    }
  )
  it('keeps compiler-source fact origin separate from runtime grants', async () => {
    const f = await issued('compiler-source')
    await expect(
      f.api.prepareSessionNativeRuntimeConversion(f.options)
    ).rejects.toThrow('original runtime compilation/fact identity')
  })
  it('rejects a genuine reader fact made with a synthetic callback', async () => {
    const f = await issued(),
      reader = await import(
        'next/dist/experimental/testing/coverage/native-tsconfig-inputs'
      )
    const staged = await reader.prepareNativeTsConfigInputs({
      artifact: f.artifact,
      reference: f.artifact.nativeTsConfigInputs,
      authorization: {
        request: f.fact.request,
        artifactRoot: f.artifact.rootDir,
        assertLease() {},
      },
      signal: f.signal,
    })
    const fact = await staged!.seal()
    await expect(
      f.api.prepareSessionNativeRuntimeConversion({ ...f.options, fact })
    ).rejects.toThrow('original runtime compilation/fact identity')
  })
  it('consumes a seal atomically and retires its opaque grant', async () => {
    const f = await issued(),
      grant = await f.api.prepareSessionNativeRuntimeConversion(f.options)
    try {
      expect(() =>
        f.api.assertSessionNativeRuntimeConversion(
          structuredClone(grant),
          f.artifact,
          f.fact,
          f.signal
        )
      ).toThrow('active runtime native grant')
      const sealing = f.api.sealSessionNativeRuntimeConversion(
        grant,
        f.artifact,
        f.fact,
        f.signal
      )
      await expect(
        f.api.sealSessionNativeRuntimeConversion(
          grant,
          f.artifact,
          f.fact,
          f.signal
        )
      ).rejects.toThrow('seal already consumed')
      await sealing
      await expect(
        f.api.sealSessionNativeRuntimeConversion(
          grant,
          f.artifact,
          f.fact,
          f.signal
        )
      ).rejects.toThrow('seal already consumed')
    } finally {
      f.api.retireSessionNativeRuntimeConversion(grant)
    }
    expect(() =>
      f.api.assertSessionNativeRuntimeConversion(
        grant,
        f.artifact,
        f.fact,
        f.signal
      )
    ).toThrow('active runtime native grant')
    expect(() =>
      f.api.retireSessionNativeRuntimeConversion(grant)
    ).not.toThrow()
  })
  it('refuses retirement racing a real reader seal', async () => {
    const f = await issued(),
      grant = await f.api.prepareSessionNativeRuntimeConversion(f.options)
    const sealing = f.api.sealSessionNativeRuntimeConversion(
      grant,
      f.artifact,
      f.fact,
      f.signal
    )
    f.api.retireSessionNativeRuntimeConversion(grant)
    await expect(sealing).rejects.toThrow('active runtime native grant')
  })
  it('does not rebind an old fact or grant to a byte-identical same-tuple new Session', async () => {
    const a = await issued(),
      grant = await a.api.prepareSessionNativeRuntimeConversion(a.options)
    const originalBytes = await Promise.all(
      a.artifact.files.map(async (file) => [
        file,
        await readFile(join(a.artifact.rootDir, file)),
      ])
    )
    await owned!.dispose()
    owned = await createTestCompilerSession(root, selectedProfile)
    const b = await issued()
    try {
      expect(b.artifact.rootDir).toBe(a.artifact.rootDir)
      expect(b.fact.request).toEqual(a.fact.request)
      expect(
        await Promise.all(
          b.artifact.files.map(async (file) => [
            file,
            await readFile(join(b.artifact.rootDir, file)),
          ])
        )
      ).toEqual(originalBytes)
      await expect(
        a.api.assertSealedSessionNativeTsConfigInputs({
          fact: a.fact,
          expected: { request: a.fact.request, compiler: a.fact.compiler },
          signal: a.signal,
        })
      ).resolves.toBeUndefined()
      await expect(
        b.api.prepareSessionNativeRuntimeConversion({
          ...b.options,
          fact: a.fact,
        })
      ).rejects.toThrow('original live emission')
      await expect(
        a.api.prepareSessionNativeRuntimeConversion({
          ...a.options,
          fact: b.fact,
        })
      ).rejects.toThrow(
        /original allocation lease is closed|original live emission/
      )
      expect(() =>
        a.api.assertSessionNativeRuntimeConversion(
          grant,
          a.artifact,
          a.fact,
          a.signal
        )
      ).toThrow('original allocation lease is closed')
    } finally {
      a.api.retireSessionNativeRuntimeConversion(grant)
    }
  })
  it('rejects a fact from a different emission in the same Session', async () => {
    const a = await issued(),
      selected = {
        ...a.selected,
        id: 'second-request',
        revision: 'second-revision',
      }
    const compilation = await compileRuntime(selected),
      staged = await owned!.prepareNativeTsConfigInputs(compilation, {
        role: 'runtime',
        selection: selected,
        signal: a.signal,
      }),
      fact = await staged.seal()
    expect(compilation.value).not.toBe(a.artifact)
    await expect(
      a.api.prepareSessionNativeRuntimeConversion({
        compilation,
        artifact:
          compilation.value as import('next/dist/experimental/testing/contracts').CompiledNodeTestArtifact,
        fact: a.fact,
        selection: selected,
        signal: a.signal,
      })
    ).rejects.toThrow('original live emission')
    const grant = await a.api.prepareSessionNativeRuntimeConversion(a.options)
    try {
      expect(() =>
        a.api.assertSessionNativeRuntimeConversion(
          grant,
          a.artifact,
          fact,
          a.signal
        )
      ).toThrow('active runtime native grant')
    } finally {
      a.api.retireSessionNativeRuntimeConversion(grant)
    }
  })
  it('retains original compile cancellation despite a fresh conversion signal', async () => {
    const selected = await selection(),
      controller = new AbortController()
    const compilation = await owned!.compileRuntimeWithNativeTsConfigInputs(
      {
        id: selected.source.id,
        file: selected.source.file,
        profile: selected.profile,
      },
      {
        selection: selected,
        signal: controller.signal,
        coverage: { version: 1, kind: 'node-line' },
      }
    )
    const signal = new AbortController().signal,
      staged = await owned!.prepareNativeTsConfigInputs(compilation, {
        role: 'runtime',
        selection: selected,
        signal,
      }),
      fact = await staged.seal()
    const api = await import('next/dist/experimental/testing/compiler'),
      options = {
        compilation,
        artifact:
          compilation.value as import('next/dist/experimental/testing/contracts').CompiledNodeTestArtifact,
        fact,
        selection: selected,
        signal,
      }
    const grant = await api.prepareSessionNativeRuntimeConversion(options)
    try {
      controller.abort()
      expect(() =>
        api.assertSessionNativeRuntimeConversion(
          grant,
          options.artifact,
          fact,
          signal
        )
      ).toThrow('original compile operation was cancelled')
      await expect(
        api.prepareSessionNativeRuntimeConversion(options)
      ).rejects.toThrow('original compile operation was cancelled')
    } finally {
      api.retireSessionNativeRuntimeConversion(grant)
    }
  })
  it.each(['prepare', 'seal'] as const)(
    'refuses cancellation after genuine reader %s completes',
    async (phase) => {
      const f = await issued(),
        reader = await import(
          'next/dist/experimental/testing/coverage/native-tsconfig-inputs'
        ),
        original = reader.prepareNativeTsConfigInputs,
        controller = new AbortController()
      const spy = jest
        .spyOn(reader, 'prepareNativeTsConfigInputs')
        .mockImplementation(async (...args) => {
          const staged = await original(...args)
          if (phase === 'prepare') {
            controller.abort(new Error('native grant late abort'))
            return staged
          }
          return (
            staged && {
              watchInputs: staged.watchInputs,
              async seal() {
                const fact = await staged.seal()
                controller.abort(new Error('native grant late abort'))
                return fact
              },
            }
          )
        })
      let grant:
        | Awaited<
            ReturnType<typeof f.api.prepareSessionNativeRuntimeConversion>
          >
        | undefined
      try {
        const operation = f.api.prepareSessionNativeRuntimeConversion({
          ...f.options,
          signal: controller.signal,
        })
        if (phase === 'prepare')
          await expect(operation).rejects.toThrow('native grant late abort')
        else {
          grant = await operation
          await expect(
            f.api.sealSessionNativeRuntimeConversion(
              grant,
              f.artifact,
              f.fact,
              controller.signal
            )
          ).rejects.toThrow('native grant late abort')
        }
      } finally {
        if (grant) f.api.retireSessionNativeRuntimeConversion(grant)
        spy.mockRestore()
      }
    }
  )
  it.each(['sidecar', 'config', 'script'] as const)(
    'rereads actual %s bytes at grant seal',
    async (kind) => {
      const f = await issued(),
        grant = await f.api.prepareSessionNativeRuntimeConversion(f.options)
      const file =
        kind === 'config'
          ? join(root, 'config.json')
          : join(
              f.artifact.rootDir,
              kind === 'sidecar'
                ? f.fact.reference.nativeMetadata.path
                : f.artifact.entryPath
            )
      const bytes = await readFile(file)
      try {
        await writeFile(file, Buffer.concat([bytes, Buffer.from('\n')]))
        await expect(
          f.api.sealSessionNativeRuntimeConversion(
            grant,
            f.artifact,
            f.fact,
            f.signal
          )
        ).rejects.toThrow(/changed|differs|hash|observation/)
        await writeFile(file, bytes)
        await expect(
          f.api.sealSessionNativeRuntimeConversion(
            grant,
            f.artifact,
            f.fact,
            f.signal
          )
        ).rejects.toThrow('active runtime native grant')
      } finally {
        await writeFile(file, bytes)
        f.api.retireSessionNativeRuntimeConversion(grant)
      }
    }
  )
})

// Fresh SWC namespace exports are non-configurable getters. The mutable seam
// delegates to the actual module, preserving every real authority WeakMap.
jest.mock(
  'next/dist/experimental/testing/coverage/runtime-authorization',
  () => {
    const actual = jest.requireActual<
      typeof import('next/dist/experimental/testing/coverage/runtime-authorization')
    >('next/dist/experimental/testing/coverage/runtime-authorization')
    return {
      __esModule: true,
      ...actual,
      retainNativeRuntimeCoverageAuthorization(
        ...args: Parameters<
          typeof actual.retainNativeRuntimeCoverageAuthorization
        >
      ) {
        return actual.retainNativeRuntimeCoverageAuthorization(...args)
      },
    }
  }
)

// Descriptor validation precedes private request field access; this is a mocked
// Session component and creates no native producer or live-origin authority.
describe('private compile-only native config argument descriptors', () => {
  it('refuses an accessor signal without executing its getter', async () => {
    const dir = await mkdtemp('/private/tmp/next-native-source-descriptors-')
    const previousEnvironment = process.env.NODE_ENV
    const testEntry = jest.fn(async () => {
      throw new Error('Unexpected native endpoint in descriptor refusal')
    })
    const shutdown = jest.fn(async () => {})
    const selectedProfile = {
      id: 'native-source-descriptor-component',
      mode: 'development',
      environment: 'node',
      runtime: 'nodejs',
      bundler: 'turbopack',
    } as const
    let session:
      | Awaited<ReturnType<typeof createTestCompilerSession>>
      | undefined
    try {
      process.env = { ...process.env, NODE_ENV: 'development' }
      const file = join(dir, 'subject.ts')
      const bytes = 'export const value = 1\n'
      await writeFile(file, bytes)
      jest.mocked(createDevTurbopackProject).mockResolvedValue({
        project: { shutdown, testEntry },
        nativeProjectPaths: { rootPath: dir, projectPath: '.' },
      } as any)
      session = await createTestCompilerSession(dir, selectedProfile)
      const { sourceAnalysisEntryId } = await import(
        'next/dist/experimental/testing/coverage/source-analysis'
      )
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      const getSignal = jest.fn(() => new AbortController().signal)
      const args = {
        selection: {
          version: 1 as const,
          id: 'native-source-descriptor-request',
          revision: 'native-source-descriptor-revision',
          profile: selectedProfile,
          source: {
            id: sourceAnalysisEntryId(selectedProfile, file),
            file,
            sha256,
          },
        },
        get signal() {
          return getSignal()
        },
      }
      await expect(
        session.compileCoverageSourceWithNativeTsConfigInputs(
          { file, sha256 },
          args
        )
      ).rejects.toThrow('exact data shape required')
      expect(getSignal).not.toHaveBeenCalled()
      expect(testEntry).not.toHaveBeenCalled()
    } finally {
      await session?.dispose()
      await rm(dir, { recursive: true, force: true })
      process.env = { ...process.env, NODE_ENV: previousEnvironment }
    }
  })
})

// Synthetic native producer records below exercise compiler policy only.
// They do not qualify actual native origin, source conversion, counts or execution.
describe('private native compiler-source conversion grants (synthetic component issuer)', () => {
  let root: string
  let owned: Awaited<ReturnType<typeof createTestCompilerSession>> | undefined
  let selectedProfile: import('next/dist/experimental/testing/contracts').TestProfile
  let hashMode: 'sha256' | 'xxh' | 'mismatch' | 'noncanonical'
  let omitListed: boolean
  let emittedSidecarSha256: string | undefined
  let deferredSnapshot: (() => Promise<void>) | undefined
  const previousEnvironment = process.env.NODE_ENV
  const sha = (bytes: string | Buffer) =>
    createHash('sha256').update(bytes).digest('hex')
  beforeEach(async () => {
    process.env = { ...process.env, NODE_ENV: 'development' }
    hashMode = 'sha256'
    omitListed = false
    emittedSidecarSha256 = undefined
    deferredSnapshot = undefined
    ;({ root, selectedProfile } = await createNativeConfigIssuer(
      '/private/tmp/next-source-grant-component107-',
      {
        createdRoot: (value) => {
          root = value
        },
        hashMode: () => hashMode,
        omitListed: () => omitListed,
        deferredSnapshot: () => deferredSnapshot?.(),
        recordSidecarHash: (value) => {
          emittedSidecarSha256 = value
        },
      }
    ))
    owned = await createTestCompilerSession(root, selectedProfile)
  })
  afterEach(async () => {
    await owned?.dispose()
    owned = undefined
    await rm(root, { recursive: true, force: true })
    process.env = { ...process.env, NODE_ENV: previousEnvironment }
  })
  async function selection(
    role: 'runtime' | 'compiler-source' = 'compiler-source'
  ) {
    const { sourceAnalysisEntryId } = await import(
      'next/dist/experimental/testing/coverage/source-analysis'
    )
    const file = join(root, 'subject.ts')
    return {
      version: 1 as const,
      id: 'original-component-request-' + role,
      revision: 'original-before-endpoint-revision-' + role,
      profile: { ...selectedProfile },
      source: {
        id:
          role === 'runtime'
            ? 'runtime-subject'
            : sourceAnalysisEntryId(selectedProfile, file),
        file,
        sha256: sha(await readFile(file)),
      },
    }
  }
  async function compileRuntime(
    selected: Awaited<ReturnType<typeof selection>>,
    signal = new AbortController().signal
  ) {
    return owned!.compileRuntimeWithNativeTsConfigInputs(
      {
        id: selected.source.id,
        file: selected.source.file,
        profile: selected.profile,
      },
      {
        selection: selected,
        signal,
        coverage: { version: 1, kind: 'node-line' },
      }
    )
  }

  async function issued(
    role: 'runtime' | 'compiler-source' = 'compiler-source',
    compileSignal = new AbortController().signal
  ) {
    const selected = await selection(role)
    const compilation =
      role === 'runtime'
        ? await compileRuntime(selected, compileSignal)
        : await owned!.compileCoverageSourceWithNativeTsConfigInputs(
            { file: selected.source.file, sha256: selected.source.sha256 },
            { selection: selected, signal: compileSignal }
          )
    const staged = await owned!.prepareNativeTsConfigInputs(compilation, {
      role,
      selection: selected,
      signal: new AbortController().signal,
    })
    const fact = await staged.seal()
    expect(fact.reference.nativeMetadata.sha256).toBe(emittedSidecarSha256)
    const artifact =
      compilation.role === 'runtime'
        ? compilation.value
        : compilation.value.artifact
    const value =
      compilation.value as import('next/dist/experimental/testing/coverage/types').CompiledCoverageSource
    const signal = new AbortController().signal
    const api = await import('next/dist/experimental/testing/compiler')
    return {
      compilation,
      artifact,
      value,
      fact,
      selected,
      signal,
      api,
      options: { compilation, value, fact, selection: selected, signal },
    }
  }
  it('seals a source grant without replacing or Session-registering temporary observations', async () => {
    const f = await issued(),
      reader = await import(
        'next/dist/experimental/testing/coverage/native-tsconfig-inputs'
      )
    const original = reader.prepareNativeTsConfigInputs
    let temporary: unknown
    const spy = jest
      .spyOn(reader, 'prepareNativeTsConfigInputs')
      .mockImplementation(async (...args) => {
        const staged = await original(...args)
        return (
          staged && {
            watchInputs: staged.watchInputs,
            async seal() {
              temporary = await staged.seal()
              return temporary as any
            },
          }
        )
      })
    let grant:
      | Awaited<
          ReturnType<typeof f.api.prepareSessionNativeCompilerSourceConversion>
        >
      | undefined
    try {
      grant = await f.api.prepareSessionNativeCompilerSourceConversion(
        f.options
      )
      f.api.assertSessionNativeCompilerSourceConversion(
        grant,
        f.value,
        f.fact,
        f.signal
      )
      await f.api.sealSessionNativeCompilerSourceConversion(
        grant,
        f.value,
        f.fact,
        f.signal
      )
      expect(temporary).toEqual(f.fact)
      expect(temporary).not.toBe(f.fact)
      await expect(
        f.api.assertSealedSessionNativeTsConfigInputs({
          fact: temporary as any,
          expected: { request: f.fact.request, compiler: f.fact.compiler },
          signal: f.signal,
        })
      ).rejects.toThrow('original genuine Session issuer')
      await expect(
        f.api.assertSealedSessionNativeTsConfigInputs({
          fact: f.fact,
          expected: { request: f.fact.request, compiler: f.fact.compiler },
          signal: f.signal,
        })
      ).resolves.toBeUndefined()
    } finally {
      if (grant) f.api.retireSessionNativeCompilerSourceConversion(grant)
      spy.mockRestore()
    }
  })

  it.each(['wrapper', 'value', 'inner-artifact', 'fact'] as const)(
    'refuses a cloned %s instead of original source identities',
    async (part) => {
      const f = await issued(),
        options = { ...f.options }
      if (part === 'wrapper')
        options.compilation = structuredClone(f.compilation)
      if (part === 'value') options.value = structuredClone(f.value)
      if (part === 'inner-artifact')
        options.value = { ...f.value, artifact: structuredClone(f.artifact) }
      if (part === 'fact') options.fact = structuredClone(f.fact)
      await expect(
        f.api.prepareSessionNativeCompilerSourceConversion(options)
      ).rejects.toThrow('original compiler-source compilation/fact identity')
    }
  )

  it('keeps the exact fact key even when another original fact has the same emission identity', async () => {
    const f = await issued(),
      grant = await f.api.prepareSessionNativeCompilerSourceConversion(
        f.options
      )
    try {
      const staged = await owned!.prepareNativeTsConfigInputs(f.compilation, {
          role: 'compiler-source',
          selection: f.selected,
          signal: f.signal,
        }),
        second = await staged.seal()
      expect(second).toEqual(f.fact)
      expect(second).not.toBe(f.fact)
      expect(() =>
        f.api.assertSessionNativeCompilerSourceConversion(
          grant,
          f.value,
          second,
          f.signal
        )
      ).toThrow('active compiler-source native grant')
      expect(() =>
        f.api.assertSessionNativeCompilerSourceConversion(
          grant,
          f.value,
          f.fact,
          f.signal
        )
      ).not.toThrow()
    } finally {
      f.api.retireSessionNativeCompilerSourceConversion(grant)
    }
  })

  it('keeps source and runtime grants mutually separate before any conversion', async () => {
    const source = await issued(),
      sourceGrant =
        await source.api.prepareSessionNativeCompilerSourceConversion(
          source.options
        )
    try {
      await expect(
        source.api.prepareSessionNativeRuntimeConversion({
          compilation: source.compilation,
          artifact: source.artifact,
          fact: source.fact,
          selection: source.selected,
          signal: source.signal,
        })
      ).rejects.toThrow('original runtime compilation/fact identity')
      expect(() =>
        source.api.assertSessionNativeRuntimeConversion(
          sourceGrant as any,
          source.artifact,
          source.fact,
          source.signal
        )
      ).toThrow('active runtime native grant')
      const runtime = await issued('runtime'),
        runtimeGrant = await runtime.api.prepareSessionNativeRuntimeConversion({
          compilation: runtime.compilation,
          artifact: runtime.artifact,
          fact: runtime.fact,
          selection: runtime.selected,
          signal: runtime.signal,
        })
      try {
        await expect(
          runtime.api.prepareSessionNativeCompilerSourceConversion(
            runtime.options
          )
        ).rejects.toThrow('original compiler-source compilation/fact identity')
        expect(() =>
          runtime.api.assertSessionNativeCompilerSourceConversion(
            runtimeGrant as any,
            source.value,
            source.fact,
            source.signal
          )
        ).toThrow('active compiler-source native grant')
      } finally {
        runtime.api.retireSessionNativeRuntimeConversion(runtimeGrant)
      }
    } finally {
      source.api.retireSessionNativeCompilerSourceConversion(sourceGrant)
    }
  })

  it('rejects a real reader fact produced with a synthetic no-op callback as Session source origin', async () => {
    const f = await issued(),
      reader = await import(
        'next/dist/experimental/testing/coverage/native-tsconfig-inputs'
      )
    const staged = await reader.prepareNativeTsConfigInputs({
        artifact: f.artifact,
        reference: f.artifact.nativeTsConfigInputs,
        authorization: {
          request: f.fact.request,
          artifactRoot: f.artifact.rootDir,
          assertLease() {},
        },
        signal: f.signal,
      }),
      fact = await staged!.seal()
    await expect(
      f.api.prepareSessionNativeCompilerSourceConversion({ ...f.options, fact })
    ).rejects.toThrow('original compiler-source compilation/fact identity')
  })

  it.each(['id', 'revision', 'profile', 'source'] as const)(
    'rejects a foreign parent selection %s',
    async (key) => {
      const f = await issued(),
        selected = {
          ...f.selected,
          profile: { ...f.selected.profile },
          source: { ...f.selected.source },
        }
      if (key === 'id') selected.id = 'foreign-request'
      if (key === 'revision') selected.revision = 'foreign-revision'
      if (key === 'profile') selected.profile.id = 'foreign-profile'
      if (key === 'source') selected.source.sha256 = '0'.repeat(64)
      await expect(
        f.api.prepareSessionNativeCompilerSourceConversion({
          ...f.options,
          selection: selected,
        })
      ).rejects.toThrow(/foreign (compiler-source )?parent selection/)
    }
  )

  it('refuses an accessor before evaluating a private source grant field', async () => {
    const f = await issued(),
      getter = jest.fn(() => f.signal),
      options = { ...f.options }
    Object.defineProperty(options, 'signal', { enumerable: true, get: getter })
    await expect(
      f.api.prepareSessionNativeCompilerSourceConversion(options)
    ).rejects.toThrow('exact data shape required')
    expect(getter).not.toHaveBeenCalled()
  })

  it.each(['configurationImports', 'runtimeConfigurationImports'] as const)(
    'refuses an unsupported own %s option before a getter',
    async (key) => {
      const f = await issued(),
        getter = jest.fn(() => {
          throw new Error('module authority getter evaluated')
        })
      const options = Object.defineProperty({ ...f.options }, key, {
        enumerable: false,
        get: getter,
      })
      await expect(
        f.api.prepareSessionNativeCompilerSourceConversion(options)
      ).rejects.toThrow('exact data shape required')
      expect(getter).not.toHaveBeenCalled()
    }
  )

  it('keeps the allocation leased through compilation shutdown but revokes it synchronously on disposal', async () => {
    const f = await issued()
    await owned!.shutdownCompilation()
    const grant = await f.api.prepareSessionNativeCompilerSourceConversion(
      f.options
    )
    try {
      await f.api.sealSessionNativeCompilerSourceConversion(
        grant,
        f.value,
        f.fact,
        f.signal
      )
      const closing = owned!.dispose()
      expect(() =>
        f.api.assertSessionNativeCompilerSourceConversion(
          grant,
          f.value,
          f.fact,
          f.signal
        )
      ).toThrow('original allocation lease is closed')
      await closing
      await expect(
        f.api.assertSealedSessionNativeTsConfigInputs({
          fact: f.fact,
          expected: { request: f.fact.request, compiler: f.fact.compiler },
          signal: f.signal,
        })
      ).resolves.toBeUndefined()
      await expect(
        f.api.prepareSessionNativeCompilerSourceConversion(f.options)
      ).rejects.toThrow('original allocation lease is closed')
    } finally {
      f.api.retireSessionNativeCompilerSourceConversion(grant)
    }
  })

  it('does not resurrect a source grant after original compile cancellation with a fresh conversion signal', async () => {
    const controller = new AbortController(),
      f = await issued('compiler-source', controller.signal),
      grant = await f.api.prepareSessionNativeCompilerSourceConversion(
        f.options
      )
    try {
      controller.abort()
      expect(() =>
        f.api.assertSessionNativeCompilerSourceConversion(
          grant,
          f.value,
          f.fact,
          f.signal
        )
      ).toThrow('original compile operation was cancelled')
      await expect(
        f.api.prepareSessionNativeCompilerSourceConversion({
          ...f.options,
          signal: new AbortController().signal,
        })
      ).rejects.toThrow('original compile operation was cancelled')
    } finally {
      f.api.retireSessionNativeCompilerSourceConversion(grant)
    }
  })

  it('binds a source grant to its original caller signal and opaque grant identity', async () => {
    const f = await issued(),
      grant = await f.api.prepareSessionNativeCompilerSourceConversion(
        f.options
      )
    try {
      expect(() =>
        f.api.assertSessionNativeCompilerSourceConversion(
          structuredClone(grant),
          f.value,
          f.fact,
          f.signal
        )
      ).toThrow('active compiler-source native grant')
      expect(() =>
        f.api.assertSessionNativeCompilerSourceConversion(
          grant,
          f.value,
          f.fact,
          new AbortController().signal
        )
      ).toThrow('active compiler-source native grant')
      expect(() =>
        f.api.assertSessionNativeCompilerSourceConversion(
          grant,
          structuredClone(f.value),
          f.fact,
          f.signal
        )
      ).toThrow('active compiler-source native grant')
    } finally {
      f.api.retireSessionNativeCompilerSourceConversion(grant)
    }
  })

  it('consumes one reader seal atomically and rejects concurrent, repeated and retired use', async () => {
    const f = await issued(),
      grant = await f.api.prepareSessionNativeCompilerSourceConversion(
        f.options
      )
    try {
      const sealing = f.api.sealSessionNativeCompilerSourceConversion(
        grant,
        f.value,
        f.fact,
        f.signal
      )
      await expect(
        f.api.sealSessionNativeCompilerSourceConversion(
          grant,
          f.value,
          f.fact,
          f.signal
        )
      ).rejects.toThrow('seal already consumed')
      await sealing
      await expect(
        f.api.sealSessionNativeCompilerSourceConversion(
          grant,
          f.value,
          f.fact,
          f.signal
        )
      ).rejects.toThrow('seal already consumed')
    } finally {
      f.api.retireSessionNativeCompilerSourceConversion(grant)
    }
    expect(() =>
      f.api.assertSessionNativeCompilerSourceConversion(
        grant,
        f.value,
        f.fact,
        f.signal
      )
    ).toThrow('active compiler-source native grant')
    expect(() =>
      f.api.retireSessionNativeCompilerSourceConversion(grant)
    ).not.toThrow()
  })

  it('rejects retirement while a real reader seal is in flight', async () => {
    const f = await issued(),
      grant = await f.api.prepareSessionNativeCompilerSourceConversion(
        f.options
      )
    const sealing = f.api.sealSessionNativeCompilerSourceConversion(
      grant,
      f.value,
      f.fact,
      f.signal
    )
    f.api.retireSessionNativeCompilerSourceConversion(grant)
    await expect(sealing).rejects.toThrow('active compiler-source native grant')
  })

  it.each(['source', 'script', 'sidecar', 'config'] as const)(
    'rejects changed %s bytes and leaves a failed seal unusable',
    async (kind) => {
      const f = await issued(),
        grant = await f.api.prepareSessionNativeCompilerSourceConversion(
          f.options
        )
      const file =
          kind === 'source'
            ? f.selected.source.file
            : kind === 'config'
              ? join(root, 'config.json')
              : join(
                  f.artifact.rootDir,
                  kind === 'sidecar'
                    ? f.fact.reference.nativeMetadata.path
                    : f.artifact.entryPath
                ),
        bytes = await readFile(file)
      try {
        await writeFile(file, Buffer.concat([bytes, Buffer.from('\n')]))
        await expect(
          f.api.sealSessionNativeCompilerSourceConversion(
            grant,
            f.value,
            f.fact,
            f.signal
          )
        ).rejects.toThrow(/changed|differs|hash|identity|observation/i)
        await writeFile(file, bytes)
        expect(() =>
          f.api.assertSessionNativeCompilerSourceConversion(
            grant,
            f.value,
            f.fact,
            f.signal
          )
        ).toThrow('active compiler-source native grant')
      } finally {
        await writeFile(file, bytes)
        f.api.retireSessionNativeCompilerSourceConversion(grant)
      }
    }
  )

  it.each(['prepare', 'seal'] as const)(
    'refuses cancellation after real reader %s resolution',
    async (phase) => {
      const f = await issued(),
        reader = await import(
          'next/dist/experimental/testing/coverage/native-tsconfig-inputs'
        ),
        original = reader.prepareNativeTsConfigInputs,
        controller = new AbortController()
      const spy = jest
        .spyOn(reader, 'prepareNativeTsConfigInputs')
        .mockImplementation(async (...args) => {
          const staged = await original(...args)
          if (phase === 'prepare') {
            controller.abort(new Error('late source grant abort'))
            return staged
          }
          return (
            staged && {
              watchInputs: staged.watchInputs,
              async seal() {
                const fact = await staged.seal()
                controller.abort(new Error('late source grant abort'))
                return fact
              },
            }
          )
        })
      let grant:
        | Awaited<
            ReturnType<
              typeof f.api.prepareSessionNativeCompilerSourceConversion
            >
          >
        | undefined
      try {
        if (phase === 'prepare')
          await expect(
            f.api.prepareSessionNativeCompilerSourceConversion({
              ...f.options,
              signal: controller.signal,
            })
          ).rejects.toThrow('late source grant abort')
        else {
          grant = await f.api.prepareSessionNativeCompilerSourceConversion({
            ...f.options,
            signal: controller.signal,
          })
          await expect(
            f.api.sealSessionNativeCompilerSourceConversion(
              grant,
              f.value,
              f.fact,
              controller.signal
            )
          ).rejects.toThrow('late source grant abort')
        }
      } finally {
        if (grant) f.api.retireSessionNativeCompilerSourceConversion(grant)
        spy.mockRestore()
      }
    }
  )

  it('compares every temporary native observation without replacing the original fact', async () => {
    const f = await issued(),
      reader = await import(
        'next/dist/experimental/testing/coverage/native-tsconfig-inputs'
      ),
      original = reader.prepareNativeTsConfigInputs
    const spy = jest
      .spyOn(reader, 'prepareNativeTsConfigInputs')
      .mockImplementation(async (...args) => {
        const staged = await original(...args)
        return (
          staged && {
            watchInputs: staged.watchInputs,
            async seal() {
              const fact = await staged.seal()
              return {
                ...fact,
                native: {
                  ...fact.native,
                  reasons: ['synthetic late observation'],
                },
              } as any
            },
          }
        )
      })
    let grant:
      | Awaited<
          ReturnType<typeof f.api.prepareSessionNativeCompilerSourceConversion>
        >
      | undefined
    try {
      grant = await f.api.prepareSessionNativeCompilerSourceConversion(
        f.options
      )
      await expect(
        f.api.sealSessionNativeCompilerSourceConversion(
          grant,
          f.value,
          f.fact,
          f.signal
        )
      ).rejects.toThrow('observations differ from original fact')
      await expect(
        f.api.assertSealedSessionNativeTsConfigInputs({
          fact: f.fact,
          expected: { request: f.fact.request, compiler: f.fact.compiler },
          signal: f.signal,
        })
      ).resolves.toBeUndefined()
    } finally {
      if (grant) f.api.retireSessionNativeCompilerSourceConversion(grant)
      spy.mockRestore()
    }
  })

  it('rejects old source facts and grants across a byte-identical same-tuple replacement Session', async () => {
    const a = await issued(),
      grant = await a.api.prepareSessionNativeCompilerSourceConversion(
        a.options
      )
    expect(() =>
      a.api.assertSessionNativeCompilerSourceConversion(
        grant,
        a.value,
        a.fact,
        a.signal
      )
    ).not.toThrow()
    const originalBytes = await Promise.all(
      a.artifact.files.map(async (file) => [
        file,
        await readFile(join(a.artifact.rootDir, file)),
      ])
    )
    await owned!.dispose()
    owned = await createTestCompilerSession(root, selectedProfile)
    const b = await issued()
    try {
      expect(b.artifact.rootDir).toBe(a.artifact.rootDir)
      expect(b.fact.request).toEqual(a.fact.request)
      expect(
        await Promise.all(
          b.artifact.files.map(async (file) => [
            file,
            await readFile(join(b.artifact.rootDir, file)),
          ])
        )
      ).toEqual(originalBytes)
      await expect(
        a.api.assertSealedSessionNativeTsConfigInputs({
          fact: a.fact,
          expected: { request: a.fact.request, compiler: a.fact.compiler },
          signal: a.signal,
        })
      ).resolves.toBeUndefined()
      await expect(
        b.api.prepareSessionNativeCompilerSourceConversion({
          ...b.options,
          fact: a.fact,
        })
      ).rejects.toThrow('original live emission')
      await expect(
        a.api.prepareSessionNativeCompilerSourceConversion({
          ...a.options,
          fact: b.fact,
        })
      ).rejects.toThrow(
        /original allocation lease is closed|original live emission/
      )
      expect(() =>
        a.api.assertSessionNativeCompilerSourceConversion(
          grant,
          a.value,
          a.fact,
          a.signal
        )
      ).toThrow('original allocation lease is closed')
      const replacement =
        await b.api.prepareSessionNativeCompilerSourceConversion(b.options)
      try {
        b.api.assertSessionNativeCompilerSourceConversion(
          replacement,
          b.value,
          b.fact,
          b.signal
        )
        await b.api.sealSessionNativeCompilerSourceConversion(
          replacement,
          b.value,
          b.fact,
          b.signal
        )
      } finally {
        b.api.retireSessionNativeCompilerSourceConversion(replacement)
      }
    } finally {
      a.api.retireSessionNativeCompilerSourceConversion(grant)
    }
  })
})
// Component-only identity controls use the real compiler issuer/grant maps.
// Synthetic endpoint records supply no native-origin or public admission proof.
describe('native opaque identities (synthetic component issuer)', () => {
  let root: string
  let owned: Awaited<ReturnType<typeof createTestCompilerSession>> | undefined
  let selectedProfile: import('next/dist/experimental/testing/contracts').TestProfile
  let hashMode: 'sha256' | 'xxh' | 'mismatch' | 'noncanonical'
  let omitListed: boolean
  let emittedSidecarSha256: string | undefined
  let deferredSnapshot: (() => Promise<void>) | undefined
  const previousEnvironment = process.env.NODE_ENV
  const sha = (bytes: string | Buffer) =>
    createHash('sha256').update(bytes).digest('hex')
  beforeEach(async () => {
    process.env = { ...process.env, NODE_ENV: 'development' }
    hashMode = 'sha256'
    omitListed = false
    emittedSidecarSha256 = undefined
    deferredSnapshot = undefined
    ;({ root, selectedProfile } = await createNativeConfigIssuer(
      '/private/tmp/next-native-opaque-component122-',
      {
        createdRoot: (value) => {
          root = value
        },
        hashMode: () => hashMode,
        omitListed: () => omitListed,
        deferredSnapshot: () => deferredSnapshot?.(),
        recordSidecarHash: (value) => {
          emittedSidecarSha256 = value
        },
      }
    ))
    owned = await createTestCompilerSession(root, selectedProfile)
  })
  afterEach(async () => {
    await owned?.dispose()
    owned = undefined
    await rm(root, { recursive: true, force: true })
    process.env = { ...process.env, NODE_ENV: previousEnvironment }
  })
  async function selection(
    role: 'runtime' | 'compiler-source' = 'compiler-source'
  ) {
    const { sourceAnalysisEntryId } = await import(
      'next/dist/experimental/testing/coverage/source-analysis'
    )
    const file = join(root, 'subject.ts')
    return {
      version: 1 as const,
      id: 'original-component-request-' + role,
      revision: 'original-before-endpoint-revision-' + role,
      profile: { ...selectedProfile },
      source: {
        id:
          role === 'runtime'
            ? 'runtime-subject'
            : sourceAnalysisEntryId(selectedProfile, file),
        file,
        sha256: sha(await readFile(file)),
      },
    }
  }
  async function compileRuntime(
    selected: Awaited<ReturnType<typeof selection>>,
    signal = new AbortController().signal
  ) {
    return owned!.compileRuntimeWithNativeTsConfigInputs(
      {
        id: selected.source.id,
        file: selected.source.file,
        profile: selected.profile,
      },
      {
        selection: selected,
        signal,
        coverage: { version: 1, kind: 'node-line' },
      }
    )
  }

  async function issued(
    role: 'runtime' | 'compiler-source' = 'compiler-source',
    compileSignal = new AbortController().signal
  ) {
    const selected = await selection(role)
    const compilation =
      role === 'runtime'
        ? await compileRuntime(selected, compileSignal)
        : await owned!.compileCoverageSourceWithNativeTsConfigInputs(
            { file: selected.source.file, sha256: selected.source.sha256 },
            { selection: selected, signal: compileSignal }
          )
    const staged = await owned!.prepareNativeTsConfigInputs(compilation, {
      role,
      selection: selected,
      signal: new AbortController().signal,
    })
    const fact = await staged.seal()
    expect(fact.reference.nativeMetadata.sha256).toBe(emittedSidecarSha256)
    const artifact =
      compilation.role === 'runtime'
        ? compilation.value
        : compilation.value.artifact
    const value =
      compilation.value as import('next/dist/experimental/testing/coverage/types').CompiledCoverageSource
    const signal = new AbortController().signal
    const api = await import('next/dist/experimental/testing/compiler')
    return {
      compilation,
      artifact,
      value,
      fact,
      selected,
      signal,
      api,
      options: { compilation, value, fact, selection: selected, signal },
    }
  }

  it.each(['runtime', 'compiler-source'] as const)(
    'keeps distinct %s grants when later author code substitutes freeze',
    async (role) => {
      const f = await issued(role)
      const foreign = { __proto__: null }
      const originalFreeze = Object.freeze
      const substituted = jest
        .spyOn(Object, 'freeze')
        .mockImplementation((value) => {
          if (
            value &&
            typeof value === 'object' &&
            Object.getPrototypeOf(value) === null &&
            Reflect.ownKeys(value).length === 0
          )
            return foreign
          return originalFreeze(value)
        })
      const options = {
        compilation: f.compilation,
        artifact: f.artifact,
        fact: f.fact,
        selection: f.selected,
        signal: f.signal,
      }
      const prepare = () =>
        role === 'runtime'
          ? f.api.prepareSessionNativeRuntimeConversion(options as any)
          : f.api.prepareSessionNativeCompilerSourceConversion(f.options)
      const assertGrant = (grant: object) =>
        role === 'runtime'
          ? f.api.assertSessionNativeRuntimeConversion(
              grant as any,
              f.artifact,
              f.fact,
              f.signal
            )
          : f.api.assertSessionNativeCompilerSourceConversion(
              grant as any,
              f.value,
              f.fact,
              f.signal
            )
      const seal = (grant: object) =>
        role === 'runtime'
          ? f.api.sealSessionNativeRuntimeConversion(
              grant as any,
              f.artifact,
              f.fact,
              f.signal
            )
          : f.api.sealSessionNativeCompilerSourceConversion(
              grant as any,
              f.value,
              f.fact,
              f.signal
            )
      const retire = (grant: object) =>
        role === 'runtime'
          ? f.api.retireSessionNativeRuntimeConversion(grant as any)
          : f.api.retireSessionNativeCompilerSourceConversion(grant as any)
      let first: object | undefined
      let second: object | undefined
      try {
        first = await prepare()
        assertGrant(first)
        second = await prepare()
        assertGrant(second)
        expect(first).not.toBe(second)
        expect(first).not.toBe(foreign)
        expect(second).not.toBe(foreign)
        expect(Object.getPrototypeOf(first)).toBeNull()
        expect(Object.getPrototypeOf(second)).toBeNull()
        expect(Object.isFrozen(first)).toBe(true)
        expect(Object.isFrozen(second)).toBe(true)
        retire(first)
        expect(() => assertGrant(first!)).toThrow(/active .* native grant/)
        assertGrant(second)
        await seal(second)
        assertGrant(second)
        expect(
          substituted.mock.calls.filter(
            ([value]) =>
              value &&
              typeof value === 'object' &&
              Object.getPrototypeOf(value) === null &&
              Reflect.ownKeys(value).length === 0
          )
        ).toHaveLength(0)
        retire(second)
        expect(() => assertGrant(second!)).toThrow(/active .* native grant/)
      } finally {
        substituted.mockRestore()
        if (first) retire(first)
        if (second) retire(second)
      }
    }
  )

  it('allocates fresh identities even when captured freeze returns one foreign object', () => {
    const foreign = { __proto__: null }
    const substituted = jest
      .spyOn(Object, 'freeze')
      .mockImplementation(() => foreign)
    let make: (() => object) | undefined
    try {
      jest.isolateModules(() => {
        make =
          require('next/dist/experimental/testing/compiler/native-opaque-identity').createNativeOpaqueIdentity
      })
      const first = make!()
      const second = make!()
      expect(first).not.toBe(second)
      expect(first).not.toBe(foreign)
      expect(second).not.toBe(foreign)
      expect(Object.getPrototypeOf(first)).toBeNull()
      expect(Object.getPrototypeOf(second)).toBeNull()
      expect(Reflect.ownKeys(first)).toEqual([])
      expect(Reflect.ownKeys(second)).toEqual([])
      expect(substituted).toHaveBeenCalledTimes(2)
      expect(substituted).toHaveBeenNthCalledWith(1, first)
      expect(substituted).toHaveBeenNthCalledWith(2, second)
    } finally {
      substituted.mockRestore()
    }
  })
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

it('awaits actual Shared ESM setup dependencies while retaining lazy noninheriting Shared CJS harness imports', () => {
  const { execFileSync } = require('node:child_process')
  const output = execFileSync(
    process.execPath,
    [join(__dirname, 'shared-async-codegen.cjs')],
    { encoding: 'utf8', timeout: 120000 }
  )
  const marker = 'NEXT_TEST_SHARED_ASYNC_CODEGEN '
  const rows = output.split('\n').filter((line) => line.startsWith(marker))
  expect(rows).toHaveLength(1)
  expect(JSON.parse(rows[0].slice(marker.length))).toEqual({
    actualNativeCodegen: true,
    sharedSubjectAwaited: true,
    noninheritingCjsRequires: ['setup', 'test'],
    harnessAsync: false,
  })
}, 130000)

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

it.each(['development', 'production'] as const)(
  'preserves resolved full-route options through %s execution IPC',
  (mode) => {
    const { defaultConfig } = jest.requireActual(
      'next/dist/server/config-shared'
    )
    const pattern = new URL('https://images.example.test:8443/images/**?size=2')
    const config = {
      ...defaultConfig,
      basePath: '/actual',
      deploymentId: 'actual-deployment',
      trailingSlash: true,
      images: { ...defaultConfig.images, remotePatterns: [pattern] },
      experimental: {
        ...defaultConfig.experimental,
        inlineCss: true,
        serverActions: {
          allowedOrigins: ['actions.example.test'],
          bodySizeLimit: '64kb',
        },
      },
    } as NextConfigComplete
    const options = createCompiledRouteRenderOpts(config, mode)
    const transported = deserialize(serialize(options))
    expect(transported).toEqual(options)
    expect(transported).toMatchObject({
      basePath: '/actual',
      clientAssetToken: 'actual-deployment',
      trailingSlash: true,
      images: {
        remotePatterns: [
          {
            protocol: 'https',
            hostname: 'images.example.test',
            port: '8443',
            pathname: '/images/**',
            search: '?size=2',
          },
        ],
      },
      serverActions: {
        allowedOrigins: ['actions.example.test'],
        bodySizeLimit: '64kb',
      },
      experimental: { inlineCss: true, exposeTestingApi: false },
    })
    expect(config.images.remotePatterns[0]).toBe(pattern)
    expect(
      createCompiledRouteRenderOpts(
        { ...config, supportsImmutableAssets: true },
        mode
      ).clientAssetToken
    ).toBe('')
  }
)

it.each(
  (['development', 'production'] as const).flatMap((mode) =>
    ([true, false, undefined] as const).map((flag) => [mode, flag] as const)
  )
)(
  'preserves resolved AppPage debug channel option for %s with %s',
  (mode, flag) => {
    const { defaultConfig } = jest.requireActual(
      'next/dist/server/config-shared'
    )
    const config = {
      ...defaultConfig,
      experimental: { ...defaultConfig.experimental, reactDebugChannel: flag },
    } as NextConfigComplete
    const options = createCompiledRouteRenderOpts(config, mode)
    expect(options.reactDebugChannel).toBe(
      mode === 'development' && flag === true
    )
    expect(deserialize(serialize(options)).reactDebugChannel).toBe(
      options.reactDebugChannel
    )
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
