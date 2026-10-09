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

jest.mock('next/dist/build/swc', () => ({
  loadBindings: async () => ({ isWasm: false }),
}))
jest.mock('next/dist/build/swc/dev-project', () => ({
  createDevTurbopackProject: jest.fn(),
}))
jest.mock('next/dist/server/config', () => ({
  __esModule: true,
  default: async () => ({
    distDir: '.next/dev',
    cacheComponents: true,
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
  let linkOutput: boolean
  let beforeEmit: () => Promise<void>
  const shutdown = jest.fn(async () => {})
  const previousNodeEnv = process.env.NODE_ENV

  beforeEach(async () => {
    process.env = { ...process.env, NODE_ENV: 'development' }
    dir = await mkdtemp(join(tmpdir(), 'next-test-publication-'))
    outputText = 'first revision'
    failCompilation = false
    mockMetadata = undefined
    linkOutput = false
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
            }: {
              id: string
              environment: string
            }) => ({
              writeToDiskSnapshot: async (directory: string) => {
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
                  type: 'nodejs',
                  entryPath,
                  serverPaths: paths
                    .filter((path) => !path.startsWith('static/'))
                    .map((path) => ({ path, contentHash: 'native-hash' })),
                  clientPaths:
                    environment === 'rsc' ? ['static/client.js'] : [],
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
    expect(await readdir(join(dir, '.next'))).toEqual([])
  })

  it('does not publish compilation failures', async () => {
    session = await createTestCompilerSession(dir, profile)
    failCompilation = true
    await expect(
      session.compile(entry(), { signal: new AbortController().signal })
    ).rejects.toThrow('Invalid server-only boundary')
    expect(await readdir(join(dir, '.next'))).toEqual([])
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
    expect(await readdir(join(dir, '.next'))).toEqual([])
    expect(shutdown).toHaveBeenCalledTimes(1)
  })

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

  it.each([
    ['node', 2],
    ['rsc', 1],
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
      expect(await readdir(join(dir, '.next'))).toEqual([])
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

  it('rejects a production profile in a development compiler process', async () => {
    await expect(
      createTestCompilerSession(dir, { ...profile, mode: 'production' })
    ).rejects.toThrow('requires NODE_ENV=production')
    expect(createDevTurbopackProject).not.toHaveBeenCalled()
  })
})
