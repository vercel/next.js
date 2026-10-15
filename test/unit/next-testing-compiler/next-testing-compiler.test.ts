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
    distDir: '.next/dev',
    cacheComponents: mockCacheComponents,
    cacheMaxMemorySize: 123456,
    cacheHandlers: { default: undefined },
    cacheLife: { default: { stale: 300, revalidate: 900, expire: 3600 } },
    staticPageGenerationTimeout: 60,
    assetPrefix: '/assets',
    deploymentId: 'test-deployment',
    experimental: {
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
