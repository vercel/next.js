import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { retry } from 'next-test-utils'
import {
  createApplicationServer,
  type ApplicationServer,
} from 'next/dist/experimental/testing/browser/server'

// Tests of real process supervision/IPC, using a small protocol fixture.
// The generated development suite validates actual Next compilation and locks.
describe('application-server lease lifetime', () => {
  let projectDir: string
  let outputDir: string
  let lease: ApplicationServer | undefined

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'next-server-lease-'))
    outputDir = join(projectDir, 'artifacts')
    const workerDir = join(projectDir, 'node_modules/next/dist/server/lib')
    await mkdir(workerDir, { recursive: true })
    await copyFile(
      join(__dirname, 'fixtures/start-server.cjs'),
      join(workerDir, 'start-server.js')
    )
    const cliDir = join(projectDir, 'node_modules/next/dist/cli')
    await mkdir(cliDir, { recursive: true })
    await copyFile(
      join(__dirname, 'fixtures/next-build.cjs'),
      join(cliDir, 'next-build.js')
    )
    await writeFile(join(projectDir, 'scenario'), 'ready')
    lease = undefined
  })

  afterEach(async () => {
    try {
      await lease?.dispose()
    } finally {
      await rm(projectDir, { recursive: true, force: true })
    }
  })

  function acquire(
    signal = new AbortController().signal,
    startupTimeoutMs = 5_000,
    mode: 'development' | 'production' = 'development'
  ) {
    return createApplicationServer({
      projectDir,
      outputDir,
      mode,
      distDir: mode === 'production' ? '.next' : undefined,
      outputLockEnabled: true,
      signal,
      startupTimeoutMs,
      shutdownGraceMs: 100,
    })
  }

  async function assertProcessesStopped() {
    for (const filename of ['server.pid', 'descendant.pid']) {
      const pid = Number(await readFile(join(projectDir, filename), 'utf8'))
      await retry(async () => {
        expect(() => process.kill(pid, 0)).toThrow()
      })
    }
  }

  it.each(['development', 'production'] as const)(
    'keeps the %s lease alive after run abort and disposes descendants',
    async (mode) => {
      const controller = new AbortController()
      lease = await acquire(controller.signal, 5_000, mode)
      controller.abort()
      expect(await (await fetch(lease.baseURL)).text()).toBe('ready')
      expect(lease.lifetime).toBe('file')
      const disposal = lease.dispose()
      expect(lease.dispose()).toBe(disposal)
      await disposal
      await assertProcessesStopped()
    }
  )

  it('rejects concurrent ownership and permits reacquisition after cleanup', async () => {
    lease = await acquire()
    await expect(acquire()).rejects.toThrow('already owns this project')
    await lease.dispose()
    lease = await acquire()
    expect(await (await fetch(lease.baseURL)).text()).toBe('ready')
  })

  it('reclaims descendants after startup exits before readiness', async () => {
    await writeFile(join(projectDir, 'scenario'), 'exit')
    await expect(acquire()).rejects.toThrow('exited unexpectedly (code 7')
    await assertProcessesStopped()
    await writeFile(join(projectDir, 'scenario'), 'ready')
    lease = await acquire()
  })

  it('bounds stalled acquisition and hard-kills an uncooperative server', async () => {
    await writeFile(join(projectDir, 'scenario'), 'hang')
    await expect(acquire(undefined, 1_000)).rejects.toThrow(
      'did not become ready within 1000ms'
    )
    await assertProcessesStopped()
  }, 10_000)

  it.each(['development', 'production'] as const)(
    'reports a %s server crash after readiness and reclaims its descendants',
    async (mode) => {
      const crashed = await acquire(undefined, 5_000, mode)
      try {
        await fetch(`${crashed.baseURL}/exit`)
        await assertProcessesStopped()
        await expect(crashed.dispose()).rejects.toThrow(
          'exited unexpectedly (code 9'
        )
      } finally {
        // This expected rejection is asserted above; teardown still runs if the
        // HTTP or process assertion failed first.
        await crashed.dispose().catch(() => {})
      }
    }
  )

  it.each(['shutdown-143', 'shutdown-signal', 'shutdown-hang'])(
    'accepts expected termination for %s and reclaims descendants',
    async (scenario) => {
      await writeFile(join(projectDir, 'scenario'), scenario)
      lease = await acquire()
      await lease.dispose()
      await assertProcessesStopped()
    },
    10_000
  )

  it.each([1, 9])(
    'retains shutdown failure code %s despite requested cancellation',
    async (code) => {
      await writeFile(join(projectDir, 'scenario'), `shutdown-error-${code}`)
      const failed = await acquire()
      try {
        await expect(failed.dispose()).rejects.toThrow(
          `exited unexpectedly (code ${code}`
        )
        await expect(failed.dispose()).rejects.toMatchObject({
          name: 'ApplicationServerError',
          attachments: failed.attachments,
          errors: [
            expect.objectContaining({
              message: expect.stringContaining(`code ${code}`),
            }),
          ],
        })
        await assertProcessesStopped()
        const logs = await Promise.all(
          failed.attachments.map((attachment) =>
            readFile(attachment.path, 'utf8')
          )
        )
        expect(logs.join('\n')).toContain('fixture shutdown failed')
      } finally {
        await failed.dispose().catch(() => {})
      }
      // A failed disposal still releases this coordinator's ownership guard.
      await writeFile(join(projectDir, 'scenario'), 'ready')
      lease = await acquire()
    },
    10_000
  )

  it('cancels in-progress acquisition and releases directory ownership', async () => {
    await writeFile(join(projectDir, 'scenario'), 'hang')
    const controller = new AbortController()
    const pending = acquire(controller.signal)
    // Observe the rejection immediately, before waiting for the child to boot.
    const outcome = pending.then(
      () => undefined,
      (error: unknown) => error
    )
    let error: unknown
    try {
      await retry(async () => {
        expect(
          Number(await readFile(join(projectDir, 'server.pid'), 'utf8'))
        ).toBeGreaterThan(0)
      })
    } finally {
      controller.abort(new Error('acquisition cancelled'))
      error = await outcome
    }
    expect(error).toMatchObject({
      message: expect.stringContaining('acquisition cancelled'),
    })
    await assertProcessesStopped()
    await writeFile(join(projectDir, 'scenario'), 'ready')
    lease = await acquire()
  })

  it('rejects missing production build metadata and disabled output locking before spawn', async () => {
    const options = {
      projectDir,
      outputDir,
      mode: 'development' as const,
      outputLockEnabled: true,
      signal: new AbortController().signal,
    }
    await expect(
      createApplicationServer({ ...options, mode: 'production' })
    ).rejects.toThrow('resolved distDir')
    await expect(
      createApplicationServer({ ...options, outputLockEnabled: false })
    ).rejects.toThrow('lockDistDir')
    await expect(
      readFile(join(projectDir, 'server.pid'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it.each(['ready', 'instrumented'])(
    'retains the production build owner until server disposal (%s)',
    async (scenario) => {
      await writeFile(join(projectDir, 'scenario'), scenario)
      lease = await createApplicationServer({
        projectDir,
        outputDir,
        mode: 'production',
        distDir: '.next',
        outputLockEnabled: true,
        signal: new AbortController().signal,
        startupTimeoutMs: 5_000,
        shutdownGraceMs: 100,
      })
      expect(lease.build).toMatchObject({
        buildId: 'protocol-build',
        testingApiEnabled: scenario === 'instrumented',
        manifests: { BUILD_ID: expect.stringMatching(/^[a-f0-9]{64}$/) },
      })
      const buildPid = Number(
        await readFile(join(projectDir, 'build.pid'), 'utf8')
      )
      expect(() => process.kill(buildPid, 0)).not.toThrow()
      expect(await (await fetch(lease.baseURL)).text()).toBe('ready')
      await lease.dispose()
      expect(() => process.kill(buildPid, 0)).toThrow()
      await assertProcessesStopped()
    }
  )

  it.each(['build-failure', 'build-hang'])(
    'reclaims an unsuccessful production build (%s)',
    async (scenario) => {
      await writeFile(join(projectDir, 'scenario'), scenario)
      await expect(
        createApplicationServer({
          projectDir,
          outputDir,
          mode: 'production',
          distDir: '.next',
          outputLockEnabled: true,
          signal: new AbortController().signal,
          startupTimeoutMs: 1_000,
          shutdownGraceMs: 100,
        })
      ).rejects.toThrow('Next application server failed')
      const buildPid = Number(
        await readFile(join(projectDir, 'build.pid'), 'utf8')
      )
      expect(() => process.kill(buildPid, 0)).toThrow()
      await expect(
        readFile(join(projectDir, 'server.pid'))
      ).rejects.toMatchObject({ code: 'ENOENT' })
    }
  )

  it('rejects a production server serving a different output than the locked build', async () => {
    await writeFile(join(projectDir, 'scenario'), 'wrong-output')
    await mkdir(join(projectDir, '.other'))
    await writeFile(join(projectDir, '.other/BUILD_ID'), 'stale-other-build')
    await expect(
      createApplicationServer({
        projectDir,
        outputDir,
        mode: 'production',
        distDir: '.next',
        outputLockEnabled: true,
        signal: new AbortController().signal,
        startupTimeoutMs: 5_000,
        shutdownGraceMs: 100,
      })
    ).rejects.toThrow('exited unexpectedly')
    await assertProcessesStopped()
    const buildPid = Number(
      await readFile(join(projectDir, 'build.pid'), 'utf8')
    )
    expect(() => process.kill(buildPid, 0)).toThrow()
  })

  it('prefixes the browser URL with actual readiness basePath while registration stays logical', async () => {
    await writeFile(join(projectDir, 'scenario'), 'base-path')
    lease = await createApplicationServer({
      projectDir,
      outputDir,
      mode: 'development',
      outputLockEnabled: true,
      browserFixtures: [
        {
          id: 'fixture',
          module: join(projectDir, 'fixture.tsx'),
          exportName: 'default',
        },
      ],
      signal: new AbortController().signal,
      startupTimeoutMs: 5_000,
    })
    expect(lease.componentHost).toEqual({
      routePrefix: expect.stringMatching(/^\/docs\/__next_testing_/),
      fixtureIds: ['fixture'],
    })
  })

  it('production component readiness binds compiled manifests and starts a fresh ordinary server', async () => {
    await writeFile(
      join(projectDir, 'scenario'),
      'production-fixture-base-path'
    )
    await writeFile(
      join(projectDir, 'fixture.tsx'),
      'export default function Fixture() { return null }'
    )
    const fixture = {
      id: 'fixture',
      module: join(projectDir, 'fixture.tsx'),
      exportName: 'default',
    }
    lease = await createApplicationServer({
      projectDir,
      outputDir,
      mode: 'production',
      distDir: '.next',
      outputLockEnabled: true,
      browserFixtures: [fixture],
      signal: new AbortController().signal,
      startupTimeoutMs: 5000,
      shutdownGraceMs: 100,
    })
    expect(lease.componentHost).toEqual({
      routePrefix: expect.stringMatching(/^\/docs\/__next_testing_/),
      fixtureIds: ['fixture'],
    })
    expect(Object.keys(lease.build!.manifests)).toEqual(
      expect.arrayContaining([
        'server/app-paths-manifest.json',
        'app-path-routes-manifest.json',
      ])
    )
    expect(
      Object.keys(lease.build!.manifests).filter((file) =>
        file.endsWith('.js.nft.json')
      )
    ).toHaveLength(1)
    expect(
      JSON.parse(
        await readFile(
          join(projectDir, 'compiled-fixture-registration.json'),
          'utf8'
        )
      ).fixtures
    ).toEqual([fixture])
    await lease.dispose()
    await assertProcessesStopped()
  })

  it.each(['fixture-missing-manifest', 'fixture-wrong-route'])(
    'rejects incomplete production component emission %s and releases the build owner',
    async (scenario) => {
      await writeFile(join(projectDir, 'scenario'), scenario)
      await expect(
        createApplicationServer({
          projectDir,
          outputDir,
          mode: 'production',
          distDir: '.next',
          outputLockEnabled: true,
          browserFixtures: [
            {
              id: 'fixture',
              module: join(projectDir, 'fixture.tsx'),
              exportName: 'default',
            },
          ],
          signal: new AbortController().signal,
          startupTimeoutMs: 5000,
          shutdownGraceMs: 100,
        })
      ).rejects.toThrow('application server failed')
      const pid = Number(await readFile(join(projectDir, 'build.pid'), 'utf8'))
      expect(() => process.kill(pid, 0)).toThrow()
    }
  )
})

// Transport controls exercise parent infrastructure, independently of the native
// client-compilation acceptance gate.
describe('Browser Mode immutable parent transport', () => {
  const { createHash } = require('node:crypto')
  const { symlink, realpath } = require('node:fs/promises')
  const {
    createClientServer,
  } = require('next/dist/experimental/testing/client/server')
  const {
    createClientAssetReader,
  } = require('next/dist/experimental/testing/client/assets')
  const {
    createClientSnapshotAccess,
  } = require('next/dist/experimental/testing/client/snapshot-access')
  const {
    createClientResultCollector,
  } = require('next/dist/experimental/testing/client/results')
  const {
    readClientDescriptor,
  } = require('next/dist/experimental/testing/compiler/client')
  let root: string
  let server: Awaited<ReturnType<typeof createClientServer>> | undefined
  let artifact: any
  let configuration: any
  const hash = (text: string) => createHash('sha256').update(text).digest('hex')
  beforeEach(async () => {
    root = await realpath(
      await mkdtemp(join(tmpdir(), 'next-client-transport-'))
    )
    const file = join(root, 'contract.case.mjs'),
      output = join(root, 'output')
    await mkdir(join(output, 'static'), { recursive: true })
    await writeFile(file, 'export const original = 42')
    await writeFile(
      join(output, 'static/entry.js'),
      'globalThis.infrastructure = true'
    )
    artifact = {
      version: 2,
      kind: 'browser',
      entryId: 'entry',
      revision: 'revision',
      sourceHash: hash('export const original = 42'),
      profile: {
        id: 'client',
        environment: 'browser',
        mode: 'development',
        browserClient: true,
      },
      rootDir: output,
      entryPath: 'descriptor.json',
      files: ['static/entry.js'],
      diagnostics: [],
      client: {
        version: 1,
        sourceFile: file,
        scripts: ['static/entry.js'],
        styles: [],
        outputs: [
          {
            path: 'static/entry.js',
            sha256: hash('globalThis.infrastructure = true'),
          },
        ],
      },
    }
    configuration = {
      version: 1,
      runId: 'run',
      entryId: 'entry',
      revision: 'revision',
      ownerToken: 'immutable-owner',
      filePath: file,
      sourceHash: artifact.sourceHash,
      projectDir: root,
      snapshotUpdateMode: 'none',
      testTimeout: 1000,
      hookTimeout: 1000,
    }
  })
  afterEach(async () => {
    try {
      await server?.dispose()
    } finally {
      await rm(root, { recursive: true, force: true })
      server = undefined
    }
  })
  async function open(onMessage = () => {}) {
    server = await createClientServer({
      artifact,
      configuration,
      onMessage,
      onFailure: () => {},
    })
    const document = await fetch(server.url)
    const cookie = document.headers.get('set-cookie')!.split(';')[0]
    const config = await fetch(new URL('config', server.url), {
      headers: { Cookie: cookie },
    }).then((res) => res.json())
    const post = (payload: any, headers: Record<string, string> = {}) =>
      fetch(config.rpcURL, {
        method: 'POST',
        headers: {
          Cookie: cookie,
          Origin: new URL(server!.url).origin,
          Authorization: config.authorization,
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({ ...configuration, sequence: 0, ...payload }),
      })
    return { cookie, config, post }
  }
  it('serves only exact compiler-issued assets after the page capability is acquired', async () => {
    const { cookie } = await open()
    const origin = new URL(server!.url).origin
    expect(
      (
        await fetch(origin + '/static/entry.js', {
          headers: { Cookie: cookie },
        })
      ).status
    ).toBe(404)
    expect((await fetch(origin + '/_next/static/entry.js')).status).toBe(404)
    expect(
      (
        await fetch(origin + '/_next/static/missing.js', {
          headers: { Cookie: cookie },
        })
      ).status
    ).toBe(404)
    expect(
      await fetch(origin + '/_next/static/entry.js', {
        headers: { Cookie: cookie },
      }).then((res) => res.text())
    ).toBe('globalThis.infrastructure = true')
  })
  it.each(['authorization', 'owner', 'sequence', 'method', 'source'])(
    'rejects mismatched %s before accepting owner facts',
    async (mode) => {
      const { post } = await open()
      if (mode === 'source') await writeFile(configuration.filePath, 'changed')
      const response = await post(
        {
          type: mode === 'method' ? 'unknown' : 'complete',
          status: 'passed',
          interrupted: false,
          caseCount: 1,
          updates: [],
          ...(mode === 'owner' ? { ownerToken: 'other' } : {}),
          ...(mode === 'sequence' ? { sequence: 1 } : {}),
        },
        mode === 'authorization' ? { Authorization: 'Bearer other' } : {}
      )
      expect(response.status).toBe(400)
      expect(() => server!.assertClean()).toThrow()
    }
  )
  it('rejects duplicate terminal output and verifies every emitted output before completion', async () => {
    const { post } = await open()
    const complete = {
      type: 'complete',
      status: 'passed',
      interrupted: false,
      caseCount: 1,
      updates: [],
    }
    expect((await post(complete)).status).toBe(200)
    await server!.completion
    expect((await post({ ...complete, sequence: 1 })).status).toBe(400)
    expect(() => server!.assertClean()).toThrow(/after completion/)
  })
  it('vetoes source and output mutations at the final read', async () => {
    const { post } = await open()
    await writeFile(join(artifact.rootDir, 'static/entry.js'), 'mutated output')
    expect(
      (
        await post({
          type: 'complete',
          status: 'passed',
          interrupted: false,
          caseCount: 1,
          updates: [],
        })
      ).status
    ).toBe(400)
    await expect(createClientAssetReader(artifact)).rejects.toThrow(/changed/)
  })
  it('keeps snapshot reads inside the selected source and managed regular file', async () => {
    const snapshots = await createClientSnapshotAccess(
      configuration.filePath,
      artifact.sourceHash
    )
    expect(
      await snapshots.request('resolvePath', [configuration.filePath])
    ).toBe(join(root, '__snapshots__/contract.case.mjs.snap'))
    expect(
      await snapshots.request('readSnapshotFile', [
        join(root, '__snapshots__/contract.case.mjs.snap'),
      ])
    ).toBeNull()
    await expect(
      snapshots.request('readSnapshotFile', [join(root, 'outside')])
    ).rejects.toThrow(/escaped/)
    await expect(
      snapshots.request('resolveRawPath', [configuration.filePath, 'raw.txt'])
    ).rejects.toThrow(/unsupported/)
    await mkdir(join(root, 'elsewhere'))
    await symlink(join(root, 'elsewhere'), join(root, '__snapshots__'))
    await expect(
      snapshots.request('resolvePath', [configuration.filePath])
    ).rejects.toThrow(/symbolic link/)
  })
  it('requires actual native descriptor membership and bootstrap types', async () => {
    await mkdir(join(artifact.rootDir, 'server/next-test'), { recursive: true })
    const path = 'server/next-test/entry.client.json',
      files = [...artifact.files, path]
    await writeFile(
      join(artifact.rootDir, path),
      JSON.stringify({ version: 1, scripts: ['static/entry.js'], styles: [] })
    )
    await expect(
      readClientDescriptor(artifact.rootDir, path, files, 'entry')
    ).resolves.toEqual({ version: 1, scripts: ['static/entry.js'], styles: [] })
    await writeFile(
      join(artifact.rootDir, path),
      JSON.stringify({ version: 1, scripts: ['../escape.js'], styles: [] })
    )
    await expect(
      readClientDescriptor(artifact.rootDir, path, files, 'entry')
    ).rejects.toThrow()
  })
  it('binds one actual result to its started attempt and refuses fabricated passes', () => {
    const options = { runId: 'run', updateSnapshots: false }
    const collector = createClientResultCollector(artifact, options)
    expect(() =>
      collector.accept({
        type: 'complete',
        status: 'passed',
        interrupted: false,
        caseCount: 0,
        updates: [],
      })
    ).toThrow(/omitted/)
    collector.accept({
      type: 'case-start',
      context: {
        fileId: 'entry',
        id: 'run/entry/0/0/0',
        testId: 'entry/0',
        name: 'original',
        retry: 0,
        repeat: 0,
      },
    })
    const result = {
      entryId: 'entry',
      caseId: 'entry/0',
      name: 'original',
      attempt: { id: 'other', retry: 0, repeat: 0 },
      status: 'passed',
      durationMs: 1,
      errors: [],
    }
    expect(() => collector.accept({ type: 'case-end', result })).toThrow(
      /immutable attempt/
    )
    result.attempt.id = 'run/entry/0/0/0'
    collector.accept({ type: 'case-end', result })
    collector.accept({
      type: 'complete',
      status: 'passed',
      interrupted: false,
      caseCount: 1,
      updates: [],
    })
    expect(collector.result().status).toBe('passed')
    collector.fail(new Error('late failure'))
    expect(collector.result()).toMatchObject({ status: 'failed', updates: [] })
  })
  it('keeps explicit client admission separate from ordinary browser drivers', () => {
    const {
      parseTestConfig,
      normalizeTestConfig,
    } = require('next/dist/experimental/testing/config')
    expect(
      parseTestConfig({
        projects: [{ name: 'driver', environment: 'browser' }],
      }).projects[0].profile.browserClient
    ).toBeUndefined()
    expect(
      parseTestConfig({
        projects: [
          {
            name: 'disabled',
            environment: 'browser',
            browser: { enabled: false },
          },
        ],
      }).projects[0].profile.browserClient
    ).toBeUndefined()
    expect(
      normalizeTestConfig({ test: { browser: { enabled: true } } }).projects[0]
        .profile
    ).toMatchObject({
      environment: 'browser',
      browserClient: true,
      mode: 'development',
    })
    for (const extra of [
      { mode: 'production' },
      { route: '/x' },
      { isolate: false },
      { includeSource: ['**/*.js'] },
      { browserFixtures: [] },
    ])
      expect(() =>
        parseTestConfig({
          projects: [{ name: 'client', browser: { enabled: true }, ...extra }],
        })
      ).toThrow()
  })
  it('closes actual active HTTP sockets before releasing its server owner', async () => {
    const { connect } = require('node:net')
    await open()
    const address = new URL(server!.url)
    const socket = connect(Number(address.port), '127.0.0.1')
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve)
      socket.once('error', reject)
    })
    let closed = false
    const stopped = new Promise<void>((resolve) =>
      socket.once('close', () => {
        closed = true
        resolve()
      })
    )
    socket.write(
      'POST ' +
        address.pathname +
        'rpc HTTP/1.1\r\nHost: ' +
        address.host +
        '\r\nContent-Length: 1000000\r\n\r\n'
    )
    await server!.dispose()
    await stopped
    expect(closed).toBe(true)
  })
  it('maps only exact emitted browser URLs and the pinned origin-stripped pathname', () => {
    const { SourceMapGenerator } = require('next/dist/compiled/source-map')
    const {
      createClientSourceMapResolver,
    } = require('next/dist/experimental/testing/client/source-maps')
    const map = new SourceMapGenerator({ file: 'entry.js' })
    map.addMapping({
      generated: { line: 10, column: 4 },
      original: { line: 2, column: 3 },
      source: 'original',
    })
    map.setSourceContent('original', 'same compiler source')
    const mapper = createClientSourceMapResolver({
      filePath: configuration.filePath,
      sourceMaps: [
        {
          url: 'http://127.0.0.1:1234/_next/entry.js',
          map: map.toJSON(),
          originalSources: ['original'],
        },
      ],
    })
    for (const file of [
      'http://127.0.0.1:1234/_next/entry.js',
      '/_next/entry.js',
    ])
      expect(mapper.mapLocation({ file, line: 10, column: 5 })).toMatchObject({
        file: configuration.filePath,
        line: 2,
        column: 4,
      })
    expect(() =>
      mapper.mapLocation({
        file: 'http://127.0.0.1:1235/_next/entry.js',
        line: 10,
        column: 5,
      })
    ).toThrow()
    expect(() =>
      mapper.mapLocation({ file: '/_next/other.js', line: 10, column: 5 })
    ).toThrow()
  })
  it('revalidates original source after clean HTTP owner disposal', async () => {
    const { post } = await open()
    expect(
      (
        await post({
          type: 'complete',
          status: 'passed',
          interrupted: false,
          caseCount: 1,
          updates: [],
        })
      ).status
    ).toBe(200)
    await server!.completion
    await server!.dispose()
    await writeFile(configuration.filePath, 'edited during owner cleanup')
    await expect(server!.verify()).rejects.toThrow(/changed/)
  })
  it.each(['file', 'case', 'attempt'])(
    'rejects a %s identity borrowed from another owner',
    (mode) => {
      const collector = createClientResultCollector(artifact, { runId: 'run' })
      const context = {
        fileId: 'entry',
        id: 'run/entry/0/0/0',
        testId: 'entry/0',
        name: 'actual',
        retry: 0,
        repeat: 0,
      }
      if (mode === 'file') context.fileId = 'other'
      if (mode === 'case') context.testId = 'other/0'
      if (mode === 'attempt') context.id = 'another-run/entry/0/0/0'
      expect(() => collector.accept({ type: 'case-start', context })).toThrow(
        /owner/
      )
    }
  )
  it('awaits in-flight parent RPC work and closes connections arriving during disposal', async () => {
    const { connect } = require('node:net')
    let enter!: () => void,
      release!: () => void,
      finished = false,
      disposed = false
    const entered = new Promise<void>((resolve) => {
      enter = resolve
    })
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const { post } = await open(async () => {
      enter()
      await blocked
      finished = true
    })
    const request = post({
      type: 'complete',
      status: 'passed',
      interrupted: false,
      caseCount: 1,
      updates: [],
    }).catch(() => undefined)
    await entered
    const disposal = server!.dispose().then(() => {
      disposed = true
    })
    try {
      await request
      const address = new URL(server!.url)
      await Promise.all(
        Array.from(
          { length: 32 },
          () =>
            new Promise<void>((resolve) => {
              const socket = connect(Number(address.port), '127.0.0.1')
              socket.on('error', () => {})
              socket.once('close', resolve)
            })
        )
      )
      expect(disposed).toBe(false)
      expect(finished).toBe(false)
    } finally {
      release()
      await disposal
    }
    expect(finished).toBe(true)
    expect(disposed).toBe(true)
  })
  it.each(['case', 'suite'])(
    'keeps the parent event discriminator for malformed %s wire facts',
    (kind) => {
      const collector = createClientResultCollector(artifact, { runId: 'run' })
      const common = {
        type: 'run-end',
        entryId: 'entry',
        name: 'actual',
        status: 'passed',
        durationMs: 0,
        errors: [],
      }
      if (kind === 'case') {
        collector.accept({
          type: 'case-start',
          context: {
            id: 'run/entry/0/0/0',
            fileId: 'entry',
            testId: 'entry/0',
            name: 'actual',
            retry: 0,
            repeat: 0,
          },
        })
        collector.accept({
          type: 'case-end',
          result: {
            ...common,
            caseId: 'entry/0',
            attempt: { id: 'run/entry/0/0/0', retry: 0, repeat: 0 },
          },
        })
      } else
        collector.accept({
          type: 'suite-end',
          result: { ...common, suiteId: 'entry', ancestors: [], mode: 'run' },
        })
      expect(collector.events.at(-1).type).toBe(kind + '-end')
      expect(
        collector.events.some((event: any) => event.type === 'run-end')
      ).toBe(false)
    }
  )
  it.each(['raw.txt', 'other.case.mjs', '__snapshots__/other.snap'])(
    'rejects an unsolicited snapshot update to %s before staging',
    (name) => {
      const collector = createClientResultCollector(artifact, {
        runId: 'run',
        updateSnapshots: true,
      })
      collector.accept({
        type: 'case-start',
        context: {
          id: 'run/entry/0/0/0',
          fileId: 'entry',
          testId: 'entry/0',
          name: 'actual',
          retry: 0,
          repeat: 0,
        },
      })
      collector.accept({
        type: 'case-end',
        result: {
          entryId: 'entry',
          caseId: 'entry/0',
          name: 'actual',
          attempt: { id: 'run/entry/0/0/0', retry: 0, repeat: 0 },
          status: 'passed',
          durationMs: 0,
          errors: [],
        },
      })
      expect(() =>
        collector.accept({
          type: 'complete',
          status: 'passed',
          interrupted: false,
          caseCount: 1,
          updates: [
            {
              path: join(root, name),
              content: 'forged',
              previousContent: null,
            },
          ],
        })
      ).toThrow(/snapshot update/)
    }
  )
  it('revalidates managed snapshot directory after the last RPC and owner disposal', async () => {
    const { post } = await open()
    expect(
      (
        await post({
          type: 'snapshot',
          method: 'resolvePath',
          args: [configuration.filePath],
        })
      ).status
    ).toBe(200)
    await server!.dispose()
    await mkdir(join(root, 'elsewhere'))
    await symlink(join(root, 'elsewhere'), join(root, '__snapshots__'))
    await expect(server!.verify()).rejects.toThrow(/symbolic link/)
  })
})
