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
import { Lockfile } from 'next/dist/build/lockfile'
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

// These tests exercise publication/lifetime policy. The native compiler and real
// application environment require the separately run reference application.
describe('test compiler artifact publication', () => {
  let dir: string
  let session: Awaited<ReturnType<typeof createTestCompilerSession>> | undefined
  let outputText: string
  let failCompilation: boolean
  let mockMetadata: object | undefined
  let routeMetadata: object | null | undefined
  const routeRequests: Array<string | undefined> = []
  let cohortMetadata: object | null | undefined
  const cohortRequests: string[][] = []
  const runtimeEnvRequests: {
    environment: string
    runtimeEnv?: boolean
    cohortFiles: string[]
  }[] = []
  let linkOutput: boolean
  let nativeSourceIdentity: string | undefined
  let externalLayout: unknown
  let externalFiles: Record<string, string>
  let beforeEmit: () => Promise<void>
  const shutdown = jest.fn(async () => {})
  const previousNodeEnv = process.env.NODE_ENV

  beforeEach(async () => {
    process.env = { ...process.env, NODE_ENV: 'development' }
    dir = await mkdtemp(join(tmpdir(), 'next-test-publication-'))
    await writeFile(join(dir, 'subject.test.ts'), '// compiler test fixture')
    mockCacheComponents = true
    routeMetadata = undefined
    routeRequests.length = 0
    await mkdir(join(dir, 'app/reference/[slug]'), { recursive: true })
    await writeFile(
      join(dir, 'app/reference/[slug]/page.jsx'),
      'export default function Page() { return null }'
    )
    await writeFile(
      join(dir, 'app/layout.jsx'),
      'export default function Layout({ children }) { return children }'
    )
    outputText = 'first revision'
    failCompilation = false
    mockMetadata = undefined
    linkOutput = false
    nativeSourceIdentity = undefined
    externalLayout = undefined
    externalFiles = {}
    cohortMetadata = undefined
    cohortRequests.length = 0
    runtimeEnvRequests.length = 0
    beforeEmit = async () => {}
    shutdown.mockClear()
    jest.mocked(createDevTurbopackProject).mockClear()
    jest.mocked(createDevTurbopackProject).mockImplementation(
      async () =>
        ({
          project: {
            testEntry: async ({
              id,
              environment,
              inSource,
              runtimeEnv,
              route,
              cohortFiles = [],
            }: {
              id: string
              environment: string
              inSource?: boolean
              runtimeEnv?: boolean
              route?: string
              cohortFiles?: string[]
            }) => ({
              writeToDiskSnapshot: async (directory: string) => {
                routeRequests.push(route)
                cohortRequests.push([...cohortFiles])
                runtimeEnvRequests.push({
                  environment,
                  runtimeEnv,
                  cohortFiles: [...cohortFiles],
                })
                await beforeEmit()
                const entryPath =
                  environment === 'rsc'
                    ? `server/app/__next_test__/${id}/page.js`
                    : `server/next-test/${id}.js`
                const paths = [
                  entryPath,
                  ...(environment === 'rsc'
                    ? [
                        `server/app/__next_test__/${id}/page_client-reference-manifest.js`,
                        `server/app/__next_test__/${id}/page/server-reference-manifest.json`,
                        ...(route
                          ? [
                              `server/app/__next_test__/${id}/page/build-manifest.json`,
                              `server/app/__next_test__/${id}/page/next-font-manifest.json`,
                              `server/app/__next_test__/${id}/page/react-loadable-manifest.json`,
                            ]
                          : []),
                        'static/client.js',
                      ]
                    : []),
                  'server/subject.js.map',
                ]
                for (const file of paths) {
                  const target = join(dir, '.next', directory, file)
                  await mkdir(join(target, '..'), { recursive: true })
                  await writeFile(target, outputText)
                }
                if (inSource && nativeSourceIdentity !== 'missing') {
                  const sourcePath = `server/next-test/${id}.source.json`
                  paths.push(sourcePath)
                  await writeFile(
                    join(dir, '.next', directory, sourcePath),
                    JSON.stringify({
                      version: 1,
                      sha256:
                        nativeSourceIdentity ??
                        createHash('sha256')
                          .update(await readFile(join(dir, 'subject.test.ts')))
                          .digest('hex'),
                    })
                  )
                }
                if (route && routeMetadata !== null) {
                  const metadataPath = `server/next-test/${id}.route.json`
                  paths.push(metadataPath)
                  await mkdir(
                    join(dir, '.next', directory, 'server/next-test'),
                    { recursive: true }
                  )
                  const hash = async (file: string) =>
                    createHash('sha256')
                      .update(await readFile(join(dir, file)))
                      .digest('hex')
                  await writeFile(
                    join(dir, '.next', directory, metadataPath),
                    JSON.stringify(
                      routeMetadata ?? {
                        version: 1,
                        pathname: route,
                        page: `${route}/page`,
                        runtime: 'nodejs',
                        basePath: '',
                        rootParamNames: [],
                        config: {
                          dynamic: 'auto',
                          dynamicParams: true,
                          fetchCache: 'auto',
                          revalidate: false,
                        },
                        entry: {
                          file: 'subject.test.ts',
                          sha256: await hash('subject.test.ts'),
                        },
                        sources: await Promise.all(
                          [
                            'app/layout.jsx',
                            'app/reference/[slug]/page.jsx',
                          ].map(async (file) => ({
                            file,
                            sha256: await hash(file),
                          }))
                        ),
                      }
                    )
                  )
                }
                if (cohortFiles.length && cohortMetadata !== null) {
                  const metadataPath = `server/next-test/${id}.cohort.json`
                  paths.push(metadataPath)
                  const target = join(dir, '.next', directory, metadataPath)
                  await mkdir(join(target, '..'), { recursive: true })
                  await writeFile(
                    target,
                    JSON.stringify(
                      cohortMetadata ?? {
                        cohort: { version: 1, files: cohortFiles },
                      }
                    )
                  )
                }
                if (mockMetadata) {
                  const metadataPath = `server/next-test/${id}.metadata.json`
                  paths.push(metadataPath)
                  const target = join(dir, '.next', directory, metadataPath)
                  await mkdir(join(target, '..'), { recursive: true })
                  await writeFile(target, JSON.stringify(mockMetadata))
                }
                if (linkOutput) {
                  const mutable = join(dir, 'mutable.js')
                  await writeFile(mutable, 'mutable dependency')
                  await rm(join(dir, '.next', directory, entryPath))
                  await symlink(
                    mutable,
                    join(dir, '.next', directory, entryPath)
                  )
                }
                if (externalLayout !== undefined) {
                  const path = `server/next-test/${id}.external-layout.json`
                  externalFiles[path] = JSON.stringify(externalLayout)
                }
                for (const [path, contents] of Object.entries(externalFiles)) {
                  const target = join(dir, '.next', directory, path)
                  await mkdir(dirname(target), { recursive: true })
                  await writeFile(target, contents)
                  paths.push(path)
                }
                return {
                  value: {
                    type: 'nodejs',
                    entryPath,
                    serverPaths: paths
                      .filter((path) => !path.startsWith('static/'))
                      .map((path) => ({ path, contentHash: 'native-hash' })),
                    clientPaths:
                      environment === 'rsc' ? ['static/client.js'] : [],
                  },
                  issues: failCompilation
                    ? [
                        {
                          severity: 'error',
                          message: 'Invalid server-only boundary',
                        },
                      ]
                    : [],
                }
              },
            }),
            shutdown,
          },
        }) as any
    )
  })

  afterEach(async () => {
    await session?.dispose()
    session = undefined
    await rm(dir, { recursive: true, force: true })
    process.env = { ...process.env, NODE_ENV: previousNodeEnv }
  })

  function entry() {
    return {
      id: 'rsc:subject.test.ts',
      file: join(dir, 'subject.test.ts'),
      profile,
    }
  }

  it('binds native AppProject facts without replacing the synthetic manifest identity', async () => {
    mockCacheComponents = false
    const selected = { ...profile, route: '/reference/[slug]' }
    session = await createTestCompilerSession(dir, selected)
    const artifact = await session.compile(
      { ...entry(), profile: selected },
      { signal: new AbortController().signal }
    )
    expect(routeRequests).toEqual(['/reference/[slug]'])
    expect(artifact.kind).toBe('rsc')
    if (artifact.kind !== 'rsc') throw new Error('Expected RSC artifact')
    expect(artifact.manifestPage).toMatch(/^\/__next_test__\/[a-f0-9]+\/page$/)
    expect(artifact.route).toMatchObject({
      pathname: selected.route,
      page: '/reference/[slug]/page',
      runtime: 'nodejs',
      rootParamNames: [],
      sources: [
        { file: 'app/layout.jsx' },
        { file: 'app/reference/[slug]/page.jsx' },
      ],
    })
    expect(artifact.files).toContain(artifact.route!.metadataPath)
    expect(artifact.manifests.clientReference).toContain(artifact.manifestPage)
    for (const key of ['routeBuild', 'routeFont', 'routeLoadable'] as const) {
      expect(artifact.manifests[key]).toContain(artifact.manifestPage)
      expect(artifact.files).toContain(artifact.manifests[key])
    }
    expect(artifact.requestContext?.routeRenderOpts?.basePath).toBe('')
  })

  it.each([
    ['missing', 'Missing native AppProject test route metadata'],
    ['runtime', 'matching native AppProject route metadata'],
    ['pathname', 'matching native AppProject route metadata'],
    ['entry', 'entry source identity does not match'],
    ['source', 'route source changed or escaped'],
  ])(
    'rejects %s native route facts without publication',
    async (kind, message) => {
      mockCacheComponents = false
      const selected = { ...profile, route: '/reference/[slug]' }
      session = await createTestCompilerSession(dir, selected)
      const hash = async (file: string) =>
        createHash('sha256')
          .update(await readFile(join(dir, file)))
          .digest('hex')
      routeMetadata =
        kind === 'missing'
          ? null
          : {
              version: 1,
              pathname: kind === 'pathname' ? '/wrong' : selected.route,
              page: `${selected.route}/page`,
              runtime: kind === 'runtime' ? 'edge' : 'nodejs',
              basePath: '',
              rootParamNames: [],
              config: {
                dynamic: 'auto',
                dynamicParams: true,
                fetchCache: 'auto',
                revalidate: false,
              },
              entry: {
                file: 'subject.test.ts',
                sha256:
                  kind === 'entry'
                    ? '0'.repeat(64)
                    : await hash('subject.test.ts'),
              },
              sources: [
                {
                  file: 'app/reference/[slug]/page.jsx',
                  sha256: await hash('app/reference/[slug]/page.jsx'),
                },
              ],
            }
      if (kind === 'source')
        beforeEmit = async () => {
          await writeFile(
            join(dir, 'app/reference/[slug]/page.jsx'),
            'export const runtime = "edge"'
          )
        }
      await expect(
        session.compile(
          { ...entry(), profile: selected },
          { signal: new AbortController().signal }
        )
      ).rejects.toThrow(message)
      expect(
        (await readdir(join(dir, '.next'))).filter((name) =>
          name.startsWith('.next-test-')
        )
      ).toEqual([])
    }
  )

  it('captures the private import option once before opening the session', async () => {
    let reads = 0
    session = await createTestCompilerSession(dir, profile, {
      get nativeImportCoverageRoles() {
        reads++
        return reads !== 1
      },
    })
    expect(reads).toBe(1)
    await session.compile(entry(), { signal: new AbortController().signal })
    expect(reads).toBe(1)
  })

  it('rejects route prerender configuration before acquiring the output writer', async () => {
    const acquired = jest.mocked(Lockfile.tryAcquire).mock.calls.length
    await expect(
      createTestCompilerSession(dir, {
        ...profile,
        route: '/reference/[slug]',
      })
    ).rejects.toThrow('without Cache Components')
    expect(Lockfile.tryAcquire).toHaveBeenCalledTimes(acquired)
  })

  it('rejects an occupied application output before creating another compiler', async () => {
    jest.mocked(Lockfile.tryAcquire).mockReturnValueOnce(undefined)
    await expect(createTestCompilerSession(dir, profile)).rejects.toThrow(
      'already owned'
    )
    expect(createDevTurbopackProject).not.toHaveBeenCalled()
  })

  it('releases its output lock when compiler creation fails', async () => {
    jest
      .mocked(createDevTurbopackProject)
      .mockRejectedValueOnce(new Error('native startup failed'))
    await expect(createTestCompilerSession(dir, profile)).rejects.toThrow(
      'native startup failed'
    )
    expect(
      jest.mocked(Lockfile.tryAcquire).mock.results.at(-1)!.value.unlock
    ).toHaveBeenCalledTimes(1)
  })

  it('publishes distinct complete revisions and retains earlier bytes until disposal', async () => {
    session = await createTestCompilerSession(dir, profile)
    const first = await session.compile(entry(), {
      signal: new AbortController().signal,
    })
    expect(first.dependencyEvidence).toEqual({
      kind: 'emitted-output',
      complete: false,
      serverOutputs: expect.arrayContaining([
        { path: first.entryPath, contentHash: 'native-hash' },
      ]),
    })
    expect(first.version).toBe(2)
    expect(first.kind).toBe('rsc')
    if (first.kind !== 'rsc') throw new Error('Expected RSC artifact')
    expect(first.requestContext).toEqual({
      mode: 'development',
      buildId: 'development',
      deploymentId: 'test-deployment',
      incrementalCache: {
        cacheMaxMemorySize: 123456,
        allowedRevalidateHeaderKeys: ['x-test-revalidate'],
        fetchCacheKeyPrefix: 'test-cache',
        isrFlushToDisk: true,
        customHandlersConfigured: false,
      },
      renderOpts: {
        cacheComponents: true,
        cacheLifeProfiles: {
          default: { stale: 300, revalidate: 900, expire: 3600 },
        },
        staticPageGenerationTimeout: 60,
        validationLevel: 'none',
        assetPrefix: '/assets',
        experimental: {
          authInterrupts: true,
          useCacheTimeout: 5000,
          durableUseCacheEntries: true,
        },
      },
    })
    outputText = 'second revision'
    const second = await session.compile(entry(), {
      signal: new AbortController().signal,
    })
    expect(first.rootDir).not.toBe(second.rootDir)
    expect(await readFile(join(first.rootDir, first.entryPath), 'utf8')).toBe(
      'first revision'
    )
    expect(await readFile(join(second.rootDir, second.entryPath), 'utf8')).toBe(
      'second revision'
    )
    expect(first.files).toContain('static/client.js')
    expect(first.files).toContain(first.manifests.previewProps)
    expect(first.files).toContain(first.manifests.prerender)
    expect(
      JSON.parse(
        await readFile(
          join(first.rootDir, first.manifests.previewProps!),
          'utf8'
        )
      )
    ).toEqual({
      previewModeId: 'test-preview-id',
      previewModeSigningKey: 'test-signing-key',
      previewModeEncryptionKey: 'test-encryption-key',
    })
    expect(
      JSON.parse(
        await readFile(join(first.rootDir, first.manifests.prerender!), 'utf8')
      )
    ).toEqual({
      version: 4,
      routes: {},
      dynamicRoutes: {},
      notFoundRoutes: [],
    })
    expect(first.files).toContain('server/subject.js.map')
    expect(
      JSON.parse(await readFile(join(first.rootDir, 'package.json'), 'utf8'))
    ).toEqual({ type: 'commonjs' })
    await session.dispose()
    await expect(
      readFile(join(first.rootDir, first.entryPath))
    ).rejects.toMatchObject({ code: 'ENOENT' })
    expect(shutdown).toHaveBeenCalledTimes(1)
  })

  it('retains parent-allocated publication through compiler disposal', async () => {
    const allocated: string[] = []
    session = await createTestCompilerSession(dir, profile, {
      async allocateArtifact(parentDir) {
        expect(parentDir).toBe(join(dir, '.next'))
        const stagingDir = await mkdtemp(
          join(parentDir, '.next-test-pending-parent-')
        )
        const rootDir = join(parentDir, '.next-test-parent-publication')
        allocated.push(stagingDir, rootDir)
        return { stagingDir, rootDir }
      },
    })
    beforeEmit = async () => {
      expect(allocated).toHaveLength(2)
    }
    const artifact = await session.compile(entry(), {
      signal: new AbortController().signal,
    })
    expect(artifact.rootDir).toBe(allocated[1])
    await session.shutdownCompilation()
    expect(
      await readFile(join(artifact.rootDir, artifact.entryPath), 'utf8')
    ).toBe('first revision')
    await session.dispose()
    expect(
      await readFile(join(artifact.rootDir, artifact.entryPath), 'utf8')
    ).toBe('first revision')
  })

  it('rejects an allocator publication path that already exists without deleting its contents', async () => {
    let rootDir: string
    session = await createTestCompilerSession(dir, profile, {
      async allocateArtifact(parentDir) {
        const stagingDir = await mkdtemp(
          join(parentDir, '.next-test-pending-parent-')
        )
        rootDir = join(parentDir, '.next-test-existing')
        await mkdir(rootDir)
        await writeFile(join(rootDir, 'owned-elsewhere'), 'preserve')
        return { stagingDir, rootDir }
      },
    })
    await expect(
      session.compile(entry(), { signal: new AbortController().signal })
    ).rejects.toThrow('must not already exist')
    await session.dispose()
    expect(await readFile(join(rootDir!, 'owned-elsewhere'), 'utf8')).toBe(
      'preserve'
    )
  })

  it('awaits parent allocation before completing cancelled disposal', async () => {
    const emit = jest.fn(async () => {})
    beforeEmit = emit
    let release!: () => void
    let started!: () => void
    const entered = new Promise<void>((resolve) => {
      started = resolve
    })
    const ready = new Promise<void>((resolve) => {
      release = resolve
    })
    session = await createTestCompilerSession(dir, profile, {
      async allocateArtifact(parentDir) {
        started()
        await ready
        return {
          stagingDir: await mkdtemp(
            join(parentDir, '.next-test-pending-parent-')
          ),
          rootDir: join(parentDir, '.next-test-parent-delayed'),
        }
      },
    })
    const controller = new AbortController()
    const compiling = session.compile(entry(), { signal: controller.signal })
    await entered
    controller.abort()
    const rejected = compiling.catch((error) => error)
    const disposed = session.dispose()
    expect(shutdown).not.toHaveBeenCalled()
    release()
    expect(await rejected).toMatchObject({ name: 'AbortError' })
    await disposed
    expect(emit).not.toHaveBeenCalled()
    expect(await readdir(join(dir, '.next'))).toEqual([
      expect.stringMatching(/^\.next-test-pending-parent-/),
      'dev',
    ])
  })

  it('shuts down compilation after pending work while retaining published revisions', async () => {
    session = await createTestCompilerSession(dir, profile)
    let release!: () => void
    let started!: () => void
    const emitted = new Promise<void>((resolve) => {
      release = resolve
    })
    const entered = new Promise<void>((resolve) => {
      started = resolve
    })
    beforeEmit = () => {
      started()
      return emitted
    }
    const compiling = session.compile(entry(), {
      signal: new AbortController().signal,
    })
    await entered
    const stopped = session.shutdownCompilation()
    expect(session.shutdownCompilation()).toBe(stopped)
    expect(shutdown).not.toHaveBeenCalled()
    await expect(
      session.compile(entry(), { signal: new AbortController().signal })
    ).rejects.toThrow('shut down')
    release()
    const artifact = await compiling
    await stopped
    expect(shutdown).toHaveBeenCalledTimes(1)
    expect(
      await readFile(join(artifact.rootDir, artifact.entryPath), 'utf8')
    ).toBe('first revision')
    await session.dispose()
    expect(shutdown).toHaveBeenCalledTimes(1)
    await expect(
      readFile(join(artifact.rootDir, artifact.entryPath))
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects file symlinks instead of publishing mutable dependency contents', async () => {
    session = await createTestCompilerSession(dir, profile)
    linkOutput = true
    await expect(
      session.compile(entry(), { signal: new AbortController().signal })
    ).rejects.toThrow('external package links')
    expect(await readdir(join(dir, '.next'))).toEqual(['dev'])
  })

  function externalFixture() {
    const directories = ['a', 'b', 'c', 'd'].map(
      (id) => `node_modules/.next-test-external/${id.repeat(16)}`
    )
    const [root, left, right, shared] = directories
    const links = [
      { path: 'node_modules/root-0123456789abcdef', target: root },
      { path: 'node_modules/@scope/root-fedcba9876543210', target: root },
      { path: `${root}/node_modules/left`, target: left },
      { path: `${root}/node_modules/right`, target: right },
      { path: `${left}/node_modules/@scope/shared`, target: shared },
      { path: `${right}/node_modules/@scope/shared`, target: shared },
      { path: `${shared}/node_modules/root`, target: root },
    ].sort((a, b) => (a.path < b.path ? -1 : 1))
    externalFiles = Object.fromEntries(
      directories.flatMap((directory, index) => [
        [`${directory}/package.json`, '{"main":"index.cjs"}'],
        [
          `${directory}/index.cjs`,
          [
            "const self = module.exports = {name:'root'}; self.left = require('left'); self.right = require('right')",
            "module.exports = {shared:require('@scope/shared')}",
            "module.exports = {shared:require('@scope/shared')}",
            "const self = module.exports = {name:'shared'}; self.root = require('root')",
          ][index],
        ],
      ])
    )
    return { version: 1, kind: 'node-external-layout', directories, links }
  }

  it('publishes scoped aliases, diamond dependencies and cycles with one native module identity', async () => {
    externalLayout = externalFixture()
    const nodeProfile = { ...profile, environment: 'node' as const }
    session = await createTestCompilerSession(dir, nodeProfile)
    const artifact = await session.compile(
      { ...entry(), profile: nodeProfile },
      { signal: new AbortController().signal }
    )
    const result = require('node:child_process').spawnSync(
      process.execPath,
      [
        '-e',
        `const assert = require('node:assert/strict');
         const {createRequire} = require('node:module');
         const {join} = require('node:path');
         const {pathToFileURL} = require('node:url');
         const load = createRequire(join(process.cwd(), 'entry.cjs'));
         const a = load('root-0123456789abcdef');
         assert.equal(load('@scope/root-fedcba9876543210'), a);
         assert.equal(a.left.shared, a.right.shared);
         assert.equal(a.left.shared.root, a);
         import(pathToFileURL(load.resolve('@scope/root-fedcba9876543210')).href)
           .then(namespace => { assert.equal(namespace.default, a); console.log('shared-native-identity') })
           .catch(error => { console.error(error); process.exitCode = 1 });`,
      ],
      { cwd: artifact.rootDir, encoding: 'utf8', timeout: 20_000 }
    )
    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe('shared-native-identity')
    expect(artifact.files).toContainEqual(
      expect.stringMatching(/\.external-layout\.json$/)
    )
    await session.dispose()
    await expect(readdir(artifact.rootDir)).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('leaves emitted package files untouched when no external layout is present', async () => {
    externalFixture()
    const nodeProfile = { ...profile, environment: 'node' as const }
    session = await createTestCompilerSession(dir, nodeProfile)
    const artifact = await session.compile(
      { ...entry(), profile: nodeProfile },
      { signal: new AbortController().signal }
    )
    expect(await readdir(join(artifact.rootDir, 'node_modules'))).toEqual([
      '.next-test-external',
    ])
  })

  it('rolls back its created links when a later link cannot be materialized', async () => {
    const {
      materializeExternalLayout,
    } = require('next/dist/experimental/testing/compiler/external-layout')
    const layout = externalFixture()
    const metadata = 'server/next-test/rollback.external-layout.json'
    externalFiles[metadata] = JSON.stringify(layout)
    const root = join(dir, 'published')
    for (const [path, contents] of Object.entries(externalFiles)) {
      await mkdir(dirname(join(root, path)), { recursive: true })
      await writeFile(join(root, path), contents)
    }
    const last = layout.links[layout.links.length - 1].path
    await writeFile(join(root, last), 'preserve existing contents')
    await expect(
      materializeExternalLayout(root, Object.keys(externalFiles), 'rollback')
    ).rejects.toMatchObject({ code: 'EEXIST' })
    expect(await readFile(join(root, last), 'utf8')).toBe(
      'preserve existing contents'
    )
    for (const { path } of layout.links.slice(0, -1)) {
      await expect(
        require('fs/promises').lstat(join(root, path))
      ).rejects.toMatchObject({ code: 'ENOENT' })
    }
  })

  it.each([
    'version',
    'unknown field',
    'directory traversal',
    'duplicate directory',
    'directory order',
    'missing package files',
    'unhashed alias',
    'foreign owner',
    'foreign target',
    'duplicate link',
    'link order',
    'link overlaps emitted files',
  ])(
    'rejects %s in an external layout and removes its owned publication',
    async (invalid) => {
      const layout = externalFixture()
      switch (invalid) {
        case 'version':
          layout.version = 2
          break
        case 'unknown field':
          Object.assign(layout, { extra: true })
          break
        case 'directory traversal':
          layout.directories[0] += '/..'
          break
        case 'duplicate directory':
          layout.directories.splice(1, 0, layout.directories[0])
          break
        case 'directory order':
          layout.directories.reverse()
          break
        case 'missing package files':
          externalFiles = {}
          break
        case 'unhashed alias':
          layout.links[layout.links.length - 1].path = 'node_modules/root'
          break
        case 'foreign owner':
          layout.links[0].path =
            'node_modules/.next-test-external/0000000000000000/node_modules/left'
          break
        case 'foreign target':
          layout.links[0].target =
            'node_modules/.next-test-external/0000000000000000'
          break
        case 'duplicate link':
          layout.links.splice(1, 0, layout.links[0])
          break
        case 'link order':
          layout.links.reverse()
          break
        case 'link overlaps emitted files':
          externalFiles[`${layout.links[0].path}/index.cjs`] =
            'module.exports = 1'
          break
        default:
          throw new Error('Unknown external layout control')
      }
      externalLayout = layout
      const nodeProfile = { ...profile, environment: 'node' as const }
      session = await createTestCompilerSession(dir, nodeProfile)
      await expect(
        session.compile(
          { ...entry(), profile: nodeProfile },
          { signal: new AbortController().signal }
        )
      ).rejects.toThrow('Invalid compiler-issued external package layout')
      expect(await readdir(join(dir, '.next'))).toEqual(['dev'])
    }
  )

  it('does not publish compilation failures', async () => {
    session = await createTestCompilerSession(dir, profile)
    failCompilation = true
    await expect(
      session.compile(entry(), { signal: new AbortController().signal })
    ).rejects.toThrow('Invalid server-only boundary')
    expect(await readdir(join(dir, '.next'))).toEqual(['dev'])
  })

  it('waits for native emission before cleaning up a cancelled compilation', async () => {
    session = await createTestCompilerSession(dir, profile)
    let release!: () => void
    let started!: () => void
    const emitted = new Promise<void>((resolve) => {
      release = resolve
    })
    const entered = new Promise<void>((resolve) => {
      started = resolve
    })
    beforeEmit = () => {
      started()
      return emitted
    }
    const controller = new AbortController()
    const result = session.compile(entry(), { signal: controller.signal })
    await entered
    controller.abort(new Error('cancelled'))
    const disposed = session.dispose()
    release()
    await expect(result).rejects.toThrow('cancelled')
    await disposed
    expect(await readdir(join(dir, '.next'))).toEqual(['dev'])
    expect(shutdown).toHaveBeenCalledTimes(1)
  })

  it.each([
    'import.meta.vitest',
    'import.meta /* comment */ .vitest',
    'import.meta. vitest',
  ])(
    'negotiates ordinary current-file marker %s even when discovery metadata is absent',
    async (marker) => {
      const nodeProfile = { ...profile, environment: 'node' as const }
      session = await createTestCompilerSession(dir, nodeProfile)
      const compilation = await jest
        .mocked(createDevTurbopackProject)
        .mock.results.at(-1)!.value
      const nativeEntry = compilation.project.testEntry.bind(
        compilation.project
      )
      let nativeInSourceVersion: number | undefined
      compilation.project.testEntry = async (options) => {
        if (options.inSource && !nativeInSourceVersion) {
          throw new Error(
            'The installed Turbopack binding does not support native in-source test entries'
          )
        }
        return nativeEntry(options)
      }
      const source = await readFile(
        join(
          __dirname,
          '../app-dir/next-testing-stable-release-gaps/fixtures/in-source-tests/subject.source.mjs'
        )
      )
      const selectedSource = source
        .toString('utf8')
        .replaceAll('import.meta.vitest', marker)
      await writeFile(entry().file, selectedSource)
      const selected = { ...entry(), profile: nodeProfile }
      nativeInSourceVersion = undefined
      await expect(
        session.compile(selected, { signal: new AbortController().signal })
      ).rejects.toThrow('does not support native in-source test entries')
      expect(cohortRequests).toHaveLength(0)
      nativeInSourceVersion = 1
      const artifact = await session.compile(selected, {
        signal: new AbortController().signal,
      })
      expect(artifact.sourceHash).toBe(
        createHash('sha256').update(selectedSource).digest('hex')
      )
      nativeSourceIdentity = 'missing'
      await expect(
        session.compile(selected, { signal: new AbortController().signal })
      ).rejects.toThrow('Missing native in-source test source identity')
    }
  )

  it('rejects parenthesized import.meta objects before ordinary or cohort native emission', async () => {
    const entries = await sharedInputs()
    await writeFile(
      entries[0].file,
      'if((import.meta).vitest){throw new Error("must not execute")}'
    )
    const options = { signal: new AbortController().signal }
    await expect(session!.compile(entries[0], options)).rejects.toThrow(
      'remains unqualified'
    )
    await expect(session!.compileCohort(entries, options)).rejects.toThrow(
      'remains unqualified'
    )
    expect(cohortRequests).toHaveLength(0)
  })

  it('binds in-source discovery to the exact source bytes before compilation', async () => {
    const nodeProfile = { ...profile, environment: 'node' as const }
    session = await createTestCompilerSession(dir, nodeProfile)
    const source = await readFile(entry().file)
    const selected = {
      ...entry(),
      profile: nodeProfile,
      inSource: true as const,
      inSourceHash: createHash('sha256').update(source).digest('hex'),
    }
    const compileOptions = { signal: new AbortController().signal }
    await expect(
      session.compile({ ...selected, inSourceHash: undefined }, compileOptions)
    ).rejects.toThrow('does not match the selected Node source bytes')
    await writeFile(entry().file, '// changed since marker discovery')
    await expect(session.compile(selected, compileOptions)).rejects.toThrow(
      'does not match the selected Node source bytes'
    )
    expect(await readdir(join(dir, '.next'))).toEqual(['dev'])
    await writeFile(entry().file, source)
    const artifact = await session.compile(selected, compileOptions)
    expect(artifact.sourceHash).toBe(selected.inSourceHash)
  })

  it.each([
    ['missing', 'Missing native in-source test source identity'],
    [
      '0'.repeat(64),
      'Native in-source test bytes do not match marker discovery',
    ],
  ])('rejects the in-source native identity %s', async (identity, message) => {
    const nodeProfile = { ...profile, environment: 'node' as const }
    session = await createTestCompilerSession(dir, nodeProfile)
    nativeSourceIdentity = identity
    await expect(
      session.compile(
        {
          ...entry(),
          profile: nodeProfile,
          inSource: true,
          inSourceHash: createHash('sha256')
            .update(await readFile(entry().file))
            .digest('hex'),
        },
        { signal: new AbortController().signal }
      )
    ).rejects.toThrow(message)
    expect(await readdir(join(dir, '.next'))).toEqual(['dev'])
  })

  it('vetoes in-source edits during native emission before artifact publication', async () => {
    const nodeProfile = { ...profile, environment: 'node' as const }
    session = await createTestCompilerSession(dir, nodeProfile)
    const selected = {
      ...entry(),
      profile: nodeProfile,
      inSource: true as const,
      inSourceHash: createHash('sha256')
        .update(await readFile(entry().file))
        .digest('hex'),
    }
    beforeEmit = async () => {
      await writeFile(entry().file, '// changed during native emission')
    }
    await expect(
      session.compile(selected, { signal: new AbortController().signal })
    ).rejects.toThrow(
      'Native in-source test bytes do not match marker discovery'
    )
    expect(await readdir(join(dir, '.next'))).toEqual(['dev'])
  })

  it('publishes runtime registration only with its native dynamic and actual cache owner metadata', async () => {
    const nodeProfile = { ...profile, environment: 'node' as const }
    session = await createTestCompilerSession(dir, nodeProfile)
    mockMetadata = {
      moduleCache: { version: 1 },
      dynamicModuleMocking: { version: 1 },
    }
    const artifact = await session.compile(
      { ...entry(), profile: nodeProfile },
      { signal: new AbortController().signal }
    )
    expect(artifact.kind).toBe('node')
    if (artifact.kind !== 'node')
      throw new Error('Expected Node runtime mock owner')
    expect(artifact.dynamicModuleMocking).toEqual({ version: 1 })
    expect(artifact.moduleCache).toEqual({ version: 1 })
    expect(artifact).not.toHaveProperty('moduleMocking')
    mockMetadata = { moduleCache: { version: 1 } }
    expect(
      await session.compile(
        { ...entry(), profile: nodeProfile },
        { signal: new AbortController().signal }
      )
    ).not.toHaveProperty('dynamicModuleMocking')
  })
  it.each([
    { version: 2, cache: true, environment: 'node' as const },
    { version: 1, cache: false, environment: 'node' as const },
    { version: 1, cache: true, environment: 'rsc' as const },
    { version: 1, cache: true, environment: 'browser' as const },
    { version: 1, cache: true, environment: 'node' as const, staticMock: true },
  ])(
    'rejects invalid native runtime registration metadata %j',
    async ({ version, cache, environment, staticMock }) => {
      const dynamicProfile = { ...profile, environment }
      session = await createTestCompilerSession(dir, dynamicProfile)
      mockMetadata = {
        dynamicModuleMocking: { version },
        ...(cache ? { moduleCache: { version: 1 } } : {}),
        ...(staticMock ? { moduleMocking: { version: 1 } } : {}),
      }
      await expect(
        session.compile(
          { ...entry(), profile: dynamicProfile },
          { signal: new AbortController().signal }
        )
      ).rejects.toThrow('Invalid native runtime module mock ownership metadata')
      expect(await readdir(join(dir, '.next'))).toEqual(['dev'])
    }
  )

  it('activates static native runtime mocks only from the complete marked compiler metadata', async () => {
    const nodeProfile = { ...profile, environment: 'node' as const }
    session = await createTestCompilerSession(dir, nodeProfile)
    mockMetadata = {
      moduleCache: { version: 1 },
      dynamicModuleMocking: { version: 1, staticMocks: 1 },
      moduleMocking: { version: 1 },
    }
    const encoded = JSON.stringify(mockMetadata)
    const artifact = await session.compile(
      { ...entry(), profile: nodeProfile },
      { signal: new AbortController().signal }
    )
    expect(artifact.kind).toBe('node')
    if (artifact.kind !== 'node') throw new Error('Expected paired Node owner')
    expect(artifact.moduleCache).toEqual({ version: 1 })
    expect(artifact.dynamicModuleMocking).toEqual({
      version: 1,
      staticMocks: 1,
    })
    expect(artifact.moduleMocking).toEqual({ version: 1 })
    expect(JSON.stringify(mockMetadata)).toBe(encoded)
  })

  it.each([
    { dynamicModuleMocking: { version: 1, staticMocks: 1 } },
    {
      dynamicModuleMocking: { version: 1, staticMocks: 1 },
      moduleCache: { version: 1 },
    },
    {
      dynamicModuleMocking: { version: 1, staticMocks: 1 },
      moduleMocking: { version: 1 },
    },
    ...[0, 2, true, null, '1'].map((staticMocks) => ({
      dynamicModuleMocking: { version: 1, staticMocks },
      moduleCache: { version: 1 },
      moduleMocking: { version: 1 },
    })),
    ...[undefined, 2].map((version) => ({
      dynamicModuleMocking: { version, staticMocks: 1 },
      moduleCache: { version: 1 },
      moduleMocking: { version: 1 },
    })),
    {
      dynamicModuleMocking: { version: 1, staticMocks: 1 },
      moduleCache: { version: 2 },
      moduleMocking: { version: 1 },
    },
    ...[
      { version: 2 },
      { version: 1, cjsNamedSpy: 1 },
      { version: 1, setupInputs: 1 },
      { version: 1, coverage: { version: 1, sources: [] } },
      { version: 1, productionStaticFactory: 1 },
    ].map((moduleMocking) => ({
      dynamicModuleMocking: { version: 1, staticMocks: 1 },
      moduleCache: { version: 1 },
      moduleMocking,
    })),
  ])(
    'rejects partial or malformed paired runtime metadata %j',
    async (metadata) => {
      const nodeProfile = { ...profile, environment: 'node' as const }
      session = await createTestCompilerSession(dir, nodeProfile)
      mockMetadata = metadata
      await expect(
        session.compile(
          { ...entry(), profile: nodeProfile },
          { signal: new AbortController().signal }
        )
      ).rejects.toThrow('Invalid native runtime module mock ownership metadata')
      expect(await readdir(join(dir, '.next'))).toEqual(['dev'])
    }
  )

  it.each([
    'production',
    'rsc',
    'browser',
    'setup',
    'serializers',
    'realm',
    'in-source',
    'coverage',
  ] as const)(
    'retains the paired static runtime boundary for %s',
    async (mode) => {
      const previousEnvironment = process.env.NODE_ENV
      const swc =
        require('next/dist/build/swc') as typeof import('next/dist/build/swc')
      const previousDefineEnv = Object.getOwnPropertyDescriptor(
        swc,
        'createDefineEnv'
      )
      let productionBindings: jest.SpyInstance | undefined
      try {
        if (mode === 'production') {
          process.env = { ...process.env, NODE_ENV: 'production' }
          // The publication fixture supplies its controlled native endpoint in
          // both modes; real production option construction still runs.
          Object.defineProperty(swc, 'createDefineEnv', {
            configurable: true,
            value: () => ({ client: [], edge: [], nodejs: [] }),
          })
          productionBindings = jest
            .spyOn(swc, 'loadBindings')
            .mockResolvedValue({
              isWasm: false,
              turbo: {
                createProject: async () => ({
                  issues: [],
                  value: (await (createDevTurbopackProject as jest.Mock)())
                    .project,
                }),
              },
            } as any)
        }
        const nodeProfile = {
          ...profile,
          environment: mode === 'rsc' || mode === 'browser' ? mode : 'node',
          mode: mode === 'production' ? 'production' : 'development',
        } as const
        session = await createTestCompilerSession(dir, nodeProfile)
        mockMetadata = {
          moduleCache: { version: 1 },
          dynamicModuleMocking: { version: 1, staticMocks: 1 },
          moduleMocking: { version: 1 },
        }
        await writeFile(join(dir, 'setup.ts'), 'export {}')
        await expect(
          session.compile(
            {
              ...entry(),
              profile: nodeProfile,
              ...(mode === 'realm'
                ? { executionEnvironment: { name: 'node' } }
                : {}),
              ...(mode === 'in-source'
                ? {
                    inSource: true as const,
                    inSourceHash: createHash('sha256')
                      .update(await readFile(entry().file))
                      .digest('hex'),
                  }
                : {}),
            },
            {
              signal: new AbortController().signal,
              ...(mode === 'setup'
                ? { setupFiles: [join(dir, 'setup.ts')] }
                : {}),
              ...(mode === 'serializers'
                ? { snapshotSerializers: [join(dir, 'setup.ts')] }
                : {}),
              ...(mode === 'coverage'
                ? {
                    coverage: {
                      version: 1 as const,
                      kind: 'node-line' as const,
                    },
                  }
                : {}),
            }
          )
        ).rejects.toThrow(
          mode === 'production'
            ? 'Module cache resets require isolated development Node'
            : undefined
        )
        expect(await readdir(join(dir, '.next'))).toEqual(['dev'])
      } finally {
        productionBindings?.mockRestore()
        if (mode === 'production') {
          if (previousDefineEnv)
            Object.defineProperty(swc, 'createDefineEnv', previousDefineEnv)
          else delete (swc as any).createDefineEnv
        }
        process.env = { ...process.env, NODE_ENV: previousEnvironment }
      }
    }
  )

  it('publishes reset capability only from emitted native cache metadata', async () => {
    const nodeProfile = { ...profile, environment: 'node' as const }
    session = await createTestCompilerSession(dir, nodeProfile)
    mockMetadata = { moduleCache: { version: 1 } }
    const artifact = await session.compile(
      { ...entry(), profile: nodeProfile },
      { signal: new AbortController().signal }
    )
    expect(artifact.kind).toBe('node')
    if (artifact.kind !== 'node') throw new Error('Expected Node cache owner')
    expect(artifact.moduleCache).toEqual({ version: 1 })
    expect(artifact).not.toHaveProperty('moduleMocking')
    mockMetadata = undefined
    expect(
      await session.compile(
        { ...entry(), profile: nodeProfile },
        { signal: new AbortController().signal }
      )
    ).not.toHaveProperty('moduleCache')
  })

  it.each([
    { environment: 'node' as const, version: 2 },
    { environment: 'rsc' as const, version: 1 },
    { environment: 'browser' as const, version: 1 },
    { environment: 'node' as const, version: 1, inSourceMarker: true },
    { environment: 'node' as const, version: 1, moduleMocking: { version: 1 } },
    {
      environment: 'node' as const,
      version: 1,
      executionEnvironment: { name: 'node' },
    },
  ])(
    'rejects unsupported native reset profile %j before publication',
    async ({
      environment,
      version,
      moduleMocking,
      executionEnvironment,
      inSourceMarker,
    }) => {
      if (inSourceMarker)
        await writeFile(entry().file, 'if (import.meta.vitest) {}')
      const resetProfile = { ...profile, environment }
      session = await createTestCompilerSession(dir, resetProfile)
      mockMetadata = {
        moduleCache: { version },
        ...(moduleMocking ? { moduleMocking } : {}),
      }
      await expect(
        session.compile(
          { ...entry(), profile: resetProfile, executionEnvironment },
          { signal: new AbortController().signal }
        )
      ).rejects.toThrow('Module cache resets require isolated development Node')
      expect(await readdir(join(dir, '.next'))).toEqual(['dev'])
    }
  )

  it('publishes module mocking capability only from emitted compiler metadata', async () => {
    const nodeProfile = { ...profile, environment: 'node' as const }
    session = await createTestCompilerSession(dir, nodeProfile)
    mockMetadata = { moduleMocking: { version: 1 } }
    const artifact = await session.compile(
      { ...entry(), profile: nodeProfile },
      { signal: new AbortController().signal }
    )
    expect(artifact.moduleMocking).toEqual({ version: 1 })
    mockMetadata = undefined
    const nextArtifact = await session.compile(
      { ...entry(), profile: nodeProfile },
      { signal: new AbortController().signal }
    )
    expect(nextArtifact).not.toHaveProperty('moduleMocking')
  })

  it('retains compiled setup mock inputs only with the native marker', async () => {
    const nodeProfile = { ...profile, environment: 'node' as const }
    session = await createTestCompilerSession(dir, nodeProfile)
    const setup = join(dir, 'setup.ts')
    await writeFile(setup, 'export {}')
    mockMetadata = { moduleMocking: { version: 1, setupInputs: 1 } }
    const artifact = await session.compile(
      { ...entry(), profile: nodeProfile },
      {
        signal: new AbortController().signal,
        setupFiles: [setup],
      }
    )
    expect(artifact.moduleMocking).toEqual({ version: 1, setupInputs: 1 })
    mockMetadata = { moduleMocking: { version: 1 } }
    expect(
      (
        await session.compile(
          { ...entry(), profile: nodeProfile },
          {
            signal: new AbortController().signal,
            setupFiles: [setup],
          }
        )
      ).moduleMocking
    ).toEqual({ version: 1 })
  })

  it.each(['version', 'no setup', 'CommonJS certificate'] as const)(
    'rejects invalid compiled setup mock %s before publication',
    async (mode) => {
      const nodeProfile = { ...profile, environment: 'node' as const }
      session = await createTestCompilerSession(dir, nodeProfile)
      const setup = join(dir, 'setup.ts')
      await writeFile(setup, 'export {}')
      mockMetadata = {
        moduleMocking: {
          version: 1,
          setupInputs: mode === 'version' ? 2 : 1,
          ...(mode === 'CommonJS certificate' ? { cjsNamedSpy: 1 } : {}),
        },
      }
      await expect(
        session.compile(
          { ...entry(), profile: nodeProfile },
          {
            signal: new AbortController().signal,
            setupFiles: mode === 'no setup' ? [] : [setup],
          }
        )
      ).rejects.toThrow('Invalid compiled setup module mock inputs')
      expect(await readdir(join(dir, '.next'))).toEqual(['dev'])
    }
  )

  it('retains a native named CommonJS spy certificate without inferring one', async () => {
    const nodeProfile = { ...profile, environment: 'node' as const }
    session = await createTestCompilerSession(dir, nodeProfile)
    mockMetadata = { moduleMocking: { version: 1, cjsNamedSpy: 1 } }
    const artifact = await session.compile(
      { ...entry(), profile: nodeProfile },
      { signal: new AbortController().signal }
    )
    expect(artifact.moduleMocking).toEqual({ version: 1, cjsNamedSpy: 1 })
    mockMetadata = { moduleMocking: { version: 1 } }
    expect(
      (
        await session.compile(
          { ...entry(), profile: nodeProfile },
          { signal: new AbortController().signal }
        )
      ).moduleMocking
    ).toEqual({ version: 1 })
  })

  it.each([
    'version',
    'rsc',
    'setup',
    'serializers',
    'coverage',
    'realm',
    'in-source',
  ] as const)(
    'rejects unsupported named CommonJS spy %s before publication',
    async (mode) => {
      const selected = {
        ...profile,
        environment: mode === 'rsc' ? ('rsc' as const) : ('node' as const),
      }
      session = await createTestCompilerSession(dir, selected)
      mockMetadata = {
        moduleMocking: { version: 1, cjsNamedSpy: mode === 'version' ? 2 : 1 },
      }
      await writeFile(join(dir, 'setup.ts'), 'export {}')
      if (mode === 'in-source')
        await writeFile(entry().file, 'if (import.meta.vitest) {}')
      await expect(
        session.compile(
          {
            ...entry(),
            profile: selected,
            ...(mode === 'realm'
              ? { executionEnvironment: { name: 'node' } }
              : {}),
          },
          {
            signal: new AbortController().signal,
            ...(mode === 'setup'
              ? { setupFiles: [join(dir, 'setup.ts')] }
              : {}),
            ...(mode === 'serializers'
              ? { snapshotSerializers: [join(dir, 'setup.ts')] }
              : {}),
            ...(mode === 'coverage'
              ? {
                  coverage: { version: 1 as const, kind: 'node-line' as const },
                }
              : {}),
          }
        )
      ).rejects.toThrow(
        'CommonJS named-import spies require isolated development Node'
      )
      expect(await readdir(join(dir, '.next'))).toEqual(['dev'])
    }
  )

  it('rejects older native mock coverage metadata before publishing an artifact', async () => {
    const nodeProfile = { ...profile, environment: 'node' as const }
    session = await createTestCompilerSession(dir, nodeProfile)
    mockMetadata = { moduleMocking: { version: 1 } }
    await expect(
      session.compile(
        { ...entry(), profile: nodeProfile },
        {
          signal: new AbortController().signal,
          coverage: { version: 1, kind: 'node-line' },
        }
      )
    ).rejects.toThrow('native binding with generated-source provenance')
    expect(await readdir(join(dir, '.next'))).toEqual(['dev'])
  })

  it('rejects a production-only native marker in a development artifact', async () => {
    const nodeProfile = { ...profile, environment: 'node' as const }
    session = await createTestCompilerSession(dir, nodeProfile)
    mockMetadata = { moduleMocking: { version: 1, productionStaticFactory: 1 } }
    await expect(
      session.compile(
        { ...entry(), profile: nodeProfile },
        { signal: new AbortController().signal }
      )
    ).rejects.toThrow('Invalid compiled module mocking metadata')
    expect(await readdir(join(dir, '.next'))).toEqual(['dev'])
  })

  it('publishes RSC module mocking only from actual emitted compiler metadata', async () => {
    session = await createTestCompilerSession(dir, profile)
    mockMetadata = { moduleMocking: { version: 1 } }
    const artifact = await session.compile(entry(), {
      signal: new AbortController().signal,
    })
    expect(artifact.kind).toBe('rsc')
    expect(artifact.moduleMocking).toEqual({ version: 1 })
    mockMetadata = undefined
    expect(
      await session.compile(entry(), { signal: new AbortController().signal })
    ).not.toHaveProperty('moduleMocking')
  })

  it.each(['route', 'setup', 'serializers', 'realm', 'reset'] as const)(
    'rejects unsupported RSC mocking %s before publishing',
    async (mode) => {
      mockCacheComponents = false
      const selected = {
        ...profile,
        ...(mode === 'route' ? { route: '/reference/[slug]' } : {}),
      }
      session = await createTestCompilerSession(dir, selected)
      mockMetadata = {
        moduleMocking: { version: 1 },
        ...(mode === 'reset' ? { moduleCache: { version: 1 } } : {}),
      }
      await writeFile(join(dir, 'setup.ts'), 'export {}')
      await expect(
        session.compile(
          {
            ...entry(),
            profile: selected,
            ...(mode === 'realm'
              ? { executionEnvironment: { name: 'node' } }
              : {}),
          },
          {
            signal: new AbortController().signal,
            ...(mode === 'setup'
              ? { setupFiles: [join(dir, 'setup.ts')] }
              : {}),
            ...(mode === 'serializers'
              ? { snapshotSerializers: [join(dir, 'setup.ts')] }
              : {}),
          }
        )
      ).rejects.toThrow(
        mode === 'reset'
          ? 'Module cache resets require isolated development Node'
          : 'Invalid compiled module mocking metadata'
      )
      expect(await readdir(join(dir, '.next'))).toEqual(['dev'])
    }
  )

  it.each([
    ['node', 2],
    ['rsc', 2],
    ['browser', 1],
  ] as const)(
    'rejects module mocking metadata for %s version %s',
    async (environment, version) => {
      const metadataProfile = { ...profile, environment }
      session = await createTestCompilerSession(dir, metadataProfile)
      mockMetadata = { moduleMocking: { version } }
      await expect(
        session.compile(
          { ...entry(), profile: metadataProfile },
          { signal: new AbortController().signal }
        )
      ).rejects.toThrow('Invalid compiled module mocking metadata')
      expect(await readdir(join(dir, '.next'))).toEqual(['dev'])
    }
  )

  it.each(['node', 'browser'] as const)(
    'publishes a %s driver without RSC capabilities',
    async (environment) => {
      const driverProfile = { ...profile, environment }
      session = await createTestCompilerSession(dir, driverProfile)
      const artifact = await session.compile(
        { ...entry(), profile: driverProfile },
        { signal: new AbortController().signal }
      )
      expect(artifact.version).toBe(2)
      expect(artifact.kind).toBe('node')
      expect(artifact.profile).toEqual(driverProfile)
      expect(artifact).not.toHaveProperty('manifests')
      expect(artifact).not.toHaveProperty('manifestPage')
      expect(artifact).not.toHaveProperty('requestContext')
      expect(artifact.files.some((file) => file.includes('manifest'))).toBe(
        false
      )
      if (environment === 'browser') {
        expect(artifact).toHaveProperty('applicationServer', {
          mode: 'development',
          lockDistDir: true,
          distDir: join(dir, '.next/dev'),
        })
      } else {
        expect(artifact).not.toHaveProperty('applicationServer')
      }
    }
  )

  it.each(['node', 'rsc', 'browser'] as const)(
    'requests mutable compiler environment only for development Node, not %s substitutes',
    async (environment) => {
      const selected = { ...profile, environment }
      session = await createTestCompilerSession(dir, selected)
      await session.compile(
        { ...entry(), profile: selected },
        { signal: new AbortController().signal }
      )
      expect(runtimeEnvRequests).toEqual([
        { environment, runtimeEnv: environment === 'node', cohortFiles: [] },
      ])
    }
  )

  it('fails before output allocation when the native boundary lacks mutable environment support', async () => {
    const selected = { ...profile, environment: 'node' as const }
    session = await createTestCompilerSession(dir, selected)
    const compilation = await jest
      .mocked(createDevTurbopackProject)
      .mock.results.at(-1)!.value
    const nativeEntry = compilation.project.testEntry.bind(compilation.project)
    compilation.project.testEntry = async (options) => {
      if (options.runtimeEnv)
        throw new Error(
          'The installed Turbopack binding does not support mutable Node test environment bindings'
        )
      return nativeEntry(options)
    }
    await expect(
      session.compile(
        { ...entry(), profile: selected },
        { signal: new AbortController().signal }
      )
    ).rejects.toThrow('does not support mutable Node test environment bindings')
    expect(runtimeEnvRequests).toEqual([])
    expect(await readdir(join(dir, '.next'))).toEqual(['dev'])
  })

  it('requests the same mutable environment boundary for the complete Node cohort', async () => {
    const entries = await sharedInputs()
    await session!.compileCohort(entries, {
      signal: new AbortController().signal,
    })
    expect(runtimeEnvRequests).toEqual([
      {
        environment: 'node',
        runtimeEnv: true,
        cohortFiles: ['subject.test.ts', 'second.test.ts'],
      },
    ])
  })

  it('rejects a production profile in a development compiler process', async () => {
    await expect(
      createTestCompilerSession(dir, { ...profile, mode: 'production' })
    ).rejects.toThrow('requires NODE_ENV=production')
    expect(createDevTurbopackProject).not.toHaveBeenCalled()
  })
  async function sharedInputs() {
    const nodeProfile = {
      ...profile,
      id: 'node',
      environment: 'node' as const,
    }
    await writeFile(join(dir, 'second.test.ts'), '// second compiler fixture')
    session = await createTestCompilerSession(dir, nodeProfile)
    return [
      { ...entry(), id: 'node:first', profile: nodeProfile },
      {
        id: 'node:second',
        file: join(dir, 'second.test.ts'),
        profile: nodeProfile,
      },
    ]
  }

  it('shared worker cohort emits once with exact ordered per-file identity and retained closure', async () => {
    const entries = await sharedInputs()
    const result = await session!.compileCohort(entries, {
      signal: new AbortController().signal,
    })
    expect(cohortRequests).toEqual([['subject.test.ts', 'second.test.ts']])
    expect(result.version).toBe(1)
    expect(result.artifacts).toHaveLength(2)
    const [first, second] = result.artifacts
    expect(first.rootDir).toBe(second.rootDir)
    expect(first.revision).toBe(second.revision)
    expect(first.entryPath).toBe(second.entryPath)
    expect(first.cohort?.index).toBe(0)
    expect(second.cohort?.index).toBe(1)
    expect(first.cohort?.entries).toEqual(
      await Promise.all(
        entries.map(async (entry, index) => ({
          entryId: entry.id,
          file: index === 0 ? 'subject.test.ts' : 'second.test.ts',
          sourceHash: createHash('sha256')
            .update(await readFile(entry.file))
            .digest('hex'),
        }))
      )
    )
    expect(first.entryId).toBe(entries[0].id)
    expect(second.entryId).toBe(entries[1].id)
    expect(first.sourceHash).toBe(first.cohort!.entries[0].sourceHash)
    expect(second.sourceHash).toBe(first.cohort!.entries[1].sourceHash)
    expect(first.files).toContain(first.cohort!.metadataPath)
    expect(first.cohort!.outputs).toEqual(
      await Promise.all(
        first.files.map(async (outputFile) => ({
          path: outputFile,
          sha256: createHash('sha256')
            .update(await readFile(join(first.rootDir, outputFile)))
            .digest('hex'),
        }))
      )
    )
    await session!.shutdownCompilation()
    expect(await readFile(join(first.rootDir, first.entryPath), 'utf8')).toBe(
      'first revision'
    )
    await session!.dispose()
    await expect(
      readFile(join(first.rootDir, first.entryPath))
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it.each([
    ['missing', null],
    [
      'wrong version',
      { cohort: { version: 2, files: ['subject.test.ts', 'second.test.ts'] } },
    ],
    [
      'wrong order',
      { cohort: { version: 1, files: ['second.test.ts', 'subject.test.ts'] } },
    ],
  ])(
    'shared worker cohort rejects %s native order evidence',
    async (_, metadata) => {
      const entries = await sharedInputs()
      cohortMetadata = metadata
      await expect(
        session!.compileCohort(entries, {
          signal: new AbortController().signal,
        })
      ).rejects.toThrow(/cohort (metadata|order)/)
      expect(await readdir(join(dir, '.next'))).toEqual(['dev'])
    }
  )

  it('shared worker cohort rejects a changed later source before publication', async () => {
    const entries = await sharedInputs()
    beforeEmit = () => writeFile(entries[1].file, '// changed while compiling')
    await expect(
      session!.compileCohort(entries, { signal: new AbortController().signal })
    ).rejects.toThrow('cohort source changed')
    expect(await readdir(join(dir, '.next'))).toEqual(['dev'])
  })

  it.each([
    'empty',
    'duplicate ID',
    'duplicate file',
    'foreign profile',
    'typecheck',
    'in-source',
    'marker source without metadata',
    'spaced marker source without metadata',
    'comment marker source without metadata',
    'DOM execution environment',
    'setup',
    'serializer',
    'coverage',
  ] as const)(
    'shared worker cohort rejects %s before native emission',
    async (invalid) => {
      let entries = await sharedInputs()
      const options = { signal: new AbortController().signal }
      if (invalid === 'empty') entries = []
      if (invalid === 'duplicate ID')
        entries[1] = { ...entries[1], id: entries[0].id }
      if (invalid === 'duplicate file')
        entries[1] = { ...entries[1], file: entries[0].file }
      if (invalid === 'foreign profile')
        entries[1] = {
          ...entries[1],
          profile: { ...entries[1].profile, id: 'other' },
        }
      if (invalid === 'typecheck')
        entries[1] = {
          ...entries[1],
          typecheck: true,
        } as (typeof entries)[number]
      if (invalid === 'in-source')
        entries[1] = {
          ...entries[1],
          inSource: true,
        } as (typeof entries)[number]
      if (invalid === 'DOM execution environment')
        entries[1] = {
          ...entries[1],
          executionEnvironment: { name: 'jsdom', options: {} },
        } as (typeof entries)[number]
      if (invalid.includes('marker source without metadata')) {
        const original = await readFile(
          join(
            __dirname,
            '../app-dir/next-testing-stable-release-gaps/fixtures/in-source-tests/subject.source.mjs'
          ),
          'utf8'
        )
        const marker = invalid.startsWith('spaced')
          ? 'import.meta. vitest'
          : invalid.startsWith('comment')
            ? 'import.meta /* comment */ .vitest'
            : 'import.meta.vitest'
        await writeFile(
          entries[1].file,
          original.replaceAll('import.meta.vitest', marker)
        )
      }
      const unsupported =
        invalid === 'setup'
          ? { setupFiles: [entries[0].file] }
          : invalid === 'serializer'
            ? { snapshotSerializers: ['./serializer.cjs'] }
            : invalid === 'coverage'
              ? {
                  coverage: { version: 1 as const, kind: 'node-line' as const },
                }
              : {}
      await expect(
        session!.compileCohort(entries, { ...options, ...unsupported })
      ).rejects.toThrow(/cohort/)
      expect(cohortRequests).toHaveLength(0)
    }
  )
})

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
    const { realpath } = await import('fs/promises')
    process.env = { ...process.env, NODE_ENV: 'development' }
    root = await realpath(
      await mkdtemp('/private/tmp/next-session-native-config-')
    )
    await writeFile(join(root, 'subject.ts'), 'export const value = 1\n')
    await writeFile(join(root, 'config.json'), '{}\n')
    selectedProfile = {
      id: 'native-session-component',
      mode: 'development',
      environment: 'node',
      runtime: 'nodejs',
      bundler: 'turbopack',
    }
    requests = []
    hashMode = 'sha256'
    omitListed = false
    emittedSidecarSha256 = undefined
    deferredSnapshot = undefined
    shutdownNative = jest.fn(async () => {})
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
                  await deferredSnapshot?.()
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
                    emittedSidecarSha256 = sha(bytes)
                    const nativeHash = createHash('sha256')
                      .update(bytes)
                      .digest('base64')
                    if (!omitListed)
                      serverPaths.push({
                        path,
                        contentHash:
                          hashMode === 'sha256'
                            ? nativeHash
                            : hashMode === 'xxh'
                              ? '0123456789abcdef0123456789abcdef'
                              : hashMode === 'mismatch'
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
    const { realpath } = await import('fs/promises')
    process.env = { ...process.env, NODE_ENV: 'development' }
    root = await realpath(
      await mkdtemp('/private/tmp/next-session-native-config-')
    )
    await writeFile(join(root, 'subject.ts'), 'export const value = 1\n')
    await writeFile(join(root, 'config.json'), '{}\n')
    selectedProfile = {
      id: 'native-session-component',
      mode: 'development',
      environment: 'node',
      runtime: 'nodejs',
      bundler: 'turbopack',
    }
    requests = []
    hashMode = 'sha256'
    omitListed = false
    emittedSidecarSha256 = undefined
    deferredSnapshot = undefined
    shutdownNative = jest.fn(async () => {})
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
                  await deferredSnapshot?.()
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
                    emittedSidecarSha256 = sha(bytes)
                    const nativeHash = createHash('sha256')
                      .update(bytes)
                      .digest('base64')
                    if (!omitListed)
                      serverPaths.push({
                        path,
                        contentHash:
                          hashMode === 'sha256'
                            ? nativeHash
                            : hashMode === 'xxh'
                              ? '0123456789abcdef0123456789abcdef'
                              : hashMode === 'mismatch'
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
    const { realpath } = await import('fs/promises')
    process.env = { ...process.env, NODE_ENV: 'development' }
    root = await realpath(
      await mkdtemp('/private/tmp/next-source-grant-component107-')
    )
    await writeFile(join(root, 'subject.ts'), 'export const value = 1\n')
    await writeFile(join(root, 'config.json'), '{}\n')
    selectedProfile = {
      id: 'native-session-component',
      mode: 'development',
      environment: 'node',
      runtime: 'nodejs',
      bundler: 'turbopack',
    }
    requests = []
    hashMode = 'sha256'
    omitListed = false
    emittedSidecarSha256 = undefined
    deferredSnapshot = undefined
    shutdownNative = jest.fn(async () => {})
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
                  await deferredSnapshot?.()
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
                    emittedSidecarSha256 = sha(bytes)
                    const nativeHash = createHash('sha256')
                      .update(bytes)
                      .digest('base64')
                    if (!omitListed)
                      serverPaths.push({
                        path,
                        contentHash:
                          hashMode === 'sha256'
                            ? nativeHash
                            : hashMode === 'xxh'
                              ? '0123456789abcdef0123456789abcdef'
                              : hashMode === 'mismatch'
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
describe('native no-replace binding wrapper (synthetic raw methods)', () => {
  const { bindTestSnapshotNoReplaceMethods } =
    require('next/dist/build/swc/test-snapshot-no-replace') as typeof import('next/dist/build/swc/test-snapshot-no-replace')
  it('captures original methods and receiver without querying capability during ordinary load', () => {
    const raw: any = {
      token: {},
      testSnapshotNoReplaceCapability: jest.fn(function (this: any) {
        expect(this).toBe(raw)
        return { version: 1, platformSupported: true }
      }),
      testSnapshotPublishNoReplace: jest.fn(function (
        this: any,
        _stage,
        _final,
        expected
      ) {
        expect(this).toBe(raw)
        return expected
      }),
    }
    const wrapped = bindTestSnapshotNoReplaceMethods(raw),
      capability = raw.testSnapshotNoReplaceCapability,
      publish = raw.testSnapshotPublishNoReplace
    expect(capability).not.toHaveBeenCalled()
    raw.testSnapshotNoReplaceCapability = jest.fn(() => {
      throw new Error('replacement')
    })
    raw.testSnapshotPublishNoReplace = jest.fn(() => {
      throw new Error('replacement')
    })
    expect(
      wrapped.testSnapshotPublishNoReplace('/stage', '/final', {
        device: '0',
        inode: '1',
      })
    ).toEqual({ device: '0', inode: '1' })
    expect(capability).toHaveBeenCalledTimes(1)
    expect(publish).toHaveBeenCalledTimes(1)
  })
  it.each(['0', '01', '-1', '18446744073709551616'])(
    'refuses invalid inode %s before raw filesystem effects',
    (inode) => {
      const raw = {
        testSnapshotNoReplaceCapability: () => ({
          version: 1,
          platformSupported: true,
        }),
        testSnapshotPublishNoReplace: jest.fn(),
      }
      const wrapped = bindTestSnapshotNoReplaceMethods(raw)
      expect(() =>
        wrapped.testSnapshotPublishNoReplace('/stage', '/final', {
          device: '0',
          inode,
        })
      ).toThrow('NOREPLACE_INVALID')
      expect(raw.testSnapshotPublishNoReplace).not.toHaveBeenCalled()
    }
  )
  it.each([
    undefined,
    {
      testSnapshotNoReplaceCapability: () => ({
        version: 1,
        platformSupported: false,
      }),
      testSnapshotPublishNoReplace() {},
    },
  ])('refuses unsupported native methods with no fallback', (raw) => {
    const wrapped = bindTestSnapshotNoReplaceMethods(raw)
    expect(() =>
      wrapped.testSnapshotPublishNoReplace('/stage', '/final', {
        device: '0',
        inode: '1',
      })
    ).toThrow('NOREPLACE_UNSUPPORTED')
  })
  it('refuses async or malformed original native results and mismatched returned inode', () => {
    const promise = bindTestSnapshotNoReplaceMethods({
      testSnapshotNoReplaceCapability: async () => ({
        version: 1,
        platformSupported: true,
      }),
      testSnapshotPublishNoReplace() {},
    })
    expect(() => promise.testSnapshotNoReplaceCapability()).toThrow(
      'NOREPLACE_INVALID'
    )
    const changed = bindTestSnapshotNoReplaceMethods({
      testSnapshotNoReplaceCapability: () => ({
        version: 1,
        platformSupported: true,
      }),
      testSnapshotPublishNoReplace: () => ({ device: '0', inode: '2' }),
    })
    expect(() =>
      changed.testSnapshotPublishNoReplace('/stage', '/final', {
        device: '0',
        inode: '1',
      })
    ).toThrow('NOREPLACE_IDENTITY')
  })
})

// Component-only identity controls use the real compiler issuer/grant maps.
// Synthetic endpoint records supply no native-origin or public admission proof.
describe('native opaque identities (synthetic component issuer)', () => {
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
    const { realpath } = await import('fs/promises')
    process.env = { ...process.env, NODE_ENV: 'development' }
    root = await realpath(
      await mkdtemp('/private/tmp/next-native-opaque-component122-')
    )
    await writeFile(join(root, 'subject.ts'), 'export const value = 1\n')
    await writeFile(join(root, 'config.json'), '{}\n')
    selectedProfile = {
      id: 'native-session-component',
      mode: 'development',
      environment: 'node',
      runtime: 'nodejs',
      bundler: 'turbopack',
    }
    requests = []
    hashMode = 'sha256'
    omitListed = false
    emittedSidecarSha256 = undefined
    deferredSnapshot = undefined
    shutdownNative = jest.fn(async () => {})
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
                  await deferredSnapshot?.()
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
                    emittedSidecarSha256 = sha(bytes)
                    const nativeHash = createHash('sha256')
                      .update(bytes)
                      .digest('base64')
                    if (!omitListed)
                      serverPaths.push({
                        path,
                        contentHash:
                          hashMode === 'sha256'
                            ? nativeHash
                            : hashMode === 'xxh'
                              ? '0123456789abcdef0123456789abcdef'
                              : hashMode === 'mismatch'
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

// Wrapper-only controls. Synthetic raw methods supply no native watch, filesystem,
// allocation, compiler, or public authority; actual NAPI qualification is separate.
describe('native directory-deletion binding wrapper (synthetic raw methods)', () => {
  const { bindTestSnapshotDirectoryDeletionMethods: bind } =
    require('next/dist/build/swc/test-snapshot-directory-deletion') as typeof import('next/dist/build/swc/test-snapshot-directory-deletion')
  const expected = () => ({ device: '0', inode: '1' })
  const observed = () => ({
    version: 1,
    device: '0',
    inode: '1',
    deleted: false,
    revoked: false,
    uncertain: false,
    errors: [] as string[],
  })
  const closed = () => ({
    version: 1,
    duplicateClosed: true,
    queueClosed: true,
    uncertain: false,
    errors: [] as string[],
  })
  function setup() {
    const state = { observation: observed(), closure: closed() }
    const native = {
      poll: jest.fn(function (this: unknown) {
        expect(this).toBe(native)
        return state.observation
      }),
      close: jest.fn(function (this: unknown) {
        expect(this).toBe(native)
        return state.closure
      }),
    }
    const raw = {
      testSnapshotDirectoryDeletionCapability: jest.fn(function (
        this: unknown
      ) {
        expect(this).toBe(raw)
        return { version: 1, platformSupported: true }
      }),
      testSnapshotWatchDirectoryDeletion: jest.fn(function (
        this: unknown,
        fd: number,
        identity: unknown
      ) {
        expect(this).toBe(raw)
        expect(fd).toBe(17)
        expect(identity).toEqual(expected())
        expect(Object.isFrozen(identity)).toBe(true)
        return native
      }),
    }
    return { state, native, raw, methods: bind(raw) }
  }
  function failure(action: () => unknown) {
    let error: Error & { cause?: any }
    try {
      action()
      throw new Error('expected wrapper refusal')
    } catch (caught) {
      error = caught as typeof error
    }
    expect(error.message).toMatch('ERR_NEXT_TEST_SNAPSHOT_DELETION_')
    return error
  }

  it('captures raw functions and receivers without capability queries during binding', () => {
    const { raw, native, state, methods } = setup()
    const capability = raw.testSnapshotDirectoryDeletionCapability
    const factory = raw.testSnapshotWatchDirectoryDeletion
    expect(capability).not.toHaveBeenCalled()
    expect(factory).not.toHaveBeenCalled()
    raw.testSnapshotDirectoryDeletionCapability = jest.fn(() => {
      throw new Error('replacement capability')
    })
    raw.testSnapshotWatchDirectoryDeletion = jest.fn(
      (_fd: number, _identity: unknown) => {
        throw new Error('replacement factory')
      }
    )
    const input = expected()
    const watch = methods.testSnapshotWatchDirectoryDeletion(17, input)
    input.inode = '2'
    const poll = native.poll
    const close = native.close
    native.poll = jest.fn(() => {
      throw new Error('replacement poll')
    })
    native.close = jest.fn(() => {
      throw new Error('replacement close')
    })
    expect(Object.getPrototypeOf(watch)).toBeNull()
    expect(Object.isFrozen(watch)).toBe(true)
    expect(watch.poll.call({})).toEqual(state.observation)
    expect(watch.close.call({})).toEqual(state.closure)
    expect(watch.close()).toEqual(state.closure)
    expect(capability).toHaveBeenCalledTimes(1)
    expect(factory).toHaveBeenCalledTimes(1)
    expect(poll).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(2)
    expect(native.poll).not.toHaveBeenCalled()
    expect(native.close).not.toHaveBeenCalled()
  })

  it('captures immediate-prototype data methods and the actual returned receiver', () => {
    const poll = jest.fn(function (this: unknown) {
      expect(this).toBe(native)
      return observed()
    })
    const close = jest.fn(function (this: unknown) {
      expect(this).toBe(native)
      return closed()
    })
    const parent = Object.create(null)
    Object.defineProperties(parent, {
      poll: { value: poll, configurable: true },
      close: { value: close, configurable: true },
    })
    const native = Object.create(parent)
    const raw = {
      testSnapshotDirectoryDeletionCapability: () => ({
        version: 1,
        platformSupported: true,
      }),
      testSnapshotWatchDirectoryDeletion: () => native,
    }
    const watch = bind(raw).testSnapshotWatchDirectoryDeletion(0, expected())
    Object.defineProperties(parent, {
      poll: {
        value: () => {
          throw new Error('replacement prototype poll')
        },
      },
      close: {
        value: () => {
          throw new Error('replacement prototype close')
        },
      },
    })
    expect(watch.poll()).toEqual(observed())
    expect(watch.close()).toEqual(closed())
    expect(poll).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it.each([NaN, Infinity, -Infinity, -1, 0.5, 2147483648, '17', null])(
    'refuses invalid fd %s before capability or factory calls',
    (fd) => {
      const { methods, raw } = setup()
      expect(() =>
        methods.testSnapshotWatchDirectoryDeletion(fd as number, expected())
      ).toThrow('DELETION_INVALID')
      expect(raw.testSnapshotDirectoryDeletionCapability).not.toHaveBeenCalled()
      expect(raw.testSnapshotWatchDirectoryDeletion).not.toHaveBeenCalled()
    }
  )

  it.each([
    ['device leading zero', { device: '00', inode: '1' }],
    ['device overflow', { device: '18446744073709551616', inode: '1' }],
    ['device number', { device: 0, inode: '1' }],
    ['inode zero', { device: '0', inode: '0' }],
    ['inode leading zero', { device: '0', inode: '01' }],
    ['inode negative', { device: '0', inode: '-1' }],
    ['inode overflow', { device: '0', inode: '18446744073709551616' }],
    ['inode whitespace', { device: '0', inode: ' 1' }],
    ['extra field', { device: '0', inode: '1', extra: true }],
    ['missing field', { inode: '1' }],
    ['null', null],
  ])(
    'refuses %s identity before capability or factory calls',
    (_label, input) => {
      const { methods, raw } = setup()
      expect(() =>
        methods.testSnapshotWatchDirectoryDeletion(17, input as any)
      ).toThrow('DELETION_INVALID')
      expect(raw.testSnapshotDirectoryDeletionCapability).not.toHaveBeenCalled()
      expect(raw.testSnapshotWatchDirectoryDeletion).not.toHaveBeenCalled()
    }
  )

  it('refuses identity accessor descriptors without reading them', () => {
    const { methods, raw } = setup()
    const getter = jest.fn(() => '1')
    const input = Object.defineProperty({ device: '0' }, 'inode', {
      enumerable: true,
      get: getter,
    })
    expect(() =>
      methods.testSnapshotWatchDirectoryDeletion(17, input as any)
    ).toThrow('DELETION_INVALID')
    expect(getter).not.toHaveBeenCalled()
    expect(raw.testSnapshotDirectoryDeletionCapability).not.toHaveBeenCalled()
    expect(raw.testSnapshotWatchDirectoryDeletion).not.toHaveBeenCalled()
  })

  it('accepts both u64 maxima and fd i32 maximum without changing native input', () => {
    const input = {
      device: '18446744073709551615',
      inode: '18446744073709551615',
    }
    const raw = {
      testSnapshotDirectoryDeletionCapability: () => ({
        version: 1,
        platformSupported: true,
      }),
      testSnapshotWatchDirectoryDeletion: jest.fn((fd, identity) => {
        expect(fd).toBe(2147483647)
        expect(identity).toEqual(input)
        expect(identity).not.toBe(input)
        return { poll: () => ({ ...observed(), ...input }), close: closed }
      }),
    }
    expect(
      bind(raw).testSnapshotWatchDirectoryDeletion(2147483647, input).poll()
    ).toEqual({ ...observed(), ...input })
    expect(raw.testSnapshotWatchDirectoryDeletion).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['WASM or absent', undefined],
    ['missing factory', { testSnapshotDirectoryDeletionCapability: jest.fn() }],
    ['missing capability', { testSnapshotWatchDirectoryDeletion: jest.fn() }],
    ['empty binding', {}],
  ])('reports unsupported %s methods with no fallback', (_label, raw) => {
    const methods = bind(raw)
    expect(methods.testSnapshotDirectoryDeletionCapability()).toEqual({
      version: 1,
      platformSupported: false,
    })
    expect(() =>
      methods.testSnapshotWatchDirectoryDeletion(0, expected())
    ).toThrow('DELETION_UNSUPPORTED')
    for (const value of Object.values(raw || {}))
      expect(value).not.toHaveBeenCalled()
  })

  it('does not evaluate raw namespace accessors or inherited functions', () => {
    const getter = jest.fn()
    const raw = Object.create({
      testSnapshotWatchDirectoryDeletion: jest.fn(),
    })
    Object.defineProperty(raw, 'testSnapshotDirectoryDeletionCapability', {
      get: getter,
    })
    expect(bind(raw).testSnapshotDirectoryDeletionCapability()).toEqual({
      version: 1,
      platformSupported: false,
    })
    expect(getter).not.toHaveBeenCalled()
  })

  it('honors an explicit unsupported native capability before factory effects', () => {
    const { raw } = setup()
    raw.testSnapshotDirectoryDeletionCapability.mockReturnValue({
      version: 1,
      platformSupported: false,
    })
    const methods = bind(raw)
    expect(
      methods.testSnapshotDirectoryDeletionCapability().platformSupported
    ).toBe(false)
    expect(() =>
      methods.testSnapshotWatchDirectoryDeletion(17, expected())
    ).toThrow('DELETION_UNSUPPORTED')
    expect(raw.testSnapshotWatchDirectoryDeletion).not.toHaveBeenCalled()
  })

  it.each([
    ['async', Promise.resolve({ version: 1, platformSupported: true })],
    ['wrong version', { version: 2, platformSupported: true }],
    ['nonboolean', { version: 1, platformSupported: 1 }],
    ['extra field', { version: 1, platformSupported: true, extra: true }],
    ['missing field', { version: 1 }],
  ])('refuses %s capability records synchronously', (_label, value) => {
    const { raw } = setup()
    raw.testSnapshotDirectoryDeletionCapability.mockReturnValue(value as any)
    const methods = bind(raw)
    expect(() => methods.testSnapshotDirectoryDeletionCapability()).toThrow(
      'DELETION_INVALID'
    )
    expect(() =>
      methods.testSnapshotWatchDirectoryDeletion(17, expected())
    ).toThrow('DELETION_INVALID')
    expect(raw.testSnapshotWatchDirectoryDeletion).not.toHaveBeenCalled()
  })

  it('refuses capability accessors without evaluating them', () => {
    const { raw } = setup()
    const getter = jest.fn(() => true)
    raw.testSnapshotDirectoryDeletionCapability.mockReturnValue(
      Object.defineProperty({ version: 1 }, 'platformSupported', {
        enumerable: true,
        get: getter,
      }) as any
    )
    expect(() => bind(raw).testSnapshotDirectoryDeletionCapability()).toThrow(
      'DELETION_INVALID'
    )
    expect(getter).not.toHaveBeenCalled()
  })

  it.each([null, {}, Promise.resolve({}), () => {}])(
    'refuses malformed or async returned watch with explicit cleanup uncertainty',
    (value) => {
      const { raw } = setup()
      raw.testSnapshotWatchDirectoryDeletion.mockReturnValue(value as any)
      const error = failure(() =>
        bind(raw).testSnapshotWatchDirectoryDeletion(17, expected())
      )
      expect(error.message).toMatch('native cleanup uncertain')
      expect(error.cause.closeCaptured).toBe(false)
      expect(error.cause.cleanup).toBeUndefined()
    }
  )

  it('captures close before rejecting a poll accessor and independently closes once', () => {
    const { raw, native } = setup()
    const getter = jest.fn(() => native.poll)
    const returned = Object.defineProperty({ close: native.close }, 'poll', {
      get: getter,
    })
    native.close.mockImplementation(function (this: unknown) {
      expect(this).toBe(returned)
      return closed()
    })
    raw.testSnapshotWatchDirectoryDeletion.mockReturnValue(returned as any)
    const error = failure(() =>
      bind(raw).testSnapshotWatchDirectoryDeletion(17, expected())
    )
    expect(error.message).toMatch('captured native close completed')
    expect(error.cause.cleanup).toEqual(closed())
    expect(native.close).toHaveBeenCalledTimes(1)
    expect(getter).not.toHaveBeenCalled()
  })

  it('does not invoke a close accessor or invent its cleanup receipt', () => {
    const { raw, native } = setup()
    const getter = jest.fn(() => native.close)
    raw.testSnapshotWatchDirectoryDeletion.mockReturnValue(
      Object.defineProperty({ poll: native.poll }, 'close', {
        get: getter,
      }) as any
    )
    const error = failure(() =>
      bind(raw).testSnapshotWatchDirectoryDeletion(17, expected())
    )
    expect(error.message).toMatch('native cleanup uncertain')
    expect(error.cause.closeCaptured).toBe(false)
    expect(error.cause.cleanup).toBeUndefined()
    expect(getter).not.toHaveBeenCalled()
    expect(native.close).not.toHaveBeenCalled()
  })

  it('refuses methods from deeper prototype ancestors', () => {
    const { raw, native } = setup()
    raw.testSnapshotWatchDirectoryDeletion.mockReturnValue(
      Object.create(Object.create(native))
    )
    const error = failure(() =>
      bind(raw).testSnapshotWatchDirectoryDeletion(17, expected())
    )
    expect(error.message).toMatch('native cleanup uncertain')
    expect(native.close).not.toHaveBeenCalled()
  })

  it('does not fall through an invalid own method to a prototype function', () => {
    const { raw, native } = setup()
    const returned = Object.create(native)
    Object.defineProperty(returned, 'poll', { value: 1 })
    native.close.mockImplementation(function (this: unknown) {
      expect(this).toBe(returned)
      return closed()
    })
    raw.testSnapshotWatchDirectoryDeletion.mockReturnValue(returned)
    const error = failure(() =>
      bind(raw).testSnapshotWatchDirectoryDeletion(17, expected())
    )
    expect(error.message).toMatch('captured native close completed')
    expect(native.close).toHaveBeenCalledTimes(1)
    expect(native.poll).not.toHaveBeenCalled()
  })

  it.each([
    [
      'throws',
      () => {
        throw new Error('native close failure')
      },
    ],
    ['async', () => Promise.resolve(closed())],
    ['malformed', () => ({ ...closed(), deleted: true })],
    ['uncertain', () => ({ ...closed(), uncertain: true, errors: ['revoke'] })],
    [
      'incomplete',
      () => ({
        ...closed(),
        duplicateClosed: false,
        uncertain: true,
        errors: ['duplicate'],
      }),
    ],
  ])(
    'retains %s cleanup uncertainty after postfactory rejection',
    (_label, close) => {
      const { raw } = setup()
      const original = jest.fn(() => close())
      raw.testSnapshotWatchDirectoryDeletion.mockReturnValue({
        close: original,
      } as any)
      const error = failure(() =>
        bind(raw).testSnapshotWatchDirectoryDeletion(17, expected())
      )
      expect(error.message).toMatch('native cleanup uncertain')
      expect(error.cause.closeCaptured).toBe(true)
      expect(original).toHaveBeenCalledTimes(1)
      if (_label === 'uncertain' || _label === 'incomplete')
        expect(error.cause.cleanup.uncertain).toBe(true)
      else expect(error.cause.cleanupFailure).toBeDefined()
    }
  )

  it('copies and freezes each primitive record and errors array without sharing raw records', () => {
    const { methods, state, raw } = setup()
    const firstCap = methods.testSnapshotDirectoryDeletionCapability()
    const secondCap = methods.testSnapshotDirectoryDeletionCapability()
    expect(firstCap).not.toBe(secondCap)
    const watch = methods.testSnapshotWatchDirectoryDeletion(17, expected())
    const first = watch.poll()
    const second = watch.poll()
    const firstClose = watch.close()
    const secondClose = watch.close()
    for (const record of [
      firstCap,
      secondCap,
      first,
      second,
      firstClose,
      secondClose,
    ]) {
      expect(Object.getPrototypeOf(record)).toBeNull()
      expect(Object.isFrozen(record)).toBe(true)
    }
    for (const record of [first, second, firstClose, secondClose])
      expect(Object.isFrozen(record.errors)).toBe(true)
    expect(first).not.toBe(state.observation)
    expect(first).not.toBe(second)
    expect(first.errors).not.toBe(state.observation.errors)
    expect(first.errors).not.toBe(second.errors)
    expect(firstClose).not.toBe(state.closure)
    expect(firstClose).not.toBe(secondClose)
    state.observation.device = '2'
    state.observation.errors.push('later mutation')
    state.closure.errors.push('later close mutation')
    expect(first).toEqual(observed())
    expect(firstClose).toEqual(closed())
    expect(raw.testSnapshotWatchDirectoryDeletion).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['wrong version', { version: 2 }],
    ['device mismatch', { device: '1' }],
    ['inode mismatch', { inode: '2' }],
    ['noncanonical identity', { inode: '01' }],
    ['nonboolean deleted', { deleted: 1 }],
    ['nonboolean revoked', { revoked: 'false' }],
    ['nonboolean uncertain', { uncertain: 0 }],
    ['uncertainty without error', { uncertain: true }],
    ['error without uncertainty', { errors: ['error'] }],
    ['revoked without uncertainty', { revoked: true }],
    [
      'deleted with uncertainty',
      { deleted: true, uncertain: true, errors: ['error'] },
    ],
    [
      'deleted with revoke',
      { deleted: true, revoked: true, uncertain: true, errors: ['revoke'] },
    ],
    ['extra key', { extra: true }],
  ])('refuses %s poll records', (_label, change) => {
    const { state, methods } = setup()
    state.observation = { ...observed(), ...change } as any
    const watch = methods.testSnapshotWatchDirectoryDeletion(17, expected())
    expect(() => watch.poll()).toThrow(
      _label.includes('mismatch') ? 'DELETION_IDENTITY' : 'DELETION_INVALID'
    )
    expect(watch.close()).toEqual(closed())
  })

  it.each([
    ['wrong version', { version: 2 }],
    ['nonboolean duplicate', { duplicateClosed: 1 }],
    ['nonboolean queue', { queueClosed: 'true' }],
    ['nonboolean uncertainty', { uncertain: 0 }],
    ['uncertainty without error', { uncertain: true }],
    ['error without uncertainty', { errors: ['error'] }],
    ['incomplete certain duplicate', { duplicateClosed: false }],
    ['incomplete certain queue', { queueClosed: false }],
    ['forbidden deleted', { deleted: false }],
  ])(
    'refuses %s close records without caching an earlier result',
    (_label, change) => {
      const { state, methods, native } = setup()
      const watch = methods.testSnapshotWatchDirectoryDeletion(17, expected())
      expect(watch.close()).toEqual(closed())
      state.closure = { ...closed(), ...change } as any
      expect(() => watch.close()).toThrow('DELETION_INVALID')
      expect(native.close).toHaveBeenCalledTimes(2)
    }
  )

  it.each([
    ['not array', 'error'],
    ['too many', Array.from({ length: 9 }, (_, i) => String(i))],
    ['empty string', ['']],
    ['duplicate', ['error', 'error']],
    ['nonstring', [1]],
    ['sparse', new Array(1)],
    ['extra key', Object.assign([], { extra: true })],
  ])('refuses %s errors in both poll and close records', (_label, value) => {
    const { state, methods } = setup()
    const watch = methods.testSnapshotWatchDirectoryDeletion(17, expected())
    state.observation = { ...observed(), uncertain: true, errors: value } as any
    state.closure = { ...closed(), uncertain: true, errors: value } as any
    expect(() => watch.poll()).toThrow('DELETION_INVALID')
    expect(() => watch.close()).toThrow('DELETION_INVALID')
  })

  it('does not observe accessors on returned fields or errors', () => {
    const { state, methods } = setup()
    const watch = methods.testSnapshotWatchDirectoryDeletion(17, expected())
    const getter = jest.fn(() => false)
    state.observation = Object.defineProperty(observed(), 'deleted', {
      enumerable: true,
      get: getter,
    })
    expect(() => watch.poll()).toThrow('DELETION_INVALID')
    const reasons: any[] = []
    Object.defineProperty(reasons, '0', { enumerable: true, get: getter })
    state.closure = { ...closed(), uncertain: true, errors: reasons }
    expect(() => watch.close()).toThrow('DELETION_INVALID')
    expect(getter).not.toHaveBeenCalled()
  })

  it.each(['poll', 'close'] as const)(
    'refuses an asynchronous raw %s result synchronously',
    (method) => {
      const { methods, native } = setup()
      if (method === 'poll')
        native.poll.mockReturnValue(Promise.resolve(observed()) as any)
      else native.close.mockReturnValue(Promise.resolve(closed()) as any)
      const watch = methods.testSnapshotWatchDirectoryDeletion(17, expected())
      expect(() => watch[method]()).toThrow('DELETION_INVALID')
      expect(native[method]).toHaveBeenCalledTimes(1)
    }
  )

  it('accepts a positive deletion receipt only when the native record is certain', () => {
    const { methods, state } = setup()
    const watch = methods.testSnapshotWatchDirectoryDeletion(17, expected())
    state.observation.deleted = true
    expect(watch.poll()).toEqual({ ...observed(), deleted: true })
    state.observation = {
      ...observed(),
      uncertain: true,
      errors: Array.from({ length: 8 }, (_, index) => `error ${index}`),
    }
    expect(watch.poll()).toEqual(state.observation)
    expect(watch.close()).toEqual(closed())
  })

  it('propagates a native factory failure without inventing a returned watch or closure', () => {
    const { raw, native } = setup()
    const original = new Error('ERR_NEXT_TEST_SNAPSHOT_DELETION_IO: factory')
    raw.testSnapshotWatchDirectoryDeletion.mockImplementation(() => {
      throw original
    })
    expect(() =>
      bind(raw).testSnapshotWatchDirectoryDeletion(17, expected())
    ).toThrow(original)
    expect(native.poll).not.toHaveBeenCalled()
    expect(native.close).not.toHaveBeenCalled()
  })

  it('returns genuine uncertainty and revoke receipts without treating them as deletion', () => {
    const { state, methods } = setup()
    const watch = methods.testSnapshotWatchDirectoryDeletion(17, expected())
    state.observation = {
      ...observed(),
      revoked: true,
      uncertain: true,
      errors: ['revoke'],
    }
    state.closure = {
      ...closed(),
      duplicateClosed: false,
      uncertain: true,
      errors: ['duplicate close'],
    }
    expect(watch.poll()).toEqual(state.observation)
    expect(watch.poll().deleted).toBe(false)
    expect(watch.close()).toEqual(state.closure)
  })

  it('passes raw native poll and close failures through without inventing cached closure', () => {
    const { methods, native } = setup()
    const rawError = new Error('ERR_NEXT_TEST_SNAPSHOT_DELETION_CLOSED: closed')
    native.poll.mockImplementation(() => {
      throw rawError
    })
    native.close.mockImplementationOnce(closed).mockImplementation(() => {
      throw rawError
    })
    const watch = methods.testSnapshotWatchDirectoryDeletion(17, expected())
    expect(watch.close()).toEqual(closed())
    expect(() => watch.close()).toThrow(rawError)
    expect(() => watch.poll()).toThrow(rawError)
    expect(native.close).toHaveBeenCalledTimes(2)
    expect(native.poll).toHaveBeenCalledTimes(1)
  })

  it('ignores captured freeze return values for all fresh wrappers and records', () => {
    const originalFreeze = Object.freeze
    const foreign = { __proto__: null }
    const replacement = jest
      .spyOn(Object, 'freeze')
      .mockImplementation((value) => {
        originalFreeze(value)
        return foreign as any
      })
    let isolated: typeof bind | undefined
    try {
      jest.isolateModules(() => {
        isolated =
          require('next/dist/build/swc/test-snapshot-directory-deletion').bindTestSnapshotDirectoryDeletionMethods
      })
      const { raw, state } = setup()
      const methods = isolated!(raw)
      const cap = methods.testSnapshotDirectoryDeletionCapability()
      const first = methods.testSnapshotWatchDirectoryDeletion(17, expected())
      const second = methods.testSnapshotWatchDirectoryDeletion(17, expected())
      const poll = first.poll()
      const close = first.close()
      expect(first).not.toBe(second)
      for (const value of [
        methods,
        cap,
        first,
        second,
        poll,
        poll.errors,
        close,
        close.errors,
      ]) {
        expect(value).not.toBe(foreign)
        expect(Object.isFrozen(value)).toBe(true)
      }
      expect(poll).toEqual(state.observation)
      expect(close).toEqual(state.closure)
    } finally {
      replacement.mockRestore()
    }
  })

  it('uses the module-captured original freeze after later mutation without exposing records', () => {
    const { methods } = setup()
    const foreign = {}
    const replacement = jest
      .spyOn(Object, 'freeze')
      .mockReturnValue(foreign as any)
    try {
      const capability = methods.testSnapshotDirectoryDeletionCapability()
      const watch = methods.testSnapshotWatchDirectoryDeletion(17, expected())
      const poll = watch.poll()
      const close = watch.close()
      for (const value of [
        capability,
        watch,
        poll,
        poll.errors,
        close,
        close.errors,
      ]) {
        expect(value).not.toBe(foreign)
        expect(Object.isFrozen(value)).toBe(true)
      }
      expect(replacement).not.toHaveBeenCalled()
    } finally {
      replacement.mockRestore()
    }
  })

  it('attempts original close if wrapper allocation freeze fails after native factory return', () => {
    const originalFreeze = Object.freeze
    let failWrapper = false
    const replacement = jest
      .spyOn(Object, 'freeze')
      .mockImplementation((value: any) => {
        if (
          failWrapper &&
          Object.hasOwn(value, 'poll') &&
          Object.hasOwn(value, 'close')
        )
          throw new Error('wrapper freeze failure')
        return originalFreeze(value)
      })
    let isolated: typeof bind | undefined
    try {
      jest.isolateModules(() => {
        isolated =
          require('next/dist/build/swc/test-snapshot-directory-deletion').bindTestSnapshotDirectoryDeletionMethods
      })
      const { raw, native } = setup()
      const methods = isolated!(raw)
      failWrapper = true
      const error = failure(() =>
        methods.testSnapshotWatchDirectoryDeletion(17, expected())
      )
      expect(error.message).toMatch('captured native close completed')
      expect(error.cause.failure.message).toBe('wrapper freeze failure')
      expect(error.cause.cleanup).toEqual(closed())
      expect(native.close).toHaveBeenCalledTimes(1)
      expect(native.poll).not.toHaveBeenCalled()
    } finally {
      replacement.mockRestore()
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

it('caches compiled original imports by resolved target with fresh outer promises', () => {
  const { execFileSync } = require('node:child_process')
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'cjs-actual-cache-integration.cjs')],
    { encoding: 'utf8', timeout: 135000 }
  )
  const actual = JSON.parse(result)
  expect(actual.close).toEqual({ code: 0, signal: null })
  expect(actual.rows).toHaveLength(3)
}, 140000)

it('automatically mocks compiled CommonJS default and named exports', () => {
  const { execFileSync } = require('node:child_process')
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'cjs-import-mock-integration.cjs')],
    { encoding: 'utf8', timeout: 135000 }
  )
  const actual = JSON.parse(result)
  expect(actual.close).toEqual({ code: 0, signal: null })
  expect(actual.rows).toHaveLength(4)
}, 140000)

it('applies explicit CommonJS object factories while retaining lazy original imports', () => {
  const { execFileSync } = require('node:child_process')
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'cjs-factory-integration.cjs')],
    { encoding: 'utf8', timeout: 135000 }
  )
  const actual = JSON.parse(result)
  expect(actual.close).toEqual({ code: 0, signal: null })
  expect(actual.rows).toHaveLength(3)
}, 140000)

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

it('resets compiled leaf CommonJS object, callable and Promise modules', () => {
  const { execFileSync } = require('node:child_process')
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'cjs-reset-integration.cjs')],
    { encoding: 'utf8', timeout: 135000 }
  )
  const actual = JSON.parse(result)
  expect(actual.close).toEqual({ code: 0, signal: null })
  expect(actual.rows).toHaveLength(3)
}, 140000)

it('supplies missing bare modules through actual shared factory namespaces', () => {
  const { execFileSync } = require('node:child_process')
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'virtual-bare-integration.cjs')],
    { encoding: 'utf8', timeout: 135000 }
  )
  const actual = JSON.parse(result)
  expect(actual.close).toEqual({ code: 0, signal: null })
  expect(actual.rows).toHaveLength(4)
}, 140000)

it('shares missing bare factory values through importMock and import namespaces', () => {
  const { execFileSync } = require('node:child_process')
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'virtual-import-integration.cjs')],
    { encoding: 'utf8', timeout: 135000 }
  )
  const actual = JSON.parse(result)
  expect(actual.close).toEqual({ code: 0, signal: null })
  expect(actual.rows).toHaveLength(3)
}, 140000)

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

it('supplies certified Node builtin factories through project ESM consumers', () => {
  const { execFileSync } = require('node:child_process')
  const result = execFileSync(
    process.execPath,
    [join(__dirname, 'builtin-factory-integration.cjs')],
    { encoding: 'utf8', timeout: 135000 }
  )
  const actual = JSON.parse(result)
  expect(actual.close).toEqual({ code: 0, signal: null })
  expect(actual.rows).toHaveLength(3)
}, 140000)

it('retains runtime window observations in actual development and production Node modules', async () => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'runtime-window-integration.cjs')],
    { timeout: 150000 }
  )
  expect(JSON.parse(stdout.trim())).toEqual({
    profiles: 2,
    cases: 4,
    fullRows: 4,
  })
}, 160000)

for (const [group, count] of [
  ['external', 3],
  ['external-control', 2],
  ['external-graph', 1],
  ['external-conditions', 1],
  ['external-actual', 3],
  ['unmock-after', 1],
  ['unmock-before', 1],
  ['unmock-only', 1],
  ['builtin-actual', 3],
  ['builtin-control', 2],
  ['compiled-builtin', 1],
  ['compiled-external', 1],
  ['builtin-unmock-after', 1],
  ['builtin-unmock-before', 1],
  ['builtin-unmock-only', 1],
  ['runtime-cjs', 6],
  ['runtime-esm', 6],
  ['runtime-builtin', 6],
  ['runtime-ownership', 1],
  ['runtime-ownership-no-reset', 1],
  ['compiled-runtime', 4],
  ['compiled-parallel-fast', 2],
  ['static-runtime-cjs-unused', 1],
  ['static-runtime-esm-unused', 1],
  ['static-runtime-builtin-unused', 1],
  ['static-runtime-cjs', 1],
  ['static-runtime-esm', 1],
  ['static-runtime-builtin', 1],
  ['static-runtime-cjs-failure', 1],
  ['static-runtime-cjs-pending-resolve', 1],
  ['static-runtime-cjs-pending-reject', 1],
  ['static-runtime-cjs-unmock-first', 1],
  ['static-runtime-esm-failure', 1],
  ['static-runtime-esm-pending-resolve', 1],
  ['static-runtime-esm-pending-reject', 1],
  ['static-runtime-esm-unmock-first', 1],
  ['static-runtime-builtin-failure', 1],
  ['static-runtime-builtin-pending-resolve', 1],
  ['static-runtime-builtin-pending-reject', 1],
  ['static-runtime-builtin-unmock-first', 1],
] as const) {
  it(`publishes owned native package artifacts for ${group}`, () => {
    const { execFileSync } = require('node:child_process')
    const result = execFileSync(
      process.execPath,
      [join(__dirname, 'external-package-integration.cjs'), group],
      { encoding: 'utf8', timeout: 135000 }
    )
    const actual = JSON.parse(result)
    expect(actual.close).toEqual({ code: 0, signal: null })
    expect(actual.rows).toHaveLength(count)
  }, 140000)
}

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

it('preserves complete compiled terminal-throw runtime factory rows', () => {
  const { execFileSync } = require('node:child_process')
  const actual = JSON.parse(
    execFileSync(
      process.execPath,
      [
        join(__dirname, 'external-package-integration.cjs'),
        'compiled-purethrow',
      ],
      { encoding: 'utf8', timeout: 135000 }
    )
  )
  expect(actual.close).toEqual({ code: 0, signal: null })
  expect(actual.rows).toHaveLength(4)
}, 140000)

for (const target of [
  'commonjs',
  'transitive',
  'then',
  'foreign',
  'unresolved',
  'query',
  'fallthrough',
] as const) {
  it(`retains terminal-throw runtime target certification before bodies: ${target}`, () => {
    const { execFileSync } = require('node:child_process')
    const actual = JSON.parse(
      execFileSync(
        process.execPath,
        [join(__dirname, 'runtime-throw-boundary-integration.cjs'), target],
        { encoding: 'utf8', timeout: 135000 }
      )
    )
    expect(actual.close).toEqual({ code: 1, signal: null })
    expect(actual.total).toBe(0)
    expect(actual.bodyOutput).toBe(false)
  }, 140000)
}

it('retains compiled ESM dependency and cycle runtime registration lifetimes', () => {
  const { execFileSync } = require('node:child_process')
  const actual = JSON.parse(
    execFileSync(
      process.execPath,
      [
        join(__dirname, 'external-package-integration.cjs'),
        'compiled-esm-graph',
      ],
      { encoding: 'utf8', timeout: 135000 }
    )
  )
  expect(actual.close).toEqual({ code: 0, signal: null })
  expect(actual.rows).toHaveLength(7)
}, 140000)

for (const target of [
  'commonjs',
  'then',
  'unresolved',
  'dynamic',
  'computed',
  'require',
  'query',
  'foreign',
  'entry-cycle',
  'helper',
  'symlink',
] as const) {
  it(`certifies actual compiled runtime graph boundaries before bodies: ${target}`, () => {
    const { execFileSync } = require('node:child_process')
    const actual = JSON.parse(
      execFileSync(
        process.execPath,
        [join(__dirname, 'runtime-graph-boundary-integration.cjs'), target],
        { encoding: 'utf8', timeout: 135000 }
      )
    )
    expect(actual.close).toEqual({ code: 1, signal: null })
    expect(actual.total).toBe(0)
    expect(actual.bodyOutput).toBe(false)
  }, 140000)
}

it('uses the configured actual resolver target in runtime ESM graph certificates', () => {
  const { execFileSync } = require('node:child_process')
  const actual = JSON.parse(
    execFileSync(
      process.execPath,
      [
        join(__dirname, 'external-package-integration.cjs'),
        'compiled-esm-graph-alias',
      ],
      { encoding: 'utf8', timeout: 135000 }
    )
  )
  expect(actual.close).toEqual({ code: 0, signal: null })
  expect(actual.rows).toHaveLength(1)
}, 140000)

for (const target of [
  'async-module',
  'native-alias',
  'framework-alias',
  'bare-dependency',
] as const) {
  it(`retains actual async/framework/native runtime graph boundaries: ${target}`, () => {
    const { execFileSync } = require('node:child_process')
    const actual = JSON.parse(
      execFileSync(
        process.execPath,
        [join(__dirname, 'runtime-graph-boundary-integration.cjs'), target],
        { encoding: 'utf8', timeout: 135000 }
      )
    )
    expect(actual.close).toEqual({ code: 1, signal: null })
    expect(actual.total).toBe(0)
    expect(actual.bodyOutput).toBe(false)
  }, 140000)
}

it('starts distinct declared runtime factories at actual original dependency demand', () => {
  const { execFileSync } = require('node:child_process')
  const actual = JSON.parse(
    execFileSync(
      process.execPath,
      [
        join(__dirname, 'runtime-graph-boundary-integration.cjs'),
        'cross-target',
      ],
      { encoding: 'utf8', timeout: 135000 }
    )
  )
  expect(actual.close).toEqual({ code: 0, signal: null })
  expect(actual.total).toBe(1)
  expect(actual.passed).toBe(1)
  expect(actual.bodyOutput).toBe(true)
}, 140000)

for (const [target, rows] of [
  ['compiled-cross-namespace-shadow', 1],
  ['compiled-cross-target', 12],
  ['compiled-cross-lifetime', 4],
  ['compiled-cross-namespace', 4],
  ['compiled-cross-namespace-cycle', 1],
  ['compiled-cross-namespace-reset', 1],
  ['compiled-cross-namespace-getter', 1],
  ['factory-cause-cjs', 1],
  ['factory-cause-esm', 1],
  ['factory-cause-builtin', 1],
  ['factory-cause-compiled', 1],
] as const) {
  it(`matches complete cross-target runtime and namespace reference rows: ${target}`, () => {
    const { execFileSync } = require('node:child_process')
    const actual = JSON.parse(
      execFileSync(
        process.execPath,
        [join(__dirname, 'external-package-integration.cjs'), target],
        { encoding: 'utf8', timeout: 135000 }
      )
    )
    expect(actual.close).toEqual({ code: 0, signal: null })
    expect(actual.rows).toHaveLength(rows)
  }, 140000)
}

it('preserves the same-directory foreign importer boundary for marked runtime demand graphs', () => {
  const { execFileSync } = require('node:child_process')
  const actual = JSON.parse(
    execFileSync(
      process.execPath,
      [
        join(__dirname, 'runtime-graph-boundary-integration.cjs'),
        'cross-foreign-literal',
      ],
      { encoding: 'utf8', timeout: 135000 }
    )
  )
  expect(actual.close).toEqual({ code: 1, signal: null })
  expect(actual.total).toBe(0)
  expect(actual.bodyOutput).toBe(false)
}, 140000)

for (const target of [
  'cjs-reset-dependency',
  'cjs-reset-direct-dependency',
  'cjs-reset-cycle',
  'cjs-reset-static-held-dependency',
  'cjs-reset-unused-dependency',
  'cjs-reset-unused-cycle',
  'cjs-reset-nonleaf-callable-plain',
  'cjs-reset-nonleaf-callable-cycle',
  'cjs-reset-nonleaf-callable-static',
  'cjs-reset-nonleaf-callable-unused',
  'cjs-reset-nonleaf-member-object',
  'cjs-reset-nonleaf-member-callable',
] as const) {
  it(`matches full nonleaf CommonJS namespace and require-lifetime reference rows: ${target}`, () => {
    const { execFileSync } = require('node:child_process')
    const actual = JSON.parse(
      execFileSync(
        process.execPath,
        [join(__dirname, 'external-package-integration.cjs'), target],
        { encoding: 'utf8', timeout: 135000 }
      )
    )
    expect(actual.close).toEqual({ code: 0, signal: null })
    expect(actual.rows).toHaveLength(1)
  }, 140000)
}

for (const target of [
  'cjs-reset-negative-unresolved',
  'cjs-reset-negative-external',
  'cjs-reset-negative-esm',
  'cjs-reset-negative-multiple',
  'cjs-reset-negative-foreign',
  'cjs-reset-negative-client-directive',
  'cjs-reset-negative-query',
  'cjs-reset-negative-multiple-resolved',
  'cjs-reset-export-promise',
  'cjs-reset-export-array',
  'cjs-reset-export-then',
  'cjs-reset-export-computed',
  'cjs-reset-export-spread',
  'cjs-reset-export-getter',
  'cjs-reset-export-prototype',
  'cjs-reset-export-repeated',
  'cjs-reset-export-escaped-callable',
  'cjs-reset-export-reassigned-callable',
  'cjs-reset-export-computed-callable',
  'cjs-reset-export-mixed-promise-leaf',
] as const) {
  it(`refuses an uncertified nonleaf CommonJS reset boundary before bodies: ${target}`, () => {
    const { execFileSync } = require('node:child_process')
    const actual = JSON.parse(
      execFileSync(
        process.execPath,
        [join(__dirname, 'runtime-graph-boundary-integration.cjs'), target],
        { encoding: 'utf8', timeout: 135000 }
      )
    )
    expect(actual.close).toEqual({ code: 1, signal: null })
    expect(actual.total).toBe(0)
    expect(actual.bodyOutput).toBe(false)
  }, 140000)
}

for (const [target, rows] of [
  ['compiled-native-order-before', 1],
  ['compiled-native-order-after', 1],
  ['compiled-native-namespace-before', 1],
  ['compiled-native-namespace-after', 1],
  ['compiled-native-cross-target', 13],
  ['compiled-native-cross-lifetime', 5],
] as const) {
  it(`preserves native import ordering and complete cross-target namespace/lifetime rows: ${target}`, () => {
    const { execFileSync } = require('node:child_process')
    const actual = JSON.parse(
      execFileSync(
        process.execPath,
        [join(__dirname, 'external-package-integration.cjs'), target],
        { encoding: 'utf8', timeout: 135000 }
      )
    )
    expect(actual.close).toEqual({ code: 0, signal: null })
    expect(actual.rows).toHaveLength(rows)
  }, 140000)
}

it('preserves foreign importer refusal for compiled demand graphs with certified native imports', () => {
  const { execFileSync } = require('node:child_process')
  const actual = JSON.parse(
    execFileSync(
      process.execPath,
      [
        join(__dirname, 'runtime-graph-boundary-integration.cjs'),
        'cross-native-foreign',
      ],
      { encoding: 'utf8', timeout: 135000 }
    )
  )
  expect(actual.close).toEqual({ code: 1, signal: null })
  expect(actual.total).toBe(0)
  expect(actual.bodyOutput).toBe(false)
}, 140000)

for (const [target, rows] of [
  ['cjs-reset-actual-dependency', 2],
  ['cjs-reset-actual-cycle', 2],
  ['cjs-reset-actual-nonleaf-callable-plain', 2],
  ['cjs-reset-actual-nonleaf-callable-cycle', 2],
  ['cjs-reset-actual-dependency-actual-only', 1],
  ['cjs-reset-actual-dependency-unused-only', 1],
  ['cjs-reset-actual-cycle-actual-only', 1],
  ['cjs-reset-actual-cycle-unused-only', 1],
  ['cjs-reset-actual-nonleaf-callable-plain-actual-only', 1],
  ['cjs-reset-actual-nonleaf-callable-plain-unused-only', 1],
  ['cjs-reset-actual-nonleaf-callable-cycle-actual-only', 1],
  ['cjs-reset-actual-nonleaf-callable-cycle-unused-only', 1],
  ['cjs-reset-actual-dependency-mutation', 1],
  ['cjs-reset-actual-cycle-mutation', 1],
  ['cjs-reset-actual-nonleaf-callable-plain-mutation', 1],
  ['cjs-reset-actual-nonleaf-callable-cycle-mutation', 1],
] as const) {
  it(`matches complete CommonJS actual/reset namespace and held require rows: ${target}`, () => {
    const { execFileSync } = require('node:child_process')
    const actual = JSON.parse(
      execFileSync(
        process.execPath,
        [join(__dirname, 'external-package-integration.cjs'), target],
        { encoding: 'utf8', timeout: 135000 }
      )
    )
    expect(actual.close).toEqual({ code: 0, signal: null })
    expect(actual.rows).toHaveLength(rows)
  }, 140000)
}

for (const target of [
  'cjs-actual-reset-negative-query',
  'cjs-actual-reset-negative-fragment',
  'cjs-actual-reset-negative-unresolved',
  'cjs-actual-reset-negative-esm',
  'cjs-actual-reset-negative-leaf',
  'cjs-actual-reset-negative-builtin',
  'cjs-actual-reset-negative-self',
  'cjs-actual-reset-negative-foreign',
  'cjs-actual-reset-negative-mixed-promise',
] as const) {
  it(`refuses an uncertified CommonJS actual/reset graph before bodies: ${target}`, () => {
    const { execFileSync } = require('node:child_process')
    const actual = JSON.parse(
      execFileSync(
        process.execPath,
        [join(__dirname, 'runtime-graph-boundary-integration.cjs'), target],
        { encoding: 'utf8', timeout: 135000 }
      )
    )
    expect(actual.close).toEqual({ code: 1, signal: null })
    expect(actual.total).toBe(0)
    expect(actual.bodyOutput).toBe(false)
  }, 140000)
}

for (const [target, rows] of [
  ['compiled-cjs-runtime-leaf-object', 8],
  ['compiled-cjs-runtime-leaf-callable', 8],
  ['compiled-cjs-runtime-dependency', 8],
  ['compiled-cjs-runtime-cycle', 8],
  ['compiled-cjs-runtime-nonleaf-callable-plain', 8],
  ['compiled-cjs-runtime-nonleaf-callable-cycle', 8],
  ['compiled-cjs-runtime-leaf-object-lifetimes', 4],
  ['compiled-cjs-runtime-leaf-callable-lifetimes', 4],
  ['compiled-cjs-runtime-dependency-lifetimes', 4],
  ['compiled-cjs-runtime-cycle-lifetimes', 4],
  ['compiled-cjs-runtime-nonleaf-callable-plain-lifetimes', 4],
  ['compiled-cjs-runtime-nonleaf-callable-cycle-lifetimes', 4],
  ['compiled-cjs-runtime-leaf-object-esmflag', 8],
  ['compiled-cjs-runtime-leaf-object-default', 8],
  ['compiled-cjs-runtime-leaf-callable-esmflag', 8],
] as const) {
  it(`matches complete compiled CommonJS runtime registration and held namespace rows: ${target}`, () => {
    const { execFileSync } = require('node:child_process')
    const actual = JSON.parse(
      execFileSync(
        process.execPath,
        [join(__dirname, 'external-package-integration.cjs'), target],
        { encoding: 'utf8', timeout: 135000 }
      )
    )
    expect(actual.close).toEqual({ code: 0, signal: null })
    expect(actual.rows).toHaveLength(rows)
  }, 140000)
}

for (const target of [
  'compiled-cjs-runtime-negative-query',
  'compiled-cjs-runtime-negative-fragment',
  'compiled-cjs-runtime-negative-unresolved',
  'compiled-cjs-runtime-negative-mixed-esm',
  'compiled-cjs-runtime-negative-mixed-native',
  'compiled-cjs-runtime-negative-self',
  'compiled-cjs-runtime-negative-foreign',
  'compiled-cjs-runtime-negative-promise',
  'compiled-cjs-runtime-negative-then',
  'compiled-cjs-runtime-negative-computed',
  'compiled-cjs-runtime-negative-spread',
  'compiled-cjs-runtime-negative-history',
  'compiled-cjs-runtime-negative-unresolved-require',
  'compiled-cjs-runtime-negative-multiple-require',
  'compiled-cjs-runtime-negative-dynamic-require',
  'compiled-cjs-runtime-negative-throw-only',
] as const) {
  it(`refuses an uncertified compiled CommonJS runtime entry before bodies: ${target}`, () => {
    const { execFileSync } = require('node:child_process')
    const actual = JSON.parse(
      execFileSync(
        process.execPath,
        [join(__dirname, 'runtime-graph-boundary-integration.cjs'), target],
        { encoding: 'utf8', timeout: 135000 }
      )
    )
    expect(actual.close).toEqual({ code: 1, signal: null })
    expect(actual.total).toBe(0)
    expect(actual.bodyOutput).toBe(false)
  }, 140000)
}

for (const [target, rows] of [
  ['runtime-registration-leaf-object-no-reset', 2],
  ['runtime-registration-leaf-callable-no-reset', 2],
  ['runtime-registration-dependency-no-reset', 2],
  ['runtime-registration-cycle-no-reset', 2],
  ['runtime-registration-nonleaf-callable-plain-no-reset', 2],
  ['runtime-registration-nonleaf-callable-cycle-no-reset', 2],
  ['runtime-registration-leaf-object-transitions-v2', 6],
  ['runtime-registration-dependency-transitions-v2', 6],
  ['runtime-registration-builtin-transitions', 6],
  ['runtime-registration-esm-demand-literal-v5', 1],
  ['runtime-registration-leaf-object-invalidation-v1', 2],
  ['runtime-registration-leaf-callable-invalidation-v1', 2],
  ['runtime-registration-dependency-invalidation-v1', 2],
  ['runtime-registration-esm-transitions-invalidation-v1', 2],
  ['runtime-registration-builtin-transitions-invalidation-v1', 2],
] as const) {
  it(`matches complete runtime registration cache and ownership observations: ${target}`, () => {
    const { execFileSync } = require('node:child_process')
    const actual = JSON.parse(
      execFileSync(
        process.execPath,
        [join(__dirname, 'external-package-integration.cjs'), target],
        { encoding: 'utf8', timeout: 135000 }
      )
    )
    expect(actual.close).toEqual({ code: 0, signal: null })
    expect(actual.rows).toHaveLength(rows)
  }, 140000)
}

for (const [target, rows] of [
  ['runtime-namespace-esm-transitions', 6],
  ['runtime-namespace-ordinary-values', 4],
  ['runtime-namespace-ordinary-hygiene', 2],
] as const) {
  it(`matches complete ordinary runtime ESM namespace observations: ${target}`, () => {
    const { execFileSync } = require('node:child_process')
    const actual = JSON.parse(
      execFileSync(
        process.execPath,
        [join(__dirname, 'external-package-integration.cjs'), target],
        { encoding: 'utf8', timeout: 135000 }
      )
    )
    expect(actual.close).toEqual({ code: 0, signal: null })
    expect(actual.rows).toHaveLength(rows)
  }, 140000)
}

it('matches complete compiled A pending original lifetime observations', () => {
  const { execFileSync } = require('node:child_process')
  const actual = JSON.parse(
    execFileSync(
      process.execPath,
      [
        join(__dirname, 'external-package-integration.cjs'),
        'runtime-namespace-compiled-pending-lifetimes',
      ],
      { encoding: 'utf8', timeout: 135000 }
    )
  )
  expect(actual.close).toEqual({ code: 0, signal: null })
  expect(actual.rows).toHaveLength(8)
}, 140000)

it('matches complete compiled A pending original loader failures', () => {
  const { execFileSync } = require('node:child_process')
  const actual = JSON.parse(
    execFileSync(
      process.execPath,
      [
        join(__dirname, 'external-package-integration.cjs'),
        'runtime-namespace-compiled-loader-error',
      ],
      { encoding: 'utf8', timeout: 135000 }
    )
  )
  expect(actual.close).toEqual({ code: 0, signal: null })
  expect(actual.rows).toHaveLength(2)
}, 140000)

it('retains complete ordinary TLA namespaces with a second unused runtime target', () => {
  const { execFileSync } = require('node:child_process')
  const actual = JSON.parse(
    execFileSync(
      process.execPath,
      [
        join(__dirname, 'external-package-integration.cjs'),
        'runtime-namespace-ordinary-tla',
      ],
      { encoding: 'utf8', timeout: 135000 }
    )
  )
  expect(actual.close).toEqual({ code: 0, signal: null })
  expect(actual.rows).toHaveLength(3)
}, 140000)

it('retains the complete ordinary importOriginal callback function shape', () => {
  const { execFileSync } = require('node:child_process')
  const actual = JSON.parse(
    execFileSync(
      process.execPath,
      [
        join(__dirname, 'external-package-integration.cjs'),
        'runtime-import-original-callback-shape',
      ],
      { encoding: 'utf8', timeout: 135000 }
    )
  )
  expect(actual.close).toEqual({ code: 0, signal: null })
  expect(actual.rows).toHaveLength(1)
}, 140000)

it('retains complete anonymous CommonJS function dependency-reset namespaces and lifetimes', () => {
  const { execFileSync } = require('node:child_process')
  const actual = JSON.parse(
    execFileSync(
      process.execPath,
      [
        join(__dirname, 'external-package-integration.cjs'),
        'cjs-function-expression-dependency-reset',
      ],
      { encoding: 'utf8', timeout: 135000 }
    )
  )
  expect(actual.close).toEqual({ code: 0, signal: null })
  expect(actual.rows).toHaveLength(3)
}, 140000)

it('retains complete anonymous CommonJS function cycle-reset namespaces and lifetimes', () => {
  const { execFileSync } = require('node:child_process')
  const actual = JSON.parse(
    execFileSync(
      process.execPath,
      [
        join(__dirname, 'external-package-integration.cjs'),
        'cjs-function-expression-cycle-reset',
      ],
      { encoding: 'utf8', timeout: 135000 }
    )
  )
  expect(actual.close).toEqual({ code: 0, signal: null })
  expect(actual.rows).toHaveLength(3)
}, 140000)

it('retains complete anonymous CommonJS function dependency-runtime namespaces and lifetimes', () => {
  const { execFileSync } = require('node:child_process')
  const actual = JSON.parse(
    execFileSync(
      process.execPath,
      [
        join(__dirname, 'external-package-integration.cjs'),
        'cjs-function-expression-dependency-runtime',
      ],
      { encoding: 'utf8', timeout: 135000 }
    )
  )
  expect(actual.close).toEqual({ code: 0, signal: null })
  expect(actual.rows).toHaveLength(3)
}, 140000)

it('retains complete anonymous CommonJS function cycle-runtime namespaces and lifetimes', () => {
  const { execFileSync } = require('node:child_process')
  const actual = JSON.parse(
    execFileSync(
      process.execPath,
      [
        join(__dirname, 'external-package-integration.cjs'),
        'cjs-function-expression-cycle-runtime',
      ],
      { encoding: 'utf8', timeout: 135000 }
    )
  )
  expect(actual.close).toEqual({ code: 0, signal: null })
  expect(actual.rows).toHaveLength(3)
}, 140000)

it('retains the complete ordinary static importOriginal callback function shape', () => {
  const { execFileSync } = require('node:child_process')
  const actual = JSON.parse(
    execFileSync(
      process.execPath,
      [
        join(__dirname, 'external-package-integration.cjs'),
        'static-import-original-callback-shape',
      ],
      { encoding: 'utf8', timeout: 135000 }
    )
  )
  expect(actual.close).toEqual({ code: 0, signal: null })
  expect(actual.rows).toHaveLength(1)
}, 140000)

it('retains complete ordinary callable CommonJS importMock key order and mock identities', () => {
  const { execFileSync } = require('node:child_process')
  const actual = JSON.parse(
    execFileSync(
      process.execPath,
      [
        join(__dirname, 'external-package-integration.cjs'),
        'cjs-import-mock-callable-order',
      ],
      { encoding: 'utf8', timeout: 135000 }
    )
  )
  expect(actual.close).toEqual({ code: 0, signal: null })
  expect(actual.rows).toHaveLength(7)
}, 140000)

it('retains complete certified async CommonJS importMock publication and lazy aliases', () => {
  const { execFileSync } = require('node:child_process')
  const actual = JSON.parse(
    execFileSync(
      process.execPath,
      [
        join(__dirname, 'external-package-integration.cjs'),
        'cjs-import-mock-certified-async',
      ],
      { encoding: 'utf8', timeout: 135000 }
    )
  )
  expect(actual.close).toEqual({ code: 0, signal: null })
  expect(actual.rows).toHaveLength(4)
}, 140000)

it('retains complete CommonJS callable publication before raw-member mutations', () => {
  const { execFileSync } = require('node:child_process')
  const actual = JSON.parse(
    execFileSync(
      process.execPath,
      [
        join(__dirname, 'external-package-integration.cjs'),
        'cjs-import-mock-publication-mutation',
      ],
      { encoding: 'utf8', timeout: 135000 }
    )
  )
  expect(actual.close).toEqual({ code: 0, signal: null })
  expect(actual.rows).toHaveLength(6)
}, 140000)

it('retains complete async callable publication before raw-member mutations', () => {
  const { execFileSync } = require('node:child_process')
  const actual = JSON.parse(
    execFileSync(
      process.execPath,
      [
        join(__dirname, 'external-package-integration.cjs'),
        'cjs-import-mock-async-publication-mutation',
      ],
      { encoding: 'utf8', timeout: 135000 }
    )
  )
  expect(actual.close).toEqual({ code: 0, signal: null })
  expect(actual.rows).toHaveLength(18)
}, 140000)

it('retains complete certified CommonJS publication namespace descriptors and held aliases', () => {
  const { execFileSync } = require('node:child_process')
  const actual = JSON.parse(
    execFileSync(
      process.execPath,
      [
        join(__dirname, 'external-package-integration.cjs'),
        'cjs-import-mock-publication-namespace',
      ],
      { encoding: 'utf8', timeout: 135000 }
    )
  )
  expect(actual.close).toEqual({ code: 0, signal: null })
  expect(actual.rows).toHaveLength(4)
}, 140000)

it('retains complete inherited CommonJS export-flag observations during automatic publication', () => {
  const { execFileSync } = require('node:child_process')
  const actual = JSON.parse(
    execFileSync(
      process.execPath,
      [
        join(__dirname, 'external-package-integration.cjs'),
        'cjs-import-mock-inherited-flag',
      ],
      { encoding: 'utf8', timeout: 135000 }
    )
  )
  expect(actual.close).toEqual({ code: 0, signal: null })
  expect(actual.rows).toHaveLength(2)
}, 140000)

it('retains complete callable CommonJS original strict receiver and raw descriptors', () => {
  const { execFileSync } = require('node:child_process')
  const actual = JSON.parse(
    execFileSync(
      process.execPath,
      [
        join(__dirname, 'external-package-integration.cjs'),
        'cjs-import-mock-strict-receiver',
      ],
      { encoding: 'utf8', timeout: 135000 }
    )
  )
  expect(actual.close).toEqual({ code: 0, signal: null })
  expect(actual.rows).toHaveLength(2)
}, 140000)

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

it('retains complete callable self-default publication and lazy alias identities', () => {
  const { execFileSync } = require('node:child_process')
  const actual = JSON.parse(
    execFileSync(
      process.execPath,
      [
        join(__dirname, 'external-package-integration.cjs'),
        'cjs-import-mock-self-default-publication',
      ],
      { encoding: 'utf8', timeout: 135000 }
    )
  )
  expect(actual.close).toEqual({ code: 0, signal: null })
  expect(actual.rows).toHaveLength(9)
}, 140000)

it('retains complete callable self-default inherited setter observations', () => {
  const { execFileSync } = require('node:child_process')
  const actual = JSON.parse(
    execFileSync(
      process.execPath,
      [
        join(__dirname, 'external-package-integration.cjs'),
        'cjs-import-mock-self-default-inherited',
      ],
      { encoding: 'utf8', timeout: 135000 }
    )
  )
  expect(actual.close).toEqual({ code: 0, signal: null })
  expect(actual.rows).toHaveLength(2)
}, 140000)

it.each([
  ['hidden-flag-body-definitions', 2],
  ['hidden-flag-callable', 9],
  ['hidden-flag-inherited', 2],
  ['hidden-flag-definition-observation', 2],
  ['hidden-flag-all-definitions', 2],
  ['hidden-flag-publication-proxy', 3],
])(
  'retains complete CommonJS %s publication behavior',
  (group, cases) => {
    const { execFileSync } = require('node:child_process')
    const actual = JSON.parse(
      execFileSync(
        process.execPath,
        [
          join(__dirname, 'external-package-integration.cjs'),
          `cjs-import-mock-${group}`,
        ],
        { encoding: 'utf8', timeout: 135000 }
      )
    )
    expect(actual.close).toEqual({ code: 0, signal: null })
    expect(actual.rows).toHaveLength(cases)
  },
  140000
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
