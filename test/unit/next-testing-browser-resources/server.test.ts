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
  function collected(collector: any, name = 'actual', mode = 'run') {
    collector.accept({
      type: 'collected',
      declarations: [
        { type: 'suite', id: 'entry', parentId: null, name: '', mode: 'run' },
        { type: 'test', id: 'entry/0', parentId: 'entry', name, mode },
      ],
    })
  }
  function rootSuite(
    collector: any,
    status = 'passed',
    errors: any[] = [],
    blockedDescendants = false
  ) {
    collector.accept({
      type: 'suite-end',
      result: {
        entryId: 'entry',
        suiteId: 'entry',
        name: '',
        ancestors: [],
        mode: 'run',
        blockedDescendants,
        status,
        durationMs: 0,
        errors,
      },
    })
  }
  function startCase(collector: any, id = 'entry/0', name = 'actual') {
    collector.accept({
      type: 'case-start',
      context: {
        fileId: 'entry',
        id: `run/${id}/0/0`,
        testId: id,
        name,
        retry: 0,
        repeat: 0,
      },
    })
  }
  function endCase(
    collector: any,
    id = 'entry/0',
    name = 'actual',
    extra = {}
  ) {
    collector.accept({
      type: 'case-end',
      result: {
        entryId: 'entry',
        caseId: id,
        name,
        attempt: { id: `run/${id}/0/0`, retry: 0, repeat: 0 },
        status: 'passed',
        mode: 'run',
        durationMs: 0,
        errors: [],
        ...extra,
      },
    })
  }
  function finish(collector: any, caseCount = 1, extra = {}) {
    collector.accept({
      type: 'complete',
      status: 'passed',
      interrupted: false,
      caseCount,
      updates: [],
      ...extra,
    })
  }
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
        asyncScope: 'promise-continuations-v1',
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
  async function open(
    onMessage: (message: any) => void | Promise<void> = () => {},
    onBrowserCommand?: (command: any) => Promise<unknown>
  ) {
    server = await createClientServer({
      artifact,
      configuration,
      onMessage,
      onBrowserCommand,
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
  async function openControl(
    signal: AbortSignal,
    onBrowserCommand?: (command: any, admit: () => void) => Promise<unknown>
  ) {
    server = await createClientServer({
      artifact,
      configuration: { ...configuration, userCancellation: true },
      userCancelSignal: signal,
      onMessage() {},
      onBrowserCommand,
      onFailure() {},
    })
    const document = await fetch(server.url)
    const cookie = document.headers.get('set-cookie')!.split(';')[0]
    const config = await fetch(new URL('config', server.url), {
      headers: { Cookie: cookie },
    }).then((response) => response.json())
    const headers = {
      Cookie: cookie,
      Origin: new URL(server.url).origin,
      Authorization: config.authorization,
      'Content-Type': 'application/json',
    }
    const identity = {
      version: configuration.version,
      runId: configuration.runId,
      entryId: configuration.entryId,
      revision: configuration.revision,
      ownerToken: configuration.ownerToken,
    }
    return {
      post: (message: any) =>
        fetch(config.rpcURL + '/user-cancellation', {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...identity, ...message }),
        }),
      rpc: (message: any) =>
        fetch(config.rpcURL, {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...identity, sequence: 0, ...message }),
        }),
    }
  }
  it.each([false, true])(
    'admits and joins actual scheduling delivery (alreadyAborted=%s)',
    async (alreadyAborted) => {
      const controller = new AbortController()
      if (alreadyAborted) controller.abort()
      const { post } = await openControl(controller.signal)
      const response = await post({ type: 'wait' })
      expect(server!.userCancellationFinalized()).toBe(false)
      controller.abort()
      expect(await response.json()).toEqual({ cancelled: true })
      expect(
        await (await post({ type: 'close', delivered: true })).json()
      ).toEqual({ cancelled: true })
      expect(server!.userCancellationFinalized()).toBe(true)
    }
  )
  it.each([false, true])(
    'never finalizes a clean or unacknowledged scheduling close (replyWasTrue=%s)',
    async (replyWasTrue) => {
      const controller = new AbortController()
      const { post } = await openControl(controller.signal)
      const response = await post({ type: 'wait' })
      if (replyWasTrue) controller.abort()
      const closing = post({ type: 'close', delivered: false })
      expect(await response.json()).toEqual({ cancelled: replyWasTrue })
      expect(await (await closing).json()).toEqual({ cancelled: false })
      controller.abort()
      expect(server!.userCancellationFinalized()).toBe(false)
    }
  )
  it('joins pending scheduling transport before server disposal completes', async () => {
    const controller = new AbortController()
    const { post } = await openControl(controller.signal)
    const response = await post({ type: 'wait' })
    const pending = response.json().catch(() => undefined)
    const disposal = server!.dispose()
    expect(server!.dispose()).toBe(disposal)
    await disposal
    await pending
    controller.abort()
    expect(server!.userCancellationFinalized()).toBe(false)
  })
  it.each(['duplicate wait', 'forged delivery', 'foreign close', 'extra keys'])(
    'retains a malformed scheduling %s as a transport failure',
    async (kind) => {
      const { post } = await openControl(new AbortController().signal)
      const response = await post({ type: 'wait' })
      const pending = response.json().catch(() => undefined)
      const invalid =
        kind === 'duplicate wait'
          ? { type: 'wait' }
          : kind === 'forged delivery'
            ? { type: 'close', delivered: true }
            : kind === 'foreign close'
              ? { type: 'close', delivered: false, ownerToken: 'foreign' }
              : { type: 'close', delivered: false, extra: true }
      try {
        expect((await post(invalid)).status).toBe(400)
        await expect(server!.completion).rejects.toThrow(
          /scheduling control|identity mismatch/
        )
        expect(server!.userCancellationFinalized()).toBe(false)
      } finally {
        await server!.dispose()
        await pending
      }
    }
  )
  it('delivers scheduling control independently of an admitted native action', async () => {
    const controller = new AbortController()
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const { post, rpc } = await openControl(
      controller.signal,
      async (_command, admit) => {
        admit()
        await held
        return 'actual native result'
      }
    )
    const waiting = await post({ type: 'wait' })
    const native = await rpc({
      type: 'browser-command',
      command: { method: 'click', element: 'button', args: [] },
    })
    try {
      controller.abort()
      expect(await waiting.json()).toEqual({ cancelled: true })
      expect(
        await (await post({ type: 'close', delivered: true })).json()
      ).toEqual({ cancelled: true })
      expect(server!.userCancellationFinalized()).toBe(true)
    } finally {
      release()
    }
    expect(await native.json()).toEqual({ value: 'actual native result' })
  })
  it.each(['passed', 'failed'])(
    'retains private fulfilled module metadata for an actual %s Browser result',
    (status) => {
      const collector = createClientResultCollector(artifact, {
        runId: 'run',
        captureCompletedModuleResult: true,
      })
      const completion = {
        version: 1,
        runId: 'run',
        entryId: artifact.entryId,
        revision: artifact.revision,
        kind: 'fulfilled',
        resultVersion: 2,
        finalState: status === 'failed' ? 'fail' : 'pass',
        durationMs: 7,
        containsOnly: false,
        interrupted: false,
      }
      collected(collector)
      startCase(collector)
      endCase(collector, undefined, undefined, {
        status,
        errors:
          status === 'failed'
            ? [{ phase: 'test', error: { message: 'actual case failure' } }]
            : [],
      })
      rootSuite(collector, status)
      finish(collector, 1, { status, moduleCompletion: completion })
      expect(collector.result().moduleCompletion).toEqual(completion)
      expect(collector.result().status).toBe(status)
      expect(
        collector.events.every(
          (event) =>
            !('moduleCompletion' in event) && !('moduleExecution' in event)
        )
      ).toBe(true)
    }
  )
  it.each([undefined, 1, 'passed', 'foreign'])(
    'rejects invalid actual root publication state %s',
    (finalState) => {
      const collector = createClientResultCollector(artifact, {
        runId: 'run',
        captureCompletedModuleResult: true,
      })
      collected(collector)
      startCase(collector)
      endCase(collector)
      rootSuite(collector)
      expect(() =>
        finish(collector, 1, {
          moduleCompletion: {
            version: 1,
            runId: 'run',
            entryId: artifact.entryId,
            revision: artifact.revision,
            kind: 'fulfilled',
            resultVersion: 2,
            finalState,
            durationMs: 1,
            containsOnly: false,
            interrupted: false,
          },
        })
      ).toThrow('Invalid fulfilled private module completion.')
    }
  )

  it('requires the same original Browser failure for private unavailable metadata', () => {
    const collector = createClientResultCollector(artifact, {
      runId: 'run',
      captureCompletedModuleResult: true,
    })
    const failure = { name: 'Error', message: 'actual collection failure' }
    collector.accept({ type: 'failure', error: failure })
    const completion = {
      version: 1,
      runId: 'run',
      entryId: artifact.entryId,
      revision: artifact.revision,
      kind: 'unavailable',
      phase: 'collection',
      failure: JSON.parse(JSON.stringify(failure)),
    }
    finish(collector, 0, { status: 'failed', moduleCompletion: completion })
    expect(collector.result().moduleCompletion).toEqual(completion)
    expect(collector.events).toContainEqual(
      expect.objectContaining({
        type: 'diagnostic',
        diagnostic: expect.objectContaining({ message: failure.message }),
      })
    )
  })
  it('rejects missing requested and unsolicited Browser module metadata', () => {
    const requested = createClientResultCollector(artifact, {
      runId: 'run',
      captureCompletedModuleResult: true,
    })
    collected(requested)
    startCase(requested)
    endCase(requested)
    rootSuite(requested)
    expect(() => finish(requested)).toThrow(
      'Browser Mode omitted requested private module completion.'
    )
    const unsolicited = createClientResultCollector(artifact, { runId: 'run' })
    expect(() => finish(unsolicited, 0, { moduleCompletion: {} })).toThrow(
      'Unsolicited private module completion.'
    )
  })
  it('rejects foreign and uncorroborated private Browser module facts', () => {
    for (const completion of [
      {
        version: 1,
        runId: 'foreign',
        entryId: artifact.entryId,
        revision: artifact.revision,
        kind: 'fulfilled',
        resultVersion: 2,
        finalState: 'pass',
        durationMs: 1,
        containsOnly: false,
        interrupted: false,
      },
      {
        version: 1,
        runId: 'run',
        entryId: artifact.entryId,
        revision: artifact.revision,
        kind: 'unavailable',
        phase: 'run',
        failure: { name: 'Error', message: 'unobserved' },
      },
    ]) {
      const collector = createClientResultCollector(artifact, {
        runId: 'run',
        captureCompletedModuleResult: true,
      })
      collector.accept({
        type: 'failure',
        error: { message: 'actual failure' },
      })
      expect(() =>
        finish(collector, 0, { status: 'failed', moduleCompletion: completion })
      ).toThrow()
    }
  })
  it.each([undefined, false, true])(
    'requires actual scheduling finalization for passed interrupted facts (%s)',
    (finalized) => {
      const collector = createClientResultCollector(artifact, {
        runId: 'run',
        ...(finalized === undefined
          ? {}
          : { isUserCancellationFinalized: () => finalized }),
      })
      collected(collector)
      startCase(collector)
      endCase(collector)
      rootSuite(collector)
      if (finalized !== true) {
        expect(() => finish(collector, 1, { interrupted: true })).toThrow(
          /omitted a failure or selected case/
        )
        return
      }
      finish(collector, 1, { interrupted: true })
      expect(collector.result().status).toBe('passed')
    }
  )
  it('retains incomplete tasks and snapshot vetoes under scheduling finalization', () => {
    const options = {
      runId: 'run',
      isUserCancellationFinalized: () => true,
    }
    const incomplete = createClientResultCollector(artifact, options)
    collected(incomplete)
    startCase(incomplete)
    expect(() => finish(incomplete, 1, { interrupted: true })).toThrow(
      /completion facts/
    )
    const snapshots = createClientResultCollector(artifact, options)
    collected(snapshots)
    startCase(snapshots)
    endCase(snapshots)
    rootSuite(snapshots)
    expect(() =>
      finish(snapshots, 1, { interrupted: true, updates: [{}] })
    ).toThrow(/returned snapshot updates/)
  })
  it.each([undefined, false, true])(
    'requires finalized scheduling for an active skipped run attempt (%s)',
    (finalized) => {
      const collector = createClientResultCollector(artifact, {
        runId: 'run',
        ...(finalized === undefined
          ? {}
          : { isUserCancellationFinalized: () => finalized }),
      })
      collected(collector)
      startCase(collector)
      if (finalized === undefined) {
        expect(() =>
          endCase(collector, undefined, undefined, { status: 'skipped' })
        ).toThrow(/immutable attempt/)
        return
      }
      endCase(collector, undefined, undefined, { status: 'skipped' })
      rootSuite(collector)
      if (!finalized) {
        expect(() => finish(collector, 1, { interrupted: true })).toThrow(
          /omitted declared tasks/
        )
        return
      }
      finish(collector, 1, { interrupted: true })
      expect(collector.result().status).toBe('passed')
    }
  )
  it.each([
    'not interrupted',
    'errors',
    'pending',
    'inactive',
    'mismatched mode',
  ])('retains immutable attempt checks for scheduling %s', (kind) => {
    const collector = createClientResultCollector(artifact, {
      runId: 'run',
      isUserCancellationFinalized: () => true,
    })
    collected(collector)
    if (kind !== 'inactive') startCase(collector)
    const end = () =>
      endCase(collector, undefined, undefined, {
        status: 'skipped',
        ...(kind === 'mismatched mode' ? { mode: 'todo' } : {}),
        ...(kind === 'errors'
          ? { errors: [{ phase: 'test', error: 'actual' }] }
          : {}),
        ...(kind === 'pending' ? { pending: true } : {}),
      })
    if (kind !== 'not interrupted') {
      expect(end).toThrow(/immutable attempt/)
      return
    }
    end()
    rootSuite(collector)
    expect(() => finish(collector)).toThrow(/omitted declared tasks/)
  })
  it('serves an inert owned host and preserves issued child assets and configuration', async () => {
    server = await createClientServer({
      artifact,
      configuration,
      testFrame: true,
      onMessage() {},
      onFailure() {},
    })
    expect(server.hostURL).toBeDefined()
    const host = await fetch(server.hostURL!)
    expect(host.status).toBe(200)
    const cookie = host.headers.get('set-cookie')!.split(';')[0]
    const html = await host.text()
    expect(html).toContain('<iframe src="about:blank">')
    expect(html).not.toContain('<script')
    expect(host.headers.get('content-security-policy')).toContain(
      "frame-src 'self'"
    )
    expect((await fetch(new URL('config', server.url))).status).toBe(404)
    const config = await fetch(new URL('config', server.url), {
      headers: { Cookie: cookie },
    }).then((response) => response.json())
    expect(config.entryId).toBe(artifact.entryId)
    expect(config.sourceHash).toBe(artifact.sourceHash)
    expect(config.filePath).toBe(configuration.filePath)
    const child = await fetch(server.url)
    expect(child.headers.get('content-security-policy')).toContain(
      "frame-ancestors 'self'"
    )
    expect(await child.text()).toContain('/_next/static/entry.js')
    expect(
      await (
        await fetch(new URL('/_next/static/entry.js', server.url), {
          headers: { Cookie: cookie },
        })
      ).text()
    ).toBe('globalThis.infrastructure = true')
    await server.verify()
  })
  it.each([false, true])(
    'declares an inert favicon for the actual isolated documents (framed: %s)',
    async (testFrame) => {
      server = await createClientServer({
        artifact,
        configuration,
        ...(testFrame ? { testFrame: true } : {}),
        onMessage() {},
        onFailure() {},
      })
      const urls = [server.url, ...(server.hostURL ? [server.hostURL] : [])]
      for (const url of urls) {
        const document = await fetch(url)
        expect(document.status).toBe(200)
        expect(await document.text()).toContain(
          '<link rel="icon" href="data:,">'
        )
      }
      // The declaration avoids a browser-generated missing-resource request;
      // it does not add an application route to the isolated test server.
      expect((await fetch(new URL('/favicon.ico', server.url))).status).toBe(
        404
      )
    }
  )
  it('opens an admitted native reply body before completion without changing its JSON value', async () => {
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const { post } = await open(
      () => {},
      async (_command, ...callbacks: (() => void)[]) => {
        callbacks[0]()
        await held
        return { exact: true, values: [1, null, 'é'] }
      }
    )
    const response = await post({
      type: 'browser-command',
      command: { method: 'click', element: 'button', args: [] },
    })
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let content = ''
    try {
      const admitted = await reader.read()
      expect(admitted.done).toBe(false)
      content = decoder.decode(admitted.value, { stream: true })
      expect(content).toMatch(/^\s+$/)
      expect(() => JSON.parse(content)).toThrow()
    } finally {
      release()
    }
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      content += decoder.decode(chunk.value, { stream: true })
    }
    content += decoder.decode()
    expect(JSON.parse(content)).toEqual({
      value: { exact: true, values: [1, null, 'é'] },
    })
  })
  it('admits actual console output before its native action reply while preserving both replies', async () => {
    let release!: () => void,
      entered!: () => void,
      actionReplied = false
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const active = new Promise<void>((resolve) => {
      entered = resolve
    })
    const rows: unknown[] = []
    const { post } = await open(
      (message) => {
        rows.push(message)
      },
      async (_command, ...callbacks: (() => void)[]) => {
        callbacks[0]()
        entered()
        await held
        return 'actual native result'
      }
    )
    const action = post({
      type: 'browser-command',
      command: { method: 'click', element: 'button', args: [] },
    })
    await active
    const response = await action
    const reply = response.json().then((value) => {
      actionReplied = true
      return value
    })
    try {
      expect(response.status).toBe(200)
      const output = await post({
        sequence: 1,
        type: 'output',
        stream: 'stdout',
        text: 'actual native console\n',
      })
      expect(await output.json()).toEqual({ value: null })
      expect(rows).toEqual([
        expect.objectContaining({
          type: 'output',
          sequence: 1,
          text: 'actual native console\n',
        }),
      ])
      expect(actionReplied).toBe(false)
    } finally {
      release()
    }
    expect(await reply).toEqual({ value: 'actual native result' })
    const complete = await post({
      sequence: 2,
      type: 'complete',
      status: 'passed',
      interrupted: false,
      caseCount: 0,
    })
    expect(await complete.json()).toEqual({ value: null })
    await expect(server!.completion).resolves.toMatchObject({
      status: 'passed',
    })
  })

  it.each(['actual', 'malformed'])(
    'retains %s captured task-pack validation during a pending native action',
    async (kind) => {
      const {
        createCollector,
      } = require('next/dist/experimental/testing/runner/collector')
      const {
        runCollected,
      } = require('next/dist/experimental/testing/runner/lifecycle')
      const {
        clientDeclarations,
      } = require('next/dist/experimental/testing/client/collection')
      const {
        captureReporterTaskTree,
      } = require('next/dist/experimental/testing/reporting/live-tasks')
      const {
        createReporterTaskUpdates,
      } = require('next/dist/experimental/testing/reporting/task-updates')
      const c = createCollector('entry')
      c.api.test('actual', () => {})
      const actualRoot = c.close()
      let initial: any, update: any
      const updates = createReporterTaskUpdates({
        onUpdate(value: any) {
          update = JSON.parse(JSON.stringify(value))
        },
      })
      try {
        await runCollected(
          actualRoot,
          {
            runId: 'run',
            filePath: configuration.filePath,
            signal: new AbortController().signal,
            onCollected(file: any) {
              initial = {
                type: 'collected',
                declarations: clientDeclarations(actualRoot),
                taskTree: captureReporterTaskTree(file),
              }
              updates.collected(file)
            },
          },
          () => {}
        )
        await updates.finish()
      } finally {
        updates.dispose()
      }
      configuration.captureTaskResults = true
      const collector = createClientResultCollector(artifact, {
        runId: 'run',
        captureTaskResults: true,
      })
      let release!: () => void,
        entered!: () => void,
        actionReplied = false
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      const active = new Promise<void>((resolve) => {
        entered = resolve
      })
      const outputRows: unknown[] = []
      const { post } = await open(
        (message) => {
          if (message.type === 'output') outputRows.push(message)
          else collector.accept(message)
        },
        async (_command, ...callbacks: (() => void)[]) => {
          callbacks[0]()
          entered()
          await held
          return 'actual native result'
        }
      )
      expect(await (await post(initial)).json()).toEqual({ value: null })
      const action = post({
        sequence: 1,
        type: 'browser-command',
        command: { method: 'click', element: 'button', args: [] },
      })
      await active
      const reply = (await action).json().then((value) => {
        actionReplied = true
        return value
      })
      try {
        if (kind === 'malformed') update.taskUpdateIds = ['foreign-task']
        const response = await post({
          sequence: 2,
          type: 'task-update',
          ...update,
        })
        expect(actionReplied).toBe(false)
        if (kind === 'malformed') {
          expect(response.status).toBe(400)
          await expect(server!.completion).rejects.toThrow(
            'Invalid or unsolicited Browser Mode task update.'
          )
          expect(collector.events.map((event: any) => event.type)).toEqual([
            'file-collected',
          ])
        } else {
          expect(await response.json()).toEqual({ value: null })
          const output = await post({
            sequence: 3,
            type: 'output',
            stream: 'stdout',
            text: 'after actual task update\n',
          })
          expect(await output.json()).toEqual({ value: null })
          expect(collector.events.map((event: any) => event.type)).toEqual([
            'file-collected',
            'task-update',
          ])
          expect(outputRows).toEqual([
            expect.objectContaining({
              type: 'output',
              sequence: 3,
              text: 'after actual task update\n',
            }),
          ])
          expect(collector.events[1]).toMatchObject({
            taskUpdateIds: update.taskUpdateIds,
            taskTree: JSON.parse(JSON.stringify(initial.taskTree)),
            caseResults: [],
          })
          expect(actionReplied).toBe(false)
        }
      } finally {
        release()
        await expect(reply).resolves.toEqual({ value: 'actual native result' })
      }
    }
  )

  it.each([
    'browser-command',
    'snapshot',
    'artifact',
    'complete',
    'case-end',
    'task-update',
  ])(
    'keeps concurrent %s terminal while a native action is admitted',
    async (type) => {
      let release!: () => void, entered!: () => void
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      const active = new Promise<void>((resolve) => {
        entered = resolve
      })
      const rows: unknown[] = []
      const { post } = await open(
        (message) => {
          rows.push(message)
        },
        async (_command, ...callbacks: (() => void)[]) => {
          callbacks[0]()
          entered()
          await held
          return null
        }
      )
      const action = post({
        type: 'browser-command',
        command: { method: 'click', element: 'button', args: [] },
      })
      await active
      const body = (await action).json()
      try {
        const response = await post({
          sequence: 1,
          type,
          command: { method: 'click', element: 'button', args: [] },
        })
        expect(response.status).toBe(400)
        await expect(server!.completion).rejects.toThrow(
          'Only Browser console output'
        )
        expect(rows).toEqual([])
      } finally {
        release()
        await body
      }
    }
  )

  it('joins both actual native action and console work when their sockets close', async () => {
    let releaseAction!: () => void,
      releaseOutput!: () => void,
      enterOutput!: () => void,
      disposed = false
    const heldAction = new Promise<void>((resolve) => {
      releaseAction = resolve
    })
    const heldOutput = new Promise<void>((resolve) => {
      releaseOutput = resolve
    })
    const outputActive = new Promise<void>((resolve) => {
      enterOutput = resolve
    })
    const { post } = await open(
      async () => {
        enterOutput()
        await heldOutput
      },
      async (_command, ...callbacks: (() => void)[]) => {
        callbacks[0]()
        await heldAction
        return null
      }
    )
    const action = await post({
      type: 'browser-command',
      command: { method: 'click', element: 'button', args: [] },
    })
    const actionBody = action.json().catch(() => {})
    const output = post({
      sequence: 1,
      type: 'output',
      stream: 'stdout',
      text: 'actual pending console\n',
    }).catch(() => {})
    await outputActive
    const disposal = server!.dispose().then(() => {
      disposed = true
    })
    try {
      await Promise.all([actionBody, output])
      expect(disposed).toBe(false)
      releaseOutput()
      await Promise.resolve()
      expect(disposed).toBe(false)
    } finally {
      releaseOutput()
      releaseAction()
      await disposal
    }
    expect(disposed).toBe(true)
  })

  it.each([false, true])(
    'admits logical final messages only with private case scheduling: %s',
    async (admitted) => {
      if (admitted) configuration.caseScheduling = 'concurrent-v1'
      const rows: unknown[] = []
      const { post } = await open((message) => {
        rows.push(message)
      })
      const result = {
        caseId: 'entry/0',
        attempt: { id: 'run/entry/0/0/0', retry: 0, repeat: 0 },
        status: 'passed',
        mode: 'run',
      }
      const response = await post({ type: 'case-final', result })
      expect(response.status).toBe(admitted ? 200 : 400)
      expect(await response.json()).toEqual(
        admitted ? { value: null } : { error: 'Browser Mode transport failed.' }
      )
      if (admitted) {
        expect(rows).toEqual([
          expect.objectContaining({ type: 'case-final', result }),
        ])
      } else {
        expect(rows).toEqual([])
        await expect(server!.completion).rejects.toThrow(
          'Unknown Browser Mode transport message.'
        )
      }
    }
  )

  it('retains unexpected admitted action failures in the existing terminal error envelope', async () => {
    const original = new Error('actual post-admission host failure')
    const { post } = await open(
      () => {},
      async (_command, ...callbacks: (() => void)[]) => {
        callbacks[0]()
        throw original
      }
    )
    const response = await post({
      type: 'browser-command',
      command: { method: 'click', element: 'button', args: [] },
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      error: 'Browser Mode transport failed.',
    })
    await expect(server!.completion).rejects.toBe(original)
  })

  it.each(['duplicate sequence', 'wrong owner'])(
    'retains actual output %s checks during an admitted native action',
    async (mode) => {
      let release!: () => void
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      const rows: unknown[] = []
      const { post } = await open(
        (message) => {
          rows.push(message)
        },
        async (_command, ...callbacks: (() => void)[]) => {
          callbacks[0]()
          await held
          return null
        }
      )
      const action = await post({
        type: 'browser-command',
        command: { method: 'click', element: 'button', args: [] },
      })
      const body = action.json()
      try {
        const output = await post({
          sequence: mode === 'duplicate sequence' ? 0 : 1,
          ...(mode === 'wrong owner' ? { ownerToken: 'another' } : {}),
          type: 'output',
          stream: 'stdout',
          text: 'actual console\n',
        })
        expect(output.status).toBe(400)
        await expect(server!.completion).rejects.toThrow()
        expect(rows).toEqual([])
      } finally {
        release()
        await body
      }
    }
  )

  it('retains a synchronous console observer rejection while joining its admitted native action', async () => {
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const original = new Error('actual console observer rejected')
    const { post } = await open(
      () => {
        throw original
      },
      async (_command, ...callbacks: (() => void)[]) => {
        callbacks[0]()
        await held
        return null
      }
    )
    const action = await post({
      type: 'browser-command',
      command: { method: 'click', element: 'button', args: [] },
    })
    const body = action.json()
    try {
      const output = await post({
        sequence: 1,
        type: 'output',
        stream: 'stdout',
        text: 'actual console\n',
      })
      expect(output.status).toBe(400)
      await expect(server!.completion).rejects.toBe(original)
    } finally {
      release()
      await body
    }
  })

  it.each(['development', 'production'])(
    'places the default document geometry reset before authored %s styles',
    async (mode) => {
      artifact.profile.mode = mode
      const css = 'body { margin: 12px; min-height: 10px; }'
      await writeFile(join(artifact.rootDir, 'static/authored.css'), css)
      artifact.files.push('static/authored.css')
      artifact.client.styles.push('static/authored.css')
      artifact.client.outputs.push({
        path: 'static/authored.css',
        sha256: hash(css),
      })
      const { cookie } = await open()
      const html = await fetch(server!.url).then((response) => response.text())
      expect(html).toContain(`<head><style>
html {
  padding: 0;
  margin: 0;
}
body {
  padding: 0;
  margin: 0;
  min-height: 100vh;
}
</style><link rel="stylesheet"`)
      const stylesheet = html.match(/href="([^"]+authored\.css[^"]*)"/)![1]
      expect(
        await fetch(new URL(stylesheet, server!.url), {
          headers: { Cookie: cookie },
        }).then((response) => response.text())
      ).toBe(css)
      expect(html.indexOf('</style>')).toBeLessThan(html.indexOf('<link '))
      expect(html.indexOf('<link ')).toBeLessThan(html.indexOf('<script '))
    }
  )

  it('returns a native action rejection without closing the command stream', async () => {
    const {
      runClientBrowserAction,
    } = require('next/dist/experimental/testing/client/action-error')
    const original = new Error('native action rejected')
    original.name = 'TimeoutError'
    const { post } = await open(
      () => {},
      async (command) =>
        runClientBrowserAction(async () => {
          if (command.method === 'upload') throw original
          return null
        })
    )
    const rejected = await post({
      type: 'browser-command',
      command: { method: 'upload', element: 'file', args: [] },
    })
    expect(rejected.status).toBe(200)
    expect(await rejected.json()).toEqual({
      actionError: {
        name: 'TimeoutError',
        message: original.message,
        stack: original.stack,
      },
    })
    const following = await post({
      type: 'browser-command',
      sequence: 1,
      command: { method: 'click', element: 'button', args: [] },
    })
    expect(following.status).toBe(200)
    expect(await following.json()).toEqual({ value: null })
    expect(
      (
        await post({
          type: 'complete',
          sequence: 2,
          status: 'passed',
          caseCount: 0,
          interrupted: false,
        })
      ).status
    ).toBe(200)
    await expect(server!.completion).resolves.toMatchObject({
      type: 'complete',
      status: 'passed',
    })
    expect(() => server!.assertClean()).not.toThrow()
  })

  it('keeps command validation failures terminal rather than treating them as action rejections', async () => {
    const original = new Error('Invalid Browser Mode element command.')
    const { post } = await open(
      () => {},
      async () => {
        throw original
      }
    )
    const response = await post({ type: 'browser-command', command: {} })
    expect(response.status).toBe(400)
    await expect(server!.completion).rejects.toBe(original)
    expect(() => server!.assertClean()).toThrow(original)
  })

  it('transports closed collection facts before the first browser attempt', async () => {
    const collector = createClientResultCollector(artifact, { runId: 'run' })
    const { post } = await open((message) => collector.accept(message))
    expect(
      (
        await post({
          type: 'collected',
          declarations: [
            {
              type: 'suite',
              id: 'entry',
              parentId: null,
              name: '',
              mode: 'run',
            },
            {
              type: 'test',
              id: 'entry/0',
              parentId: 'entry',
              name: 'actual',
              mode: 'run',
            },
          ],
        })
      ).status
    ).toBe(200)
    expect(
      (
        await post({
          type: 'case-start',
          sequence: 1,
          context: {
            fileId: 'entry',
            id: 'run/entry/0/0/0',
            testId: 'entry/0',
            name: 'actual',
            retry: 0,
            repeat: 0,
          },
        })
      ).status
    ).toBe(200)
    expect(
      (
        await post({
          type: 'case-end',
          sequence: 2,
          result: {
            entryId: 'entry',
            caseId: 'entry/0',
            name: 'actual',
            attempt: { id: 'run/entry/0/0/0', retry: 0, repeat: 0 },
            status: 'passed',
            mode: 'run',
            durationMs: 0,
            errors: [],
          },
        })
      ).status
    ).toBe(200)
    expect(
      (
        await post({
          type: 'suite-end',
          sequence: 3,
          result: {
            entryId: 'entry',
            suiteId: 'entry',
            name: '',
            ancestors: [],
            status: 'passed',
            mode: 'run',
            durationMs: 0,
            errors: [],
          },
        })
      ).status
    ).toBe(200)
    expect(
      (
        await post({
          type: 'complete',
          sequence: 4,
          status: 'passed',
          interrupted: false,
          caseCount: 1,
          updates: [],
        })
      ).status
    ).toBe(200)
    await server!.completion
    await server!.dispose()
    server!.assertClean()
    expect(collector.result().status).toBe('passed')
  })
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
  it.each([
    ['adjacent', 'static/entry.js.map', undefined],
    ['hashed', 'static/independent-hash.js.map', 'independent-hash.js.map'],
    [
      'parent',
      'maps/independent-hash.js.map',
      '../maps/independent-hash.js.map',
    ],
    [
      'absolute',
      'static/independent-hash.js.map',
      '/_next/static/independent-hash.js.map',
    ],
    ['encoded', 'static/space name.js.map', 'space%20name.js.map'],
    ['crlf', 'static/independent-hash.js.map', 'independent-hash.js.map'],
  ] as const)(
    'maps the actual %s JavaScript output to its emitted source map',
    async (kind, mapPath, reference) => {
      const { SourceMapGenerator } = require('next/dist/compiled/source-map')
      const source = 'turbopack:///[project]/contract.case.mjs'
      const original = await readFile(configuration.filePath, 'utf8')
      const map = new SourceMapGenerator()
      map.addMapping({
        generated: { line: 1, column: 0 },
        original: { line: 1, column: 0 },
        source,
      })
      map.setSourceContent(source, original)
      const mapText = map.toString()
      const javascript =
        'globalThis.infrastructure = true' +
        (reference
          ? kind === 'crlf'
            ? `\r\n//# sourceMappingURL=${reference}\r\n//# debugId=actual-debug-id\r\n`
            : `\n//# sourceMappingURL=${reference}\n`
          : '')
      await mkdir(join(artifact.rootDir, mapPath, '..'), { recursive: true })
      await writeFile(join(artifact.rootDir, mapPath), mapText)
      await writeFile(join(artifact.rootDir, 'static/entry.js'), javascript)
      artifact.files.push(mapPath)
      artifact.client.outputs = [
        { path: 'static/entry.js', sha256: hash(javascript) },
        { path: mapPath, sha256: hash(mapText) },
      ]
      const reader = await createClientAssetReader(artifact)
      const maps = await reader.sourceMaps('http://actual-map.test')
      expect(maps).toEqual([
        {
          url: 'http://actual-map.test/_next/static/entry.js',
          map: JSON.parse(mapText),
          originalSources: [source],
        },
      ])
      const {
        createClientSourceMapResolver,
      } = require('next/dist/experimental/testing/client/source-maps')
      const resolver = createClientSourceMapResolver({
        filePath: configuration.filePath,
        sourceMaps: maps,
      })
      for (const file of [maps[0].url, '/_next/static/entry.js']) {
        const frame = { file, line: 1, column: 1 }
        expect(resolver.mapLocation(frame)).toMatchObject({
          file: configuration.filePath,
          line: 1,
          column: 1,
        })
        expect(resolver.getSourceContent(frame)).toBe(original)
      }
      await reader.verify()
    }
  )
  it.each(['missing-map', 'foreign-source'])(
    'does not attribute %s to the selected JavaScript output',
    async (mode) => {
      const { SourceMapGenerator } = require('next/dist/compiled/source-map')
      const map = new SourceMapGenerator()
      map.addMapping({
        generated: { line: 1, column: 0 },
        original: { line: 1, column: 0 },
        source: 'original',
      })
      map.setSourceContent(
        'original',
        mode === 'foreign-source'
          ? 'different authored bytes'
          : await readFile(configuration.filePath, 'utf8')
      )
      const mapText = map.toString()
      const javascript = `globalThis.infrastructure = true\n//# sourceMappingURL=${mode === 'missing-map' ? 'missing.js.map' : 'entry.js.map'}\n`
      await writeFile(join(artifact.rootDir, 'static/entry.js'), javascript)
      await writeFile(join(artifact.rootDir, 'static/entry.js.map'), mapText)
      artifact.files.push('static/entry.js.map')
      artifact.client.outputs = [
        { path: 'static/entry.js', sha256: hash(javascript) },
        { path: 'static/entry.js.map', sha256: hash(mapText) },
      ]
      const reader = await createClientAssetReader(artifact)
      await expect(
        reader.sourceMaps('http://actual-map.test')
      ).resolves.toEqual([])
      await reader.verify()
    }
  )
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
      JSON.stringify({
        version: 1,
        asyncScope: 'promise-continuations-v1',
        scripts: ['static/entry.js'],
        styles: [],
      })
    )
    await expect(
      readClientDescriptor(artifact.rootDir, path, files, 'entry')
    ).resolves.toEqual({
      version: 1,
      asyncScope: 'promise-continuations-v1',
      scripts: ['static/entry.js'],
      styles: [],
    })
    await writeFile(
      join(artifact.rootDir, path),
      JSON.stringify({
        version: 1,
        asyncScope: 'promise-continuations-v1',
        scripts: ['../escape.js'],
        styles: [],
      })
    )
    await expect(
      readClientDescriptor(artifact.rootDir, path, files, 'entry')
    ).rejects.toThrow()
  })
  it('retains setup-blocked skipped cases without inventing a body start', () => {
    const options = { runId: 'run', updateSnapshots: false }
    const collector = createClientResultCollector(artifact, options)
    collected(collector, 'blocked')
    const result = {
      entryId: 'entry',
      caseId: 'entry/0',
      name: 'blocked',
      attempt: { id: 'run/entry/0/0/0', retry: 0, repeat: 0 },
      status: 'skipped',
      mode: 'skip',
      durationMs: 0,
      errors: [],
    }
    expect(() =>
      collector.accept({
        type: 'case-end',
        result: { ...result, status: 'passed', errors: [] },
      })
    ).toThrow(/immutable attempt/)
    expect(() =>
      collector.accept({
        type: 'case-end',
        result: { ...result, attempt: { ...result.attempt, id: 'foreign' } },
      })
    ).toThrow(/immutable attempt/)
    collector.accept({ type: 'case-end', result })
    expect(collector.events).toEqual([])
    expect(() => collector.accept({ type: 'case-end', result })).toThrow(
      /immutable attempt/
    )
    rootSuite(
      collector,
      'failed',
      [{ phase: 'beforeAll', error: new Error('setup failed') }],
      true
    )
    collector.accept({
      type: 'complete',
      status: 'failed',
      interrupted: false,
      caseCount: 1,
      updates: [],
    })
    expect(collector.result().status).toBe('failed')
    expect(collector.events.map((event) => event.type)).toEqual([
      'case-end',
      'suite-end',
    ])
  })
  it('cannot turn an unstarted skipped case into a passing browser file', () => {
    const collector = createClientResultCollector(artifact, {
      runId: 'run',
      updateSnapshots: false,
    })
    collected(collector, 'blocked')
    collector.accept({
      type: 'case-end',
      result: {
        entryId: 'entry',
        caseId: 'entry/0',
        name: 'blocked',
        attempt: { id: 'run/entry/0/0/0', retry: 0, repeat: 0 },
        mode: 'skip',
        status: 'skipped',
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
        updates: [],
      })
    ).toThrow(/omitted/)
    collector.accept({
      type: 'suite-end',
      result: {
        entryId: 'entry',
        suiteId: 'entry',
        name: '',
        ancestors: [],
        mode: 'run',
        status: 'failed',
        durationMs: 0,
        blockedDescendants: true,
        errors: [{ phase: 'beforeAll', error: new Error('setup failed') }],
      },
    })
    collector.accept({
      type: 'complete',
      status: 'failed',
      interrupted: false,
      caseCount: 1,
      updates: [],
    })
    expect(collector.result().status).toBe('failed')
    expect(collector.events.map((event) => event.type)).toEqual([
      'case-end',
      'suite-end',
    ])
  })
  it('binds one actual result to its started attempt and refuses fabricated passes', () => {
    const options = { runId: 'run', updateSnapshots: false }
    const collector = createClientResultCollector(artifact, options)
    collected(collector, 'original')
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
    rootSuite(collector)
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
  it('binds every serial case to closed declarations and retains inactive metadata', () => {
    const collector = createClientResultCollector(artifact, {
      runId: 'run',
      testNamePattern: '^(?!filtered$)',
    })
    const declarations = [
      { type: 'suite', id: 'entry', parentId: null, name: '', mode: 'run' },
      {
        type: 'suite',
        id: 'entry/0',
        parentId: 'entry',
        name: 'group > literal',
        mode: 'run',
      },
      {
        type: 'test',
        id: 'entry/0/0',
        parentId: 'entry/0',
        name: 'same',
        mode: 'run',
      },
      {
        type: 'test',
        id: 'entry/0/1',
        parentId: 'entry/0',
        name: 'same',
        mode: 'run',
      },
      {
        type: 'test',
        id: 'entry/0/2',
        parentId: 'entry/0',
        name: 'skip',
        mode: 'skip',
      },
      {
        type: 'test',
        id: 'entry/0/3',
        parentId: 'entry/0',
        name: 'todo',
        mode: 'todo',
      },
      {
        type: 'test',
        id: 'entry/1',
        parentId: 'entry',
        name: 'filtered',
        mode: 'run',
      },
    ]
    collector.accept({ type: 'collected', declarations })
    // Later mutation of a child's wire object cannot rename its declaration.
    declarations[2].name = 'borrowed'
    for (const id of ['entry/0/0', 'entry/0/1']) {
      startCase(collector, id, 'group > literal > same')
      endCase(collector, id, 'group > literal > same')
    }
    for (const [id, name, mode] of [
      ['entry/0/2', 'group > literal > skip', 'skip'],
      ['entry/0/3', 'group > literal > todo', 'todo'],
      ['entry/1', 'filtered', 'skip'],
    ])
      endCase(collector, id, name, { mode, status: 'skipped' })
    collector.accept({
      type: 'suite-end',
      result: {
        entryId: 'entry',
        suiteId: 'entry/0',
        name: 'group > literal',
        ancestors: [],
        mode: 'run',
        status: 'passed',
        durationMs: 0,
        errors: [],
      },
    })
    rootSuite(collector)
    finish(collector, 5)
    const events = collector.result().events
    expect(
      events.filter((event: any) => event.type === 'case-start')
    ).toHaveLength(2)
    expect(
      events
        .filter((event: any) => event.type === 'case-end')
        .map((event: any) => ({
          id: event.caseId,
          testName: event.testName,
          mode: event.mode,
          ancestors: event.ancestors,
        }))
    ).toEqual([
      {
        id: 'entry/0/0',
        testName: 'same',
        mode: 'run',
        ancestors: [{ id: 'entry/0', name: 'group > literal' }],
      },
      {
        id: 'entry/0/1',
        testName: 'same',
        mode: 'run',
        ancestors: [{ id: 'entry/0', name: 'group > literal' }],
      },
      {
        id: 'entry/0/2',
        testName: 'skip',
        mode: 'skip',
        ancestors: [{ id: 'entry/0', name: 'group > literal' }],
      },
      {
        id: 'entry/0/3',
        testName: 'todo',
        mode: 'todo',
        ancestors: [{ id: 'entry/0', name: 'group > literal' }],
      },
      { id: 'entry/1', testName: 'filtered', mode: 'skip', ancestors: [] },
    ])
  })
  it.each([
    'duplicate',
    'missing-parent',
    'noncanonical-id',
    'reopened-subtree',
    'extra-fact',
  ])('refuses %s collected declaration facts before any attempt', (kind) => {
    const collector = createClientResultCollector(artifact, { runId: 'run' })
    const declarations: any[] = [
      { type: 'suite', id: 'entry', parentId: null, name: '', mode: 'run' },
      {
        type: 'suite',
        id: 'entry/0',
        parentId: 'entry',
        name: 'suite',
        mode: 'run',
      },
      {
        type: 'test',
        id: 'entry/0/0',
        parentId: 'entry/0',
        name: 'case',
        mode: 'run',
      },
    ]
    if (kind === 'duplicate') declarations.push({ ...declarations[2] })
    if (kind === 'missing-parent') declarations[2].parentId = 'foreign'
    if (kind === 'noncanonical-id') declarations[2].id = 'entry/0/1'
    if (kind === 'extra-fact') declarations[2].selected = true
    if (kind === 'reopened-subtree')
      declarations.push(
        {
          type: 'test',
          id: 'entry/1',
          parentId: 'entry',
          name: 'sibling',
          mode: 'run',
        },
        {
          type: 'test',
          id: 'entry/0/1',
          parentId: 'entry/0',
          name: 'late child',
          mode: 'run',
        }
      )
    expect(() => collector.accept({ type: 'collected', declarations })).toThrow(
      /collected declarations/
    )
    expect(collector.events).toEqual([])
  })
  it('derives focus, filtering, and empty-name ancestry from declarations', () => {
    const {
      resolveClientDeclarations,
    } = require('next/dist/experimental/testing/client/collection')
    const declarations = [
      { type: 'suite', id: 'entry', parentId: null, name: '', mode: 'run' },
      {
        type: 'suite',
        id: 'entry/0',
        parentId: 'entry',
        name: '',
        mode: 'run',
      },
      {
        type: 'test',
        id: 'entry/0/0',
        parentId: 'entry/0',
        name: 'focused',
        mode: 'only',
      },
      {
        type: 'test',
        id: 'entry/1',
        parentId: 'entry',
        name: 'inactive',
        mode: 'run',
      },
    ]
    expect(
      [
        ...resolveClientDeclarations(declarations, 'entry', {
          testNamePattern: '^ > focused$',
        }).cases.values(),
      ].map((test: any) => [test.id, test.mode, test.name])
    ).toEqual([
      ['entry/0/0', 'run', 'focused'],
      ['entry/1', 'skip', 'inactive'],
    ])
    expect(() =>
      resolveClientDeclarations(declarations, 'entry', { allowOnly: false })
    ).toThrow(/collected declarations/)
  })
  it.each(['missing', 'duplicate', 'late'])(
    'refuses %s post-collection declarations',
    (kind) => {
      const collector = createClientResultCollector(artifact, { runId: 'run' })
      if (kind === 'missing') {
        expect(() => startCase(collector)).toThrow(/owner/)
        return
      }
      collected(collector)
      if (kind === 'late') startCase(collector)
      expect(() => collected(collector)).toThrow(/Duplicate/)
    }
  )
  it('refuses overlapping serial attempts, duplicate ends, and results after completion', () => {
    const collector = createClientResultCollector(artifact, { runId: 'run' })
    collector.accept({
      type: 'collected',
      declarations: [
        { type: 'suite', id: 'entry', parentId: null, name: '', mode: 'run' },
        {
          type: 'test',
          id: 'entry/0',
          parentId: 'entry',
          name: 'actual',
          mode: 'run',
        },
        {
          type: 'test',
          id: 'entry/1',
          parentId: 'entry',
          name: 'second',
          mode: 'run',
        },
      ],
    })
    startCase(collector)
    expect(() => startCase(collector, 'entry/1', 'second')).toThrow(/owner/)
    expect(() => endCase(collector, 'entry/1', 'second')).toThrow(
      /immutable attempt/
    )
    endCase(collector)
    expect(() => endCase(collector)).toThrow(/immutable attempt/)
    startCase(collector, 'entry/1', 'second')
    endCase(collector, 'entry/1', 'second')
    rootSuite(collector)
    finish(collector, 2)
    expect(() => endCase(collector)).toThrow(/after terminal/)
    expect(() => collected(collector)).toThrow(/after terminal/)
  })
  it.each(['unknown', 'renamed', 'unstarted', 'inactive'])(
    'refuses an %s case from borrowing a declared attempt',
    (kind) => {
      const collector = createClientResultCollector(artifact, { runId: 'run' })
      collected(collector, 'actual', kind === 'inactive' ? 'skip' : 'run')
      if (kind === 'unknown')
        expect(() => startCase(collector, 'entry/1')).toThrow(/owner/)
      if (kind === 'renamed')
        expect(() => startCase(collector, 'entry/0', 'borrowed')).toThrow(
          /owner/
        )
      if (kind === 'unstarted')
        expect(() => endCase(collector)).toThrow(/immutable attempt/)
      if (kind === 'inactive')
        expect(() => startCase(collector)).toThrow(/owner/)
      expect(collector.events).toEqual([])
    }
  )
  it('requires every declared case and suite before a file may complete', () => {
    const collector = createClientResultCollector(artifact, { runId: 'run' })
    collector.accept({
      type: 'collected',
      declarations: [
        { type: 'suite', id: 'entry', parentId: null, name: '', mode: 'run' },
        {
          type: 'suite',
          id: 'entry/0',
          parentId: 'entry',
          name: 'group',
          mode: 'run',
        },
        {
          type: 'test',
          id: 'entry/0/0',
          parentId: 'entry/0',
          name: 'actual',
          mode: 'run',
        },
      ],
    })
    expect(() => rootSuite(collector)).toThrow(/omitted declared descendants/)
    expect(() => finish(collector, 0)).toThrow(/omitted declared tasks/)
    startCase(collector, 'entry/0/0', 'group > actual')
    endCase(collector, 'entry/0/0', 'group > actual')
    expect(() => rootSuite(collector)).toThrow(/omitted declared descendants/)
    collector.accept({
      type: 'suite-end',
      result: {
        entryId: 'entry',
        suiteId: 'entry/0',
        name: 'group',
        ancestors: [],
        mode: 'run',
        status: 'passed',
        durationMs: 0,
        errors: [],
      },
    })
    expect(() => finish(collector)).toThrow(/omitted declared tasks/)
    rootSuite(collector)
    expect(() => finish(collector, 0)).toThrow(/completion facts/)
    finish(collector)
    expect(collector.result().status).toBe('passed')
  })
  it('retains pending skips while refusing unproven inactive snapshot writes', () => {
    const collector = createClientResultCollector(artifact, { runId: 'run' })
    collected(collector)
    startCase(collector)
    endCase(collector, 'entry/0', 'actual', {
      status: 'skipped',
      mode: 'skip',
      pending: true,
      note: 'condition',
    })
    rootSuite(collector, 'skipped')
    finish(collector)
    expect(
      collector.result().events.find((event: any) => event.type === 'case-end')
    ).toMatchObject({ pending: true, note: 'condition', mode: 'skip' })
    const inactive = createClientResultCollector(artifact, {
      runId: 'run',
      updateSnapshots: true,
    })
    collected(inactive, 'actual', 'todo')
    endCase(inactive, 'entry/0', 'actual', { status: 'skipped', mode: 'todo' })
    rootSuite(inactive, 'skipped')
    expect(() =>
      finish(inactive, 1, {
        updates: [
          {
            path: artifact.client.sourceFile,
            content: 'changed',
            previousContent: 'original',
          },
        ],
      })
    ).toThrow(/executed case/)
    finish(inactive)
    expect(inactive.result().status).toBe('passed')
  })
  it.each(['afterAll', 'aroundAll-teardown', 'foreign-suite'])(
    'cannot authorize unstarted skipped metadata with %s failure',
    (kind) => {
      const collector = createClientResultCollector(artifact, { runId: 'run' })
      const declarations: any[] = [
        { type: 'suite', id: 'entry', parentId: null, name: '', mode: 'run' },
        {
          type: 'test',
          id: 'entry/0',
          parentId: 'entry',
          name: 'actual',
          mode: 'run',
        },
      ]
      if (kind === 'foreign-suite')
        declarations.push({
          type: 'suite',
          id: 'entry/1',
          parentId: 'entry',
          name: 'unrelated',
          mode: 'run',
        })
      collector.accept({ type: 'collected', declarations })
      endCase(collector, 'entry/0', 'actual', {
        status: 'skipped',
        mode: 'skip',
      })
      if (kind === 'foreign-suite')
        collector.accept({
          type: 'suite-end',
          result: {
            entryId: 'entry',
            suiteId: 'entry/1',
            name: 'unrelated',
            ancestors: [],
            mode: 'run',
            status: 'failed',
            durationMs: 0,
            errors: [{ phase: 'beforeAll', error: new Error('unrelated') }],
          },
        })
      rootSuite(
        collector,
        'failed',
        kind !== 'foreign-suite'
          ? [
              {
                phase: kind === 'afterAll' ? 'afterAll' : 'aroundAll',
                error: new Error('teardown'),
              },
            ]
          : []
      )
      expect(() => finish(collector, 1, { status: 'failed' })).toThrow(
        /suite failure/
      )
      expect(
        collector.events.some((event: any) => event.type === 'case-end')
      ).toBe(false)
    }
  )
  it('requires an interrupted terminal owner for cancelled declared cases', () => {
    const collector = createClientResultCollector(artifact, { runId: 'run' })
    collected(collector)
    endCase(collector, 'entry/0', 'actual', { status: 'cancelled' })
    expect(() => rootSuite(collector)).toThrow(/contradicts/)
    rootSuite(collector, 'cancelled')
    expect(() => finish(collector, 1, { status: 'failed' })).toThrow(
      /suite failure/
    )
    finish(collector, 1, { status: 'failed', interrupted: true })
    expect(
      collector.events.filter((event: any) => event.type === 'case-start')
    ).toEqual([])
    expect(collector.result().status).toBe('failed')
  })
  it('validates fixture admission using the exact sticky-filter traversal including todo cases', async () => {
    const {
      createCollector,
    } = require('next/dist/experimental/testing/runner/collector')
    const {
      validateSynchronousClient,
    } = require('next/dist/experimental/testing/client/validate')
    const {
      resolveClientDeclarations,
      clientDeclarations,
    } = require('next/dist/experimental/testing/client/collection')
    const body = jest.fn()
    const file = createCollector('entry')
    file.api.test('x', body)
    file.api.test.todo('x')
    file.api.test.extend({ value: 42 })('x', ({ value }: { value: number }) =>
      body(value)
    )
    await file.settle()
    const root = file.close()
    expect(
      [
        ...resolveClientDeclarations(clientDeclarations(root), 'entry', {
          testNamePattern: /x/y,
        }).cases.values(),
      ].map((test: any) => test.mode)
    ).toEqual(['run', 'skip', 'run'])
    expect(() =>
      validateSynchronousClient(root, { testNamePattern: /x/y })
    ).toThrow(/Browser Mode.*fixtures/)
    expect(body).not.toHaveBeenCalled()
  })
  it('refuses cancellation facts for a started attempt instead of accepting an uninterrupted file', () => {
    const collector = createClientResultCollector(artifact, { runId: 'run' })
    collected(collector)
    startCase(collector)
    expect(() =>
      endCase(collector, 'entry/0', 'actual', { status: 'cancelled' })
    ).toThrow(/immutable attempt/)
    endCase(collector)
    rootSuite(collector, 'failed', [
      { phase: 'afterAll', error: new Error('teardown') },
    ])
    finish(collector, 1, { status: 'failed' })
    expect(
      collector.events
        .filter((event: any) => event.type === 'case-end')
        .map((event: any) => event.status)
    ).toEqual(['passed'])
  })
  it.each(['beforeAll', 'aroundAll'])(
    'refuses %s blocked-descendant proof when a descendant has started',
    (phase) => {
      const collector = createClientResultCollector(artifact, { runId: 'run' })
      collected(collector)
      startCase(collector)
      endCase(collector)
      expect(() =>
        rootSuite(
          collector,
          'failed',
          [{ phase, error: new Error('setup') }],
          true
        )
      ).toThrow(/blocked suite contradicts/)
      // A real teardown failure can follow the executed descendant.
      rootSuite(collector, 'failed', [
        { phase: 'aroundAll', error: new Error('teardown') },
      ])
      finish(collector, 1, { status: 'failed' })
      expect(collector.result().status).toBe('failed')
    }
  )
  it('refuses an invented unstarted case failure in place of its failed setup suite', () => {
    const collector = createClientResultCollector(artifact, { runId: 'run' })
    collected(collector)
    expect(() =>
      endCase(collector, 'entry/0', 'actual', {
        status: 'failed',
        errors: [{ phase: 'beforeAll', error: new Error('setup') }],
      })
    ).toThrow(/immutable attempt/)
    endCase(collector, 'entry/0', 'actual', { status: 'skipped', mode: 'skip' })
    rootSuite(
      collector,
      'failed',
      [{ phase: 'beforeAll', error: new Error('setup') }],
      true
    )
    finish(collector, 1, { status: 'failed' })
    expect(
      collector.events.filter((event: any) => event.type === 'case-start')
    ).toEqual([])
  })
  it('cannot claim blocked setup after filtering made all descendants inactive', () => {
    const collector = createClientResultCollector(artifact, {
      runId: 'run',
      testNamePattern: '^unmatched$',
    })
    collected(collector)
    endCase(collector, 'entry/0', 'actual', { status: 'skipped', mode: 'skip' })
    expect(() =>
      rootSuite(
        collector,
        'failed',
        [{ phase: 'beforeAll', error: new Error('setup') }],
        true
      )
    ).toThrow(/blocked suite contradicts/)
    rootSuite(collector, 'skipped')
    finish(collector)
    expect(collector.result().status).toBe('passed')
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
    expect(
      parseTestConfig({
        projects: [
          {
            name: 'production-client',
            mode: 'production',
            browser: { enabled: true },
          },
        ],
      }).projects[0].profile
    ).toMatchObject({
      environment: 'browser',
      browserClient: true,
      mode: 'production',
    })
    for (const extra of [
      { mode: 'invalid' },
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
  it('maps Gecko evaluated-source frames only through the exact retained chunk and source', () => {
    const { SourceMapGenerator } = require('next/dist/compiled/source-map')
    const {
      createClientSourceMapResolver,
    } = require('next/dist/experimental/testing/client/source-maps')
    const map = new SourceMapGenerator({ file: 'entry.js' })
    map.addMapping({
      generated: { line: 1, column: 320 },
      original: { line: 5, column: 2 },
      source: 'original',
    })
    map.setSourceContent('original', 'exact selected source')
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
      'http://127.0.0.1:1234/_next/entry.js line 14 > srcScript',
      '/_next/entry.js line 14 > srcScript',
    ]) {
      const frame = { file, line: 1, column: 321 }
      expect(mapper.mapLocation(frame)).toMatchObject({
        file: configuration.filePath,
        line: 5,
        column: 3,
      })
      expect(mapper.getSourceContent(frame)).toBe('exact selected source')
    }
    for (const file of [
      'http://127.0.0.1:1235/_next/entry.js line 14 > srcScript',
      '/_next/other.js line 14 > srcScript',
      '/_next/entry.js line 0 > srcScript',
      '/_next/entry.js line 14 > eval',
      '/_next/entry.js line 14 > srcScript > eval',
    ]) {
      expect(() => mapper.mapLocation({ file, line: 1, column: 321 })).toThrow()
    }
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
      collected(collector)
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
      collected(collector)
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
      } else {
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
        collector.accept({
          type: 'suite-end',
          result: {
            ...common,
            name: '',
            suiteId: 'entry',
            ancestors: [],
            mode: 'run',
          },
        })
      }
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
      collected(collector)
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
      rootSuite(collector)
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
  async function readSelectionMap(map: unknown) {
    const raw = JSON.stringify(map)
    await writeFile(join(artifact.rootDir, 'static/entry.js.map'), raw)
    artifact.files.push('static/entry.js.map')
    artifact.client.outputs.push({
      path: 'static/entry.js.map',
      sha256: hash(raw),
    })
    const reader = await createClientAssetReader(artifact)
    const maps = await reader.sourceMaps('http://indexed-map.test')
    expect((await reader.read('static/entry.js.map')).toString('utf8')).toBe(
      raw
    )
    await reader.verify()
    return maps
  }
  function indexedSelectionMap(kind: string, flat: unknown) {
    const generated = {
      version: 3,
      sources: [],
      names: [],
      mappings: 'A',
    }
    if (kind === 'flat') return flat
    if (kind === 'indexed')
      return {
        version: 3,
        sections: [
          { offset: { line: 0, column: 0 }, map: generated },
          { offset: { line: 2, column: 4 }, map: flat },
        ],
      }
    return {
      version: 3,
      sections: [
        {
          offset: { line: 0, column: 0 },
          map: {
            version: 3,
            sources: ['unrelated.ts'],
            names: [],
            mappings: 'AAAA',
          },
        },
        {
          offset: { line: 2, column: 4 },
          map: {
            version: 3,
            sections: [
              { offset: { line: 0, column: 0 }, map: generated },
              { offset: { line: 2, column: 1 }, map: flat },
            ],
          },
        },
      ],
    }
  }
  it.each(['flat', 'indexed', 'nested'])(
    'selects actual mapped sources in %s maps while keeping generated-only sections and original bytes',
    async (kind) => {
      const { SourceMapGenerator } = require('next/dist/compiled/source-map')
      const original = await readFile(configuration.filePath, 'utf8')
      const flat = new SourceMapGenerator({
        sourceRoot: 'file:///authored/',
      })
      flat.addMapping({
        generated: { line: 1, column: 0 },
        original: { line: 1, column: 3 },
        source: 'contract.case.mjs',
      })
      flat.addMapping({ generated: { line: 1, column: 8 } })
      flat.setSourceContent('contract.case.mjs', original)
      const map = indexedSelectionMap(kind, flat.toJSON())
      const maps = await readSelectionMap(map)
      expect(maps).toEqual([
        {
          url: 'http://indexed-map.test/_next/static/entry.js',
          map,
          originalSources: ['file:///authored/contract.case.mjs'],
        },
      ])
      const {
        createClientSourceMapResolver,
      } = require('next/dist/experimental/testing/client/source-maps')
      const resolver = createClientSourceMapResolver({
        filePath: configuration.filePath,
        sourceMaps: maps,
      })
      const frame = {
        file: maps[0].url,
        ...(kind === 'flat'
          ? { line: 1, column: 1 }
          : kind === 'indexed'
            ? { line: 3, column: 5 }
            : { line: 5, column: 2 }),
      }
      expect(resolver.mapLocation(frame)).toEqual({
        file: configuration.filePath,
        line: 1,
        column: 4,
        method: undefined,
      })
      expect(resolver.getSourceContent(frame)).toBe(original)
    }
  )
  it.each(['flat', 'indexed', 'nested'])(
    'accepts valid omitted sourcesContent in %s maps without selecting absent authored bytes',
    async (kind) => {
      const flat = {
        version: 3,
        sourceRoot: 'file:///authored/',
        sources: ['contract.case.mjs'],
        names: [],
        mappings: 'AAAA,Q',
      }
      await expect(
        readSelectionMap(indexedSelectionMap(kind, flat))
      ).resolves.toEqual([])
    }
  )
  it.each(['flat', 'indexed', 'nested'])(
    'does not select matching content registered without mapped evidence in %s maps',
    async (kind) => {
      const flat = {
        version: 3,
        sourceRoot: 'file:///authored/',
        sources: ['contract.case.mjs'],
        sourcesContent: [await readFile(configuration.filePath, 'utf8')],
        names: [],
        mappings: 'A',
      }
      await expect(
        readSelectionMap(indexedSelectionMap(kind, flat))
      ).resolves.toEqual([])
    }
  )
  it.each([
    [
      'unordered sections',
      {
        version: 3,
        sections: [
          {
            offset: { line: 2, column: 0 },
            map: { version: 3, sources: [], names: [], mappings: '' },
          },
          {
            offset: { line: 1, column: 0 },
            map: { version: 3, sources: [], names: [], mappings: '' },
          },
        ],
      },
      /ordered and non-overlapping/,
    ],
    [
      'external section',
      {
        version: 3,
        sections: [{ offset: { line: 0, column: 0 }, url: 'outside.map' }],
      },
      /url.*not implemented/,
    ],
    [
      'missing section map',
      { version: 3, sections: [{ offset: { line: 0, column: 0 } }] },
      /map.*required/,
    ],
    [
      'invalid actual source index',
      {
        version: 3,
        sections: [
          {
            offset: { line: 0, column: 0 },
            map: {
              version: 3,
              sources: ['actual'],
              sourcesContent: ['text'],
              names: [],
              mappings: 'ACAA',
            },
          },
        ],
      },
      /No element indexed by 1/,
    ],
  ] as const)(
    'retains consumer validation for %s',
    async (_name, map, error) => {
      await expect(readSelectionMap(map)).rejects.toThrow(error)
    }
  )
  it('retains ambiguity rejection across actual nested mapped source identities', async () => {
    const original = await readFile(configuration.filePath, 'utf8')
    const flat = (source: string) => ({
      version: 3,
      sources: [source],
      sourcesContent: [original],
      names: [],
      mappings: 'AAAA',
    })
    const map = {
      version: 3,
      sections: [
        { offset: { line: 0, column: 0 }, map: flat('file:///first.mjs') },
        {
          offset: { line: 2, column: 0 },
          map: indexedSelectionMap('indexed', flat('file:///second.mjs')),
        },
      ],
    }
    await expect(readSelectionMap(map)).rejects.toThrow(
      'Ambiguous original source identities'
    )
  })
  it.each([
    'mapped conflicting content',
    'mapped missing content',
    'unmapped conflicting content',
    'matching mapped contents',
  ])(
    'binds repeated source identities to their actual leaf: %s',
    async (kind) => {
      const source = 'file:///authored/contract.case.mjs'
      const original = await readFile(configuration.filePath, 'utf8')
      const leaf = (content: string | undefined, mapped = true) => ({
        version: 3,
        sources: [source],
        ...(content === undefined ? {} : { sourcesContent: [content] }),
        names: [],
        mappings: mapped ? 'AAAA' : 'A',
      })
      const map = {
        version: 3,
        sections: [
          {
            offset: { line: 0, column: 0 },
            map: leaf(
              kind === 'unmapped conflicting content'
                ? 'other bytes'
                : original,
              kind !== 'unmapped conflicting content'
            ),
          },
          {
            offset: { line: 2, column: 0 },
            map: leaf(
              kind === 'mapped conflicting content'
                ? 'other bytes'
                : kind === 'mapped missing content'
                  ? undefined
                  : original
            ),
          },
        ],
      }
      if (
        kind === 'mapped conflicting content' ||
        kind === 'mapped missing content'
      ) {
        await expect(readSelectionMap(map)).rejects.toThrow(
          'Ambiguous original source identities'
        )
        return
      }
      const maps = await readSelectionMap(map)
      expect(maps).toEqual([
        {
          url: 'http://indexed-map.test/_next/static/entry.js',
          map,
          originalSources: [source],
        },
      ])
      const {
        createClientSourceMapResolver,
      } = require('next/dist/experimental/testing/client/source-maps')
      const resolver = createClientSourceMapResolver({
        filePath: configuration.filePath,
        sourceMaps: maps,
      })
      expect(
        resolver.getSourceContent({ file: maps[0].url, line: 3, column: 1 })
      ).toBe(original)
      if (kind === 'unmapped conflicting content')
        expect(() =>
          resolver.mapLocation({ file: maps[0].url, line: 1, column: 1 })
        ).toThrow('not bound to the selected source bytes')
      else
        expect(
          resolver.getSourceContent({ file: maps[0].url, line: 1, column: 1 })
        ).toBe(original)
    }
  )
  it('keeps exact section starts, endings and generated-only scopes without falling through', async () => {
    const source = 'file:///authored/contract.case.mjs'
    const original = await readFile(configuration.filePath, 'utf8')
    const flat = {
      version: 3,
      sources: [source],
      sourcesContent: [original],
      names: [],
      mappings: 'AAAA,Q',
    }
    const map = {
      version: 3,
      sections: [
        { offset: { line: 0, column: 0 }, map: flat },
        {
          offset: { line: 0, column: 5 },
          map: { version: 3, sources: [], names: [], mappings: 'A' },
        },
        { offset: { line: 0, column: 9 }, map: flat },
      ],
    }
    const maps = await readSelectionMap(map)
    const {
      createClientSourceMapResolver,
    } = require('next/dist/experimental/testing/client/source-maps')
    const resolver = createClientSourceMapResolver({
      filePath: configuration.filePath,
      sourceMaps: maps,
    })
    for (const column of [1, 5, 10])
      expect(
        resolver.mapLocation({ file: maps[0].url, line: 1, column })
      ).toMatchObject({ file: configuration.filePath, line: 1, column: 1 })
    for (const column of [6, 7, 18])
      expect(() =>
        resolver.mapLocation({ file: maps[0].url, line: 1, column })
      ).toThrow('not bound to the selected source bytes')
  })
  it('composes nested line and column offsets only on their actual first relative line', async () => {
    const { SourceMapGenerator } = require('next/dist/compiled/source-map')
    const source = 'file:///authored/contract.case.mjs'
    const original = await readFile(configuration.filePath, 'utf8')
    const generator = new SourceMapGenerator()
    for (const [generated, originalColumn] of [
      [1, 0],
      [2, 6],
    ])
      generator.addMapping({
        generated: { line: generated, column: 0 },
        original: { line: 1, column: originalColumn },
        source,
      })
    generator.setSourceContent(source, original)
    const flat = generator.toJSON()
    const map = {
      version: 3,
      sections: [
        { offset: { line: 0, column: 0 }, map: flat },
        {
          offset: { line: 1, column: 7 },
          map: {
            version: 3,
            sections: [
              { offset: { line: 0, column: 3 }, map: flat },
              { offset: { line: 2, column: 4 }, map: flat },
            ],
          },
        },
      ],
    }
    const maps = await readSelectionMap(map)
    const {
      createClientSourceMapResolver,
    } = require('next/dist/experimental/testing/client/source-maps')
    const resolver = createClientSourceMapResolver({
      filePath: configuration.filePath,
      sourceMaps: maps,
    })
    for (const [line, column, expectedColumn] of [
      [2, 11, 1],
      [4, 5, 1],
      [5, 1, 7],
    ])
      expect(
        resolver.mapLocation({ file: maps[0].url, line, column })
      ).toMatchObject({
        file: configuration.filePath,
        line: 1,
        column: expectedColumn,
      })
    for (const column of [8, 10])
      expect(() =>
        resolver.mapLocation({ file: maps[0].url, line: 2, column })
      ).toThrow('not bound to the selected source bytes')
  })
  it('does not borrow source content from another indexed leaf for a missing-content frame', () => {
    const source = 'file:///authored/contract.case.mjs'
    const map = {
      version: 3,
      sections: [
        {
          offset: { line: 0, column: 0 },
          map: {
            version: 3,
            sources: [source],
            sourcesContent: ['first leaf'],
            names: [],
            mappings: 'AAAA',
          },
        },
        {
          offset: { line: 2, column: 0 },
          map: { version: 3, sources: [source], names: [], mappings: 'AAAA' },
        },
      ],
    }
    const {
      createClientSourceMapResolver,
    } = require('next/dist/experimental/testing/client/source-maps')
    const url = 'http://indexed-map.test/_next/static/entry.js'
    const resolver = createClientSourceMapResolver({
      filePath: configuration.filePath,
      sourceMaps: [{ url, map, originalSources: [source] }],
    })
    expect(resolver.getSourceContent({ file: url, line: 1, column: 1 })).toBe(
      'first leaf'
    )
    expect(
      resolver.getSourceContent({ file: url, line: 3, column: 1 })
    ).toBeNull()
  })
  it('retains an actual empty source content string through nested selection and resolution', async () => {
    const source = 'file:///authored/contract.case.mjs'
    await writeFile(configuration.filePath, '')
    artifact.sourceHash = hash('')
    const map = indexedSelectionMap('nested', {
      version: 3,
      sources: [source],
      sourcesContent: [''],
      names: [],
      mappings: 'AAAA',
    })
    const maps = await readSelectionMap(map)
    expect(maps).toEqual([
      {
        url: 'http://indexed-map.test/_next/static/entry.js',
        map,
        originalSources: [source],
      },
    ])
    const {
      createClientSourceMapResolver,
    } = require('next/dist/experimental/testing/client/source-maps')
    const resolver = createClientSourceMapResolver({
      filePath: configuration.filePath,
      sourceMaps: maps,
    })
    expect(
      resolver.getSourceContent({ file: maps[0].url, line: 5, column: 2 })
    ).toBe('')
  })
  it.each(['flat', 'nested'])(
    'keeps generated-only original coordinates authoritative when an empty source normalizes to a truthy root in %s maps',
    async (kind) => {
      const { SourceMapConsumer } = require('next/dist/compiled/source-map')
      const flat = {
        version: 3,
        sourceRoot: 'file:///',
        sources: [''],
        sourcesContent: [await readFile(configuration.filePath, 'utf8')],
        names: [],
        mappings: 'A',
      }
      const mappings: unknown[] = []
      new SourceMapConsumer(flat).eachMapping(
        (mapping: {
          source: string | null
          originalLine: number | null
          originalColumn: number | null
        }) => {
          mappings.push({
            source: mapping.source,
            originalLine: mapping.originalLine,
            originalColumn: mapping.originalColumn,
          })
        }
      )
      expect(mappings).toEqual([
        { source: 'file:///', originalLine: null, originalColumn: null },
      ])
      await expect(
        readSelectionMap(indexedSelectionMap(kind, flat))
      ).resolves.toEqual([])
    }
  )
})

describe('Browser helper diagnostic presentation', () => {
  function mapper(
    source: string | null,
    points: { line: number; column: number }[]
  ) {
    const { SourceMapGenerator } = require('next/dist/compiled/source-map')
    const {
      createClientSourceMapResolver,
    } = require('next/dist/experimental/testing/client/source-maps')
    const map = new SourceMapGenerator({ file: 'helper.js' })
    points.forEach((point, index) => {
      map.addMapping({
        generated: { line: index + 1, column: 0 },
        original: { line: point.line, column: point.column - 1 },
        source: 'original-helper',
      })
    })
    if (source !== null) map.setSourceContent('original-helper', source)
    map.setSourceContent('unselected', 'not the selected original source')
    return createClientSourceMapResolver({
      filePath: '/original/helpers.test.mjs',
      sourceMaps: [
        {
          url: 'http://127.0.0.1:1234/helper.js',
          map: map.toJSON(),
          originalSources: ['original-helper'],
        },
      ],
    })
  }

  it('trims the actual last helper frame before mapping and retains the raw nested async and soft stacks', async () => {
    const {
      mapClientDiagnosticStack,
    } = require('next/dist/experimental/testing/client/helper-diagnostics')
    const {
      serializeDiagnostic,
    } = require('next/dist/experimental/testing/reporting/diagnostics')
    const source = await readFile(
      join(
        __dirname,
        '../app-dir/next-testing-mocked/fixtures/define-helper.case.mjs'
      ),
      'utf8'
    )
    const points = [
      { line: 16, column: 56 },
      { line: 17, column: 42 },
      { line: 130, column: 3 },
      { line: 135, column: 9 },
      { line: 24, column: 43 },
      { line: 139, column: 18 },
    ]
    const original = mapper(source, points)
    expect(
      original.getSourceContent({
        file: 'http://127.0.0.1:1234/helper.js',
        line: 1,
        column: 1,
      })
    ).toBe(source)
    const user = (line: number) =>
      `    at user (http://127.0.0.1:1234/helper.js:${line}:1)`
    const helper =
      '    at __VITEST_HELPER__ (http://127.0.0.1:1234/framework.js:1:1)'
    const cases = [
      {
        lines: [user(1), helper, user(2), helper, user(3)],
        expected: { line: 130, column: 3 },
      },
      { lines: [helper, user(4)], expected: { line: 135, column: 3 } },
      {
        lines: [user(5), helper, user(6)],
        expected: { line: 139, column: 18 },
      },
    ]
    for (const { lines, expected } of cases) {
      const stack = ['AssertionError: genuine helper mismatch', ...lines].join(
        '\n'
      )
      const diagnostic = serializeDiagnostic(
        { name: 'AssertionError', message: 'genuine helper mismatch', stack },
        {
          phase: 'runtime',
          mapStack: (value: string) =>
            mapClientDiagnosticStack(value, original),
        }
      )
      expect(diagnostic.frames).toEqual([
        {
          file: '/original/helpers.test.mjs',
          ...expected,
          methodName: undefined,
          original: true,
        },
      ])
      expect(diagnostic.stack).toBe(stack)
      expect(JSON.parse(JSON.stringify(diagnostic)).stack).toBe(stack)
    }
  })

  it('keeps ordinary await callers and helper arguments unchanged and falls back on missing or invalid source', () => {
    const {
      mapClientDiagnosticStack,
    } = require('next/dist/experimental/testing/client/helper-diagnostics')
    const source = "async function body() {\n  await helper('value')\n}\n"
    const point = { line: 2, column: 9 }
    const user = '    at body (http://127.0.0.1:1234/helper.js:1:1)'
    const helper =
      '    at __VITEST_HELPER__ (http://127.0.0.1:1234/framework.js:1:1)'
    const raw = ['Error: no helper frame', user].join('\n')
    const original = mapper(source, [point])
    expect(mapClientDiagnosticStack(raw, original)[0]).toMatchObject(point)
    const withHelper = ['Error: helper frame', helper, user].join('\n')
    expect(mapClientDiagnosticStack(withHelper, original)[0]).toMatchObject({
      line: 2,
      column: 3,
    })
    for (const content of [null, 'not valid JavaScript']) {
      expect(
        mapClientDiagnosticStack(withHelper, mapper(content, [point]))[0]
      ).toMatchObject(point)
    }
    expect(
      mapClientDiagnosticStack(withHelper, {
        ...original,
        getSourceContent() {
          throw new Error('missing retained content')
        },
      })[0]
    ).toMatchObject(point)
    const argument = {
      line: 2,
      column: source.split('\n')[1].indexOf("'value'") + 1,
    }
    expect(
      mapClientDiagnosticStack(withHelper, mapper(source, [argument]))[0]
    ).toMatchObject(argument)
  })

  it('uses UTF16 and CRLF source positions rather than fixed caller columns', () => {
    const {
      mapClientDiagnosticStack,
    } = require('next/dist/experimental/testing/client/helper-diagnostics')
    for (const newline of ['\n', '\r\n']) {
      const prefix = "  const emoji = '😀'; "
      const line = prefix + "await helper('value')"
      const source = ['async function body() {', line, '}', ''].join(newline)
      const original = mapper(source, [
        { line: 2, column: line.indexOf('helper') + 1 },
      ])
      const stack =
        'Error: measured caller\n    at __VITEST_HELPER__ (http://127.0.0.1:1234/framework.js:1:1)\n    at body (http://127.0.0.1:1234/helper.js:1:1)'
      expect(mapClientDiagnosticStack(stack, original)[0]).toMatchObject({
        line: 2,
        column: prefix.length + 1,
      })
    }
  })

  it('uses the mapped frame source when different selected maps appear in either insertion order', () => {
    const { SourceMapGenerator } = require('next/dist/compiled/source-map')
    const {
      createClientSourceMapResolver,
    } = require('next/dist/experimental/testing/client/source-maps')
    const {
      mapClientDiagnosticStack,
    } = require('next/dist/experimental/testing/client/helper-diagnostics')
    const correct = "async function body() {\n  await helper('value')\n}\n"
    const other =
      "async function body() {\n  const padding = true; await other('value')\n}\n"
    const records = [other, correct].map((source, index) => {
      const map = new SourceMapGenerator({ file: `${index}.js` })
      map.addMapping({
        generated: { line: 1, column: 0 },
        original: { line: 2, column: 8 },
        source: `original-${index}`,
      })
      map.setSourceContent(`original-${index}`, source)
      return {
        url: `http://127.0.0.1:1234/${index}.js`,
        map: map.toJSON(),
        originalSources: [`original-${index}`],
      }
    })
    const frame = { file: records[1].url, line: 1, column: 1 }
    const stack =
      'Error: mapped helper\n    at __VITEST_HELPER__ (http://127.0.0.1:1234/framework.js:1:1)\n    at body (http://127.0.0.1:1234/1.js:1:1)'
    for (const sourceMaps of [records, [...records].reverse()]) {
      const original = createClientSourceMapResolver({
        filePath: '/original/helpers.test.mjs',
        sourceMaps,
      })
      expect(original.getSourceContent(frame)).toBe(correct)
      expect(mapClientDiagnosticStack(stack, original)[0]).toMatchObject({
        line: 2,
        column: 3,
      })
    }
  })
})

describe('Browser numeric retries and repeats', () => {
  const sourceFile = '/project/retry.test.mjs'
  function client(names = ['actual'], extra = {}) {
    const {
      createClientResultCollector,
    } = require('next/dist/experimental/testing/client/results')
    const collector = createClientResultCollector(
      { entryId: 'entry', revision: 'revision', client: { sourceFile } },
      { runId: 'run', ...extra }
    )
    collector.accept({
      type: 'collected',
      declarations: [
        { type: 'suite', id: 'entry', parentId: null, name: '', mode: 'run' },
        ...names.map((name, index) => ({
          type: 'test',
          id: `entry/${index}`,
          parentId: 'entry',
          name,
          mode: 'run',
        })),
      ],
    })
    return collector
  }
  function start(
    collector: any,
    retry = 0,
    repeat = 0,
    index = 0,
    name = 'actual'
  ) {
    collector.accept({
      type: 'case-start',
      context: {
        fileId: 'entry',
        testId: `entry/${index}`,
        id: `run/entry/${index}/${retry}/${repeat}`,
        name,
        retry,
        repeat,
      },
    })
  }
  function end(
    collector: any,
    status = 'passed',
    retry = 0,
    repeat = 0,
    index = 0,
    name = 'actual',
    extra = {}
  ) {
    collector.accept({
      type: 'case-end',
      result: {
        entryId: 'entry',
        caseId: `entry/${index}`,
        name,
        attempt: { id: `run/entry/${index}/${retry}/${repeat}`, retry, repeat },
        status,
        durationMs: 1,
        errors:
          status === 'failed'
            ? [{ phase: 'test', error: new Error(`failed-${retry}-${repeat}`) }]
            : [],
        ...extra,
      },
    })
  }
  function suite(collector: any, status = 'passed', extra = {}) {
    collector.accept({
      type: 'suite-end',
      result: {
        entryId: 'entry',
        suiteId: 'entry',
        name: '',
        ancestors: [],
        mode: 'run',
        status,
        durationMs: 1,
        errors: [],
        ...extra,
      },
    })
  }
  function complete(
    collector: any,
    status = 'passed',
    caseCount = 1,
    extra = {}
  ) {
    collector.accept({
      type: 'complete',
      status,
      interrupted: false,
      caseCount,
      updates: [],
      ...extra,
    })
  }

  it('replaces an intermediate failed retry while retaining both original attempt events and errors', () => {
    const collector = client()
    start(collector)
    end(collector, 'failed')
    expect(collector.hasFailure()).toBe(true)
    start(collector, 1)
    end(collector, 'passed', 1)
    expect(collector.hasFailure()).toBe(false)
    suite(collector)
    complete(collector)
    expect(collector.result().status).toBe('passed')
    const attempts = collector.events.filter(
      (event: any) => event.type === 'case-end'
    )
    expect(
      attempts.map((event: any) => [
        event.attempt.retry,
        event.attempt.repeat,
        event.status,
      ])
    ).toEqual([
      [0, 0, 'failed'],
      [1, 0, 'passed'],
    ])
    expect(attempts[0].errors[0].message).toBe('failed-0-0')
    expect(attempts[1].errors).toEqual([])
  })

  it('keeps a failed repeat in the final outcome after a later repeat passes', () => {
    const collector = client()
    start(collector)
    end(collector, 'failed')
    start(collector, 0, 1)
    end(collector, 'passed', 0, 1)
    expect(() => suite(collector)).toThrow(/contradicts/)
    suite(collector, 'failed')
    complete(collector, 'failed')
    expect(collector.result().status).toBe('failed')
    expect(
      collector.events.filter((event: any) => event.type === 'case-end')
    ).toHaveLength(2)
  })

  it('accepts serial retries within each repeat and counts one logical case', () => {
    const collector = client()
    for (let repeat = 0; repeat < 2; repeat++) {
      start(collector, 0, repeat)
      end(collector, 'failed', 0, repeat)
      start(collector, 1, repeat)
      end(collector, 'passed', 1, repeat)
    }
    suite(collector)
    expect(() => complete(collector, 'passed', 4)).toThrow(/completion/)
    complete(collector)
    expect(collector.result().status).toBe('passed')
    expect(
      collector.events
        .filter((event: any) => event.type === 'case-end')
        .map((event: any) => event.attempt.id)
    ).toEqual([
      'run/entry/0/0/0',
      'run/entry/0/1/0',
      'run/entry/0/0/1',
      'run/entry/0/1/1',
    ])
  })

  it('refuses duplicate, overlapping, skipped-ordinal and successful-try retries', () => {
    const overlapping = client()
    start(overlapping)
    expect(() => start(overlapping, 1)).toThrow(/attempt owner/)
    end(overlapping, 'failed')
    expect(() => start(overlapping, 2)).toThrow(/attempt owner/)
    start(overlapping, 1)
    end(overlapping, 'passed', 1)
    expect(() => end(overlapping, 'passed', 1)).toThrow(/immutable attempt/)
    expect(() => start(overlapping, 2)).toThrow(/attempt owner/)
    const initial = client()
    expect(() => start(initial, 1)).toThrow(/attempt owner/)
    expect(() => start(initial, 0, 1)).toThrow(/attempt owner/)
  })

  it('does not reopen an earlier case after another logical case has started', () => {
    const collector = client(['actual', 'next'])
    start(collector)
    end(collector, 'failed')
    start(collector, 0, 0, 1, 'next')
    end(collector, 'passed', 0, 0, 1, 'next')
    expect(() => start(collector, 1)).toThrow(/attempt owner/)
    suite(collector, 'failed')
    complete(collector, 'failed', 2)
    expect(collector.result().status).toBe('failed')
  })

  it('retains independent file and suite errors after a recovered retry', () => {
    for (const failure of ['file', 'suite']) {
      const collector = client()
      start(collector)
      end(collector, 'failed')
      start(collector, 1)
      end(collector, 'passed', 1)
      if (failure === 'file') {
        suite(collector)
        collector.accept({ type: 'failure', error: new Error('file error') })
      } else
        suite(collector, 'failed', {
          errors: [{ phase: 'afterAll', error: new Error('afterAll error') }],
        })
      complete(collector, 'failed')
      expect(collector.result().status).toBe('failed')
    }
  })

  it('stops runtime skipped attempts without generating further retries or repeats', () => {
    const collector = client()
    start(collector)
    end(collector, 'skipped', 0, 0, 0, 'actual', {
      mode: 'skip',
      pending: true,
      note: 'ordinary skip',
    })
    expect(() => start(collector, 1)).toThrow(/attempt owner/)
    expect(() => start(collector, 0, 1)).toThrow(/attempt owner/)
    suite(collector, 'skipped')
    complete(collector)
    expect(collector.result().status).toBe('passed')
  })

  it('permits only numeric serial retry and repeat authoring in the existing Browser validator', async () => {
    const {
      createCollector,
    } = require('next/dist/experimental/testing/runner/collector')
    const {
      validateSynchronousClient,
    } = require('next/dist/experimental/testing/client/validate')
    const file = createCollector('entry')
    file.api.describe('repeated', { retry: 2, repeats: 1 }, () => {
      file.api.test('numeric', { retry: 1, repeats: 2 }, () => {})
    })
    await file.settle()
    expect(validateSynchronousClient(file.close(), { retry: 1 })).toHaveLength(
      3
    )
    const object = createCollector('object')
    object.api.test('object retry', { retry: { count: 1 } }, () => {})
    await object.settle()
    expect(() => validateSynchronousClient(object.close(), {})).toThrow(
      /numeric/
    )
    const concurrent = createCollector('concurrent')
    concurrent.api.test.concurrent('concurrent', () => {})
    await concurrent.settle()
    expect(() => validateSynchronousClient(concurrent.close(), {})).toThrow(
      /concurrency/
    )
  })

  it('keeps recovered Browser retry failures in JSON while reporting the passed final logical case', () => {
    const {
      createMachineReporter,
    } = require('next/dist/experimental/testing/reporting/machine')
    const collector = client()
    start(collector)
    end(collector, 'failed')
    start(collector, 1)
    end(collector, 'passed', 1)
    suite(collector)
    complete(collector)
    const reporter = createMachineReporter({
      projectDir: '/project',
      reporters: ['json'],
    })
    const envelope = { version: 1, runId: 'run', timestamp: 1 }
    const entry = {
      id: 'entry',
      file: sourceFile,
      profile: {
        id: 'browser',
        environment: 'browser',
        mode: 'development',
        runtime: 'nodejs',
        bundler: 'turbopack',
        browserClient: true,
      },
    }
    try {
      reporter.onEvent({ ...envelope, type: 'run-start' })
      reporter.onEvent({ ...envelope, type: 'file-start', entry })
      for (const event of collector.events) reporter.onEvent(event)
      reporter.onEvent({
        ...envelope,
        type: 'file-end',
        entryId: 'entry',
        status: 'passed',
        durationMs: 1,
      })
      reporter.onEvent({
        ...envelope,
        type: 'run-end',
        status: 'passed',
        durationMs: 1,
      })
      const report = reporter.getJson()
      expect(report).toMatchObject({
        success: true,
        numTotalTests: 1,
        numPassedTests: 1,
        numFailedTests: 0,
      })
      expect(
        report.testResults[0].assertionResults[0].failureMessages
      ).toHaveLength(1)
      expect(
        report.testResults[0].assertionResults[0].failureMessages[0]
      ).toContain('failed-0-0')
      expect(
        report.next.events.filter((event: any) => event.type === 'case-end')
      ).toHaveLength(2)
    } finally {
      reporter.dispose()
    }
  })
})

let browserHostDescriptors: {
  target: object
  key: PropertyKey
  descriptor: PropertyDescriptor | undefined
}[] = []

describe('Browser callback context identity across attempts', () => {
  // Saved Browser code patches native event prototypes shared by Jest realms.
  // Restore this host after the component checks, before Node starts a Worker.
  const hostProperties: [object, PropertyKey][] = [
    [Promise.prototype, 'then'],
    [EventTarget.prototype, 'addEventListener'],
    [EventTarget.prototype, 'removeEventListener'],
    [MessagePort.prototype, 'postMessage'],
    [MessagePort.prototype, 'close'],
    [MessagePort.prototype, 'onmessage'],
    ...[
      'MessageChannel',
      'structuredClone',
      'setTimeout',
      'setInterval',
      'queueMicrotask',
      'requestAnimationFrame',
      'requestIdleCallback',
    ].map((key): [object, PropertyKey] => [globalThis, key]),
  ]
  beforeAll(() => {
    browserHostDescriptors = hostProperties.map(([target, key]) => ({
      target,
      key,
      descriptor: Object.getOwnPropertyDescriptor(target, key),
    }))
  })
  afterAll(() => {
    for (const { target, key, descriptor } of browserHostDescriptors) {
      if (descriptor) Object.defineProperty(target, key, descriptor)
      else Reflect.deleteProperty(target, key)
    }
  })
  it('retains the published context and local expect through fresh retry and repeat scopes', () => {
    const {
      createAsyncScope,
    } = require('next/dist/experimental/testing/client/async-context')
    const {
      invokeTestCallback,
    } = require('next/dist/experimental/testing/client/invocation-platform')
    const late: Error[] = []
    const original = Object.assign((value: unknown) => value, {
      getState() {
        return { receiver: this, value: 'local' }
      },
    })
    let reads = 0
    const context = {
      task: {},
      signal: new AbortController().signal,
      get expect() {
        reads++
        return original
      },
    }
    const rows: {
      context: unknown
      local: unknown
      receiver: unknown
      value: unknown
    }[] = []
    for (const [retry, repeat] of [
      [0, 0],
      [1, 0],
      [0, 1],
    ]) {
      const owner = {
        id: `identity/entry/0/${retry}/${repeat}`,
        fileId: 'entry',
        testId: 'entry/0',
        name: 'stable',
        retry,
        repeat,
      }
      const scope = createAsyncScope(
        { kind: 'attempt', context: owner },
        (error: Error) => late.push(error)
      )
      try {
        const returned = scope.run(() =>
          invokeTestCallback(
            (published: any) => {
              const local = published.expect
              expect(published.expect).toBe(local)
              const state = local.getState()
              rows.push({
                context: published,
                local,
                receiver: state.receiver,
                value: local('payload'),
              })
              return context.task
            },
            context,
            owner
          )
        )
        expect(returned).toBe(context.task)
      } finally {
        scope.close()
      }
    }
    expect(rows).toHaveLength(3)
    expect(rows.every((row) => row.context === rows[0].context)).toBe(true)
    expect(rows.every((row) => row.local === rows[0].local)).toBe(true)
    expect(
      rows.every((row) => row.receiver === original && row.value === 'payload')
    ).toBe(true)
    expect(reads).toBe(6)
    expect(late).toEqual([])
    expect(() =>
      invokeTestCallback(() => {}, context, { id: 'identity/entry/0/0/1' })
    ).toThrow(/attempt ownership/)
  })

  it('reads the current expect getter each time and preserves guards on retained wrappers', () => {
    const {
      createAsyncScope,
    } = require('next/dist/experimental/testing/client/async-context')
    const {
      invokeTestCallback,
    } = require('next/dist/experimental/testing/client/invocation-platform')
    const first = (value: unknown) => value
    const second = (value: unknown) => value
    const failure = new Error('actual getter failed')
    let selected = first,
      rejected = false,
      reads = 0
    const context = {
      get expect() {
        reads++
        if (rejected) throw failure
        return selected
      },
    }
    const other = {
      get expect() {
        return second
      },
    }
    const owner = {
      id: 'identity-current',
      fileId: 'entry',
      testId: 'entry/0',
      name: 'current',
    }
    const scope = createAsyncScope(
      { kind: 'attempt', context: owner },
      () => {}
    )
    let held: any
    try {
      scope.run(() =>
        invokeTestCallback(
          (published: any) => {
            held = published.expect
            expect(published.expect).toBe(held)
            selected = second
            expect(published.expect).not.toBe(held)
            selected = first
            expect(published.expect).toBe(held)
            rejected = true
            expect(() => published.expect).toThrow(failure)
            expect(
              invokeTestCallback((value: unknown) => value, other, owner)
            ).not.toBe(published)
          },
          context,
          owner
        )
      )
    } finally {
      scope.close()
    }
    expect(reads).toBe(5)
    expect(() => held('late')).toThrow(/Browser Mode API access/)
  })
})
it('keeps real Node Worker messages intact after saved Browser client checks', async () => {
  const { Worker } =
    require('node:worker_threads') as typeof import('node:worker_threads')
  const { once } = require('node:events') as typeof import('node:events')
  for (const { target, key, descriptor } of browserHostDescriptors) {
    expect(Object.getOwnPropertyDescriptor(target, key)).toEqual(descriptor)
  }
  const worker = new Worker(
    `require('node:worker_threads').parentPort.postMessage({ value: 42 })`,
    { eval: true }
  )
  try {
    const [message, exit] = await Promise.all([
      once(worker, 'message', { signal: AbortSignal.timeout(5_000) }),
      once(worker, 'exit', { signal: AbortSignal.timeout(5_000) }),
    ])
    expect(message).toEqual([{ value: 42 }])
    expect(exit).toEqual([0])
  } finally {
    await worker.terminate()
  }
})

it('preserves callback values through the Browser runtime fallback refresh signatures', async () => {
  const { runInNewContext } = require('node:vm') as typeof import('node:vm')
  const ts = require('typescript') as typeof import('typescript')
  const filename = join(
    __dirname,
    '../../../turbopack/crates/turbopack-ecmascript-runtime/js/src/browser/runtime/base/dev-base.ts'
  )
  const source = await readFile(filename, 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
    reportDiagnostics: true,
  })
  expect(compiled.diagnostics).toEqual([])
  const context: Record<string, any> = {
    Context: function Context() {},
    devModuleCache: undefined,
    runtimeModules: undefined,
    createModuleWithDirectionFlag: false,
  }
  const execute = runInNewContext(
    `${compiled.outputText}\nrunModuleExecutionHooks`,
    context,
    { filename }
  )
  const receiver = {}
  let callbackCalls = 0
  let customHookCalls = 0
  let signature: Function
  function callback(this: unknown, value: number) {
    callbackCalls++
    expect(signature()).toBeUndefined()
    return { receiver: this, value }
  }
  execute({ id: 'fallback-module' }, (refresh: any) => {
    signature = refresh.signature()
    expect(signature()).toBeUndefined()
    const associated = signature(callback, 'signature-key', false, () => {
      customHookCalls++
      return []
    })
    expect(associated).toBe(callback)
    expect(Reflect.apply(associated, receiver, [7])).toEqual({
      receiver,
      value: 7,
    })
    expect(refresh.register(callback, 'callback')).toBeUndefined()
    expect(refresh.registerExports({}, {})).toBeUndefined()
  })
  expect(callbackCalls).toBe(1)
  expect(customHookCalls).toBe(0)

  const trace: string[] = []
  const failure = new Error('actual refresh execution failed')
  const realRegister = () => {}
  const realSignature = () => callback
  context.$RefreshReg$ = realRegister
  context.$RefreshSig$ = realSignature
  context.$RefreshInterceptModuleExecution$ = (id: string) => {
    trace.push(`start:${id}`)
    return () => trace.push('cleanup')
  }
  expect(() =>
    execute({ id: 'real-refresh-module' }, (refresh: any) => {
      expect(refresh.register).toBe(realRegister)
      expect(refresh.signature).toBe(realSignature)
      expect(refresh.signature()).toBe(callback)
      throw failure
    })
  ).toThrow(failure)
  expect(trace).toEqual(['start:real-refresh-module', 'cleanup'])
})

describe('Browser actual logical-case reporter facts', () => {
  const sourceFile = '/project/logical.test.mjs'
  const artifact = {
    entryId: 'entry',
    revision: 'revision',
    client: { sourceFile },
  }
  async function executeActual(captureTaskResults = true) {
    const {
      createCollector,
    } = require('next/dist/experimental/testing/runner/collector')
    const {
      runCollected,
    } = require('next/dist/experimental/testing/runner/lifecycle')
    const {
      clientDeclarations,
    } = require('next/dist/experimental/testing/client/collection')
    const {
      captureReporterTaskTree,
    } = require('next/dist/experimental/testing/reporting/live-tasks')
    const {
      createClientResultCollector,
    } = require('next/dist/experimental/testing/client/results')
    const {
      createReporterTaskUpdates,
    } = require('next/dist/experimental/testing/reporting/task-updates')
    const c = createCollector('entry')
    let retries = 0,
      repeats = 0,
      bodies = 0,
      captures = 0
    // The pinned suite hook parser requires an object destructuring argument.
    // eslint-disable-next-line no-empty-pattern
    c.api.afterAll(({}, task: any) => {
      task.meta.afterAll = 'closed'
    })
    c.api.test('retry', { retry: 1 }, ({ task, onTestFinished }: any) => {
      bodies++
      onTestFinished(() => {
        task.meta.closed = true
      })
      if (retries++ === 0) throw new Error('retry failure')
    })
    c.api.test('repeat', { repeats: 1 }, () => {
      bodies++
      if (repeats++ === 0) throw new Error('repeat failure')
    })
    c.api.test.skip('skipped', () => {
      throw new Error('never skipped')
    })
    c.api.test.todo('todo')
    c.api.test('pending', ({ skip }: any) => {
      bodies++
      skip('actual skip')
    })
    c.api.test('following', () => {
      bodies++
    })
    const root = c.close()
    const options = { runId: 'run', captureTaskResults }
    const collector = createClientResultCollector(artifact, options)
    const messages: any[] = []
    const accept = (message: any) => {
      // This is the same JSON boundary used by the real Browser transport.
      const copied = JSON.parse(JSON.stringify(message))
      messages.push(copied)
      collector.accept(copied)
    }
    const taskUpdates = captureTaskResults
      ? createReporterTaskUpdates({
          onUpdate(update: any) {
            accept({ type: 'task-update', ...update })
          },
        })
      : undefined
    await runCollected(
      root,
      {
        runId: 'run',
        signal: new AbortController().signal,
        filePath: sourceFile,
        testTimeout: 1000,
        hookTimeout: 1000,
        onCollected(file: any) {
          accept({
            type: 'collected',
            declarations: clientDeclarations(root),
            ...(taskUpdates ? { taskTree: captureReporterTaskTree(file) } : {}),
          })
          taskUpdates?.collected(file)
        },
        onCaseStart(context: any) {
          taskUpdates?.caseStart(context.testId)
          accept({
            type: 'case-start',
            context: {
              id: context.id,
              fileId: context.fileId,
              testId: context.testId,
              name: context.name,
              retry: context.retry,
              repeat: context.repeat,
            },
          })
        },
        onCaseEnd(result: any) {
          accept({ type: 'case-end', result })
        },
        onCaseResult: taskUpdates
          ? (task: any, result: any) => {
              captures++
              taskUpdates.caseResult(task, result)
            }
          : undefined,
        onSuiteEnd(result: any, task: any) {
          taskUpdates?.suiteEnd(task)
          accept({ type: 'suite-end', result })
        },
      },
      () => {}
    )
    await taskUpdates?.finish()
    taskUpdates?.dispose()
    accept({
      type: 'complete',
      status: 'failed',
      interrupted: false,
      caseCount: 6,
      updates: [],
    })
    return { events: collector.result().events, messages, bodies, captures }
  }
  it('retains actual once-per-logical-case trees, retry/repeat outcomes and root afterAll mutations', async () => {
    const { events, messages, bodies, captures } = await executeActual()
    const logical = events.flatMap((event: any) =>
      event.type === 'task-update'
        ? event.caseResults.map((result: any) => ({
            ...result,
            taskTree: event.taskTree,
          }))
        : []
    )
    expect(logical.map((event: any) => [event.name, event.status])).toEqual([
      ['retry', 'passed'],
      ['repeat', 'failed'],
      ['skipped', 'skipped'],
      ['todo', 'skipped'],
      ['pending', 'skipped'],
      ['following', 'passed'],
    ])
    expect(
      events.filter((event: any) => event.type === 'case-end')
    ).toHaveLength(8)
    expect(bodies).toBe(6)
    expect(captures).toBe(6)
    expect(logical[0].taskTree.tasks[0].meta).toEqual({ closed: true })
    const reporting = events.filter(
      (event: any) =>
        event.type === 'file-collected' || event.type === 'task-update'
    )
    expect(reporting.length).toBeGreaterThan(1)
    expect(
      reporting.every((event: any) => event.revision === artifact.revision)
    ).toBe(true)
    const initial = events.find(
      (event: any) => event.type === 'file-collected'
    ).taskTree
    expect(initial.tasks[5].result).toBeUndefined()
    expect(initial.meta.afterAll).toBeUndefined()
    expect(
      events.filter((event: any) => event.type === 'task-update').at(-1)
        .taskTree.meta.afterAll
    ).toBe('closed')
    expect(
      messages.flatMap((message: any) =>
        message.type === 'task-update' ? message.caseResults : []
      )
    ).toHaveLength(6)
  })
  it('leaves actual attempt/suite event payloads and body counts unchanged without capture', async () => {
    const captured = await executeActual(true)
    const absent = await executeActual(false)
    expect(absent.captures).toBe(0)
    expect(absent.bodies).toBe(captured.bodies)
    expect(
      absent.events.some(
        (event: any) =>
          event.type === 'task-update' ||
          event.type === 'file-collected' ||
          event.taskTree
      )
    ).toBe(false)
    const stable = (events: any[]) =>
      events
        .filter(
          (event) =>
            event.type !== 'task-update' && event.type !== 'file-collected'
        )
        .map((event) => {
          const { timestamp, taskTree, durationMs, ...rest } = event
          return rest
        })
    expect(stable(absent.events)).toEqual(stable(captured.events))
  })
  it.each([
    'unsolicited',
    'duplicate',
    'wrong-final',
    'unknown-task',
    'missing-task',
    'wrong-parent',
    'wrong-lexical-parent',
    'wrong-file-parent',
    'forged-name',
    'context',
  ])(
    'rejects %s logical reporter facts against actual immutable declarations',
    async (kind) => {
      const {
        createClientResultCollector,
      } = require('next/dist/experimental/testing/client/results')
      const { messages } = await executeActual()
      const collector = createClientResultCollector(artifact, {
        runId: 'run',
        captureTaskResults: kind !== 'unsolicited',
      })
      const index = messages.findIndex(
        (message: any) =>
          message.type === 'task-update' && message.caseResults.length > 0
      )
      for (const message of messages.slice(0, index)) {
        if (kind === 'unsolicited' && message.type === 'task-update') continue
        if (kind === 'unsolicited' && message.type === 'collected') {
          const { taskTree, ...declaration } = message
          collector.accept(declaration)
        } else collector.accept(message)
      }
      const message = structuredClone(messages[index])
      if (kind === 'duplicate') collector.accept(message)
      if (kind === 'wrong-final') message.caseResults[0].status = 'failed'
      if (kind === 'unknown-task') message.taskTree.tasks[0].id = 'foreign/0'
      if (kind === 'missing-task') message.taskTree.tasks.pop()
      if (kind === 'wrong-parent') message.taskTree.tasks[0].id = 'entry/5/0'
      if (kind === 'wrong-lexical-parent')
        message.taskTree.tasks[0].parentSuiteId = message.taskTree.tasks[1].id
      if (kind === 'wrong-file-parent')
        message.taskTree.parentSuiteId = message.taskTree.id
      if (kind === 'forged-name') message.taskTree.tasks[0].name = 'invented'
      if (kind === 'context') message.taskTree.tasks[0].context = {}
      expect(() => collector.accept(message)).toThrow(/Browser Mode/)
    }
  )
})

describe('Browser actual reporter task-pack ownership', () => {
  async function actualTasks() {
    const {
      createCollector,
    } = require('next/dist/experimental/testing/runner/collector')
    const {
      runCollected,
    } = require('next/dist/experimental/testing/runner/lifecycle')
    const c = createCollector('pack-file')
    c.api.test('first', { meta: { initial: 'first' } }, () => {})
    c.api.test('second', () => {})
    const root = c.close()
    let file: any
    const logical: any[] = []
    await runCollected(
      root,
      {
        runId: 'packs',
        filePath: '/project/packs.test.mjs',
        signal: new AbortController().signal,
        onCollected(value: any) {
          file = value
        },
        onCaseResult(task: any, result: any) {
          logical.push({ task, result })
        },
      },
      () => {}
    )
    return { file, logical }
  }
  function factory() {
    return require('next/dist/experimental/testing/reporting/task-updates')
      .createReporterTaskUpdates
  }
  it('retains queued result/meta references through replacements and captures in-place changes', async () => {
    const { file, logical } = await actualTasks()
    const updates: any[] = []
    const owner = factory()({
      onUpdate(update: any) {
        updates.push(update)
      },
    })
    owner.collected(file)
    owner.caseResult(logical[0].task, logical[0].result)
    const originalMeta = logical[0].task.meta,
      originalResult = logical[0].task.result
    originalMeta.inPlace = 'kept'
    originalResult.note = 'retained note'
    logical[0].task.meta = { replacement: true }
    logical[0].task.result = { state: 'skip' }
    owner.caseResult(logical[1].task, logical[1].result)
    owner.suiteEnd(file)
    await owner.finish()
    owner.dispose()
    const batch = updates.at(-1)
    expect(batch.caseResults.map((result: any) => result.caseId)).toEqual(
      logical.map(({ task }: any) => task.id)
    )
    expect(batch.taskUpdateIds).toEqual([
      logical[0].task.id,
      logical[1].task.id,
      file.id,
    ])
    expect(batch.taskTree.tasks[0].meta).toEqual({
      initial: 'first',
      inPlace: 'kept',
    })
    expect(batch.taskTree.tasks[0].result).toMatchObject({
      state: 'pass',
      note: 'retained note',
    })
    expect(logical[0].task.meta).toEqual({ replacement: true })
    originalMeta.after = 'later'
    expect(batch.taskTree.tasks[0].meta.after).toBeUndefined()
  })
  it('leaves no queued logical result after rejecting a foreign task with the same id', async () => {
    const { file, logical } = await actualTasks()
    const updates: any[] = []
    const owner = factory()({
      onUpdate(update: any) {
        updates.push(update)
      },
    })
    owner.collected(file)
    const foreign = { ...logical[0].task }
    expect(() =>
      owner.caseResult(foreign, { ...logical[0].result, status: 'failed' })
    ).toThrow(/does not belong/)
    owner.caseResult(logical[0].task, logical[0].result)
    owner.suiteEnd(file)
    await owner.finish()
    owner.dispose()
    expect(updates.flatMap((update) => update.caseResults)).toEqual([
      logical[0].result,
    ])
    expect(updates.at(-1).caseResults[0].status).toBe('passed')
  })
  it('flushes with captured real clocks while authored globals are replaced', async () => {
    const { file, logical } = await actualTasks()
    const create = factory()
    const realTimeout = globalThis.setTimeout.bind(globalThis)
    let release: () => void
    const delivered = new Promise<void>((resolve) => {
      release = resolve
    })
    const updates: any[] = []
    const owner = create({
      onUpdate(update: any) {
        updates.push(update)
        if (update.caseResults.length) release()
      },
    })
    owner.collected(file)
    const timer = jest
      .spyOn(globalThis, 'setTimeout')
      .mockImplementation(() => {
        throw new Error('authored fake timer')
      })
    const date = jest.spyOn(Date, 'now').mockReturnValue(-1)
    try {
      owner.caseStart(logical[0].task.id)
      owner.caseResult(logical[0].task, logical[0].result)
      await Promise.race([
        delivered,
        new Promise((_, reject) =>
          realTimeout(
            () => reject(new Error('actual reporter timer did not flush')),
            1000
          )
        ),
      ])
      expect(updates.at(-1).caseResults).toHaveLength(1)
      await owner.finish()
    } finally {
      timer.mockRestore()
      date.mockRestore()
      owner.dispose()
    }
  })
  it.each(['sync', 'async'])(
    'joins %s update failures without detached rejection',
    async (kind) => {
      const { file, logical } = await actualTasks()
      const failure = new Error('actual reporter send rejected')
      const owner = factory()({
        onUpdate() {
          if (kind === 'sync') throw failure
          return Promise.reject(failure)
        },
      })
      owner.collected(file)
      owner.caseResult(logical[0].task, logical[0].result)
      await expect(owner.finish()).rejects.toThrow(
        'Reporter task updates failed'
      )
      owner.dispose()
    }
  )
  it('catches unsupported snapshot serialization and closes the pending timer', async () => {
    const { file, logical } = await actualTasks()
    const updates: any[] = []
    const owner = factory()({
      onUpdate(update: any) {
        updates.push(update)
      },
    })
    owner.collected(file)
    owner.caseResult(logical[0].task, logical[0].result)
    logical[0].task.meta.function = () => {}
    await expect(owner.finish()).rejects.toThrow()
    owner.dispose()
    expect(updates).toHaveLength(1)
  })
  it('disposes queued packs without publishing a later detached update', async () => {
    const { file, logical } = await actualTasks()
    const updates: any[] = []
    const owner = factory()({
      onUpdate(update: any) {
        updates.push(update)
      },
    })
    owner.collected(file)
    owner.caseResult(logical[0].task, logical[0].result)
    owner.dispose()
    await owner.finish()
    await new Promise((resolve) => setTimeout(resolve, 120))
    expect(updates).toHaveLength(1)
    expect(() => owner.caseStart(logical[0].task.id)).toThrow(/Unknown/)
  })
})

it.each(['development', 'production'] as const)(
  'keeps project agent maintenance disabled in the actual %s application worker',
  async (mode) => {
    const root = await mkdtemp(join(tmpdir(), 'next-server-agent-options-'))
    let lease: ApplicationServer | undefined
    try {
      const lib = join(root, 'node_modules/next/dist/server/lib')
      const cli = join(root, 'node_modules/next/dist/cli')
      await mkdir(lib, { recursive: true })
      await mkdir(cli, { recursive: true })
      await copyFile(
        join(__dirname, 'fixtures/start-server.cjs'),
        join(lib, 'protocol-server.cjs')
      )
      await copyFile(
        join(__dirname, 'fixtures/start-server-options.cjs'),
        join(lib, 'start-server.js')
      )
      await copyFile(
        join(__dirname, 'fixtures/next-build.cjs'),
        join(cli, 'next-build.js')
      )
      await writeFile(join(root, 'scenario'), 'ready')
      lease = await createApplicationServer({
        projectDir: root,
        outputDir: join(root, 'artifacts'),
        mode,
        distDir: mode === 'production' ? '.next' : undefined,
        outputLockEnabled: true,
        signal: new AbortController().signal,
        startupTimeoutMs: 5000,
        shutdownGraceMs: 100,
      })
      expect(
        JSON.parse(await readFile(join(root, 'worker-options.json'), 'utf8'))
      ).toEqual({ isDev: mode === 'development', skipAgentFiles: true })
      expect(await (await fetch(lease.baseURL)).text()).toBe('ready')
    } finally {
      try {
        await lease?.dispose()
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    }
  }
)

it('maps measured Gecko srcScript diagnostic frames without changing raw errors or admitting other evaluation labels', () => {
  const { SourceMapGenerator } = require('next/dist/compiled/source-map')
  const {
    createClientSourceMapResolver,
  } = require('next/dist/experimental/testing/client/source-maps')
  const {
    mapClientDiagnosticStack,
  } = require('next/dist/experimental/testing/client/helper-diagnostics')
  const map = new SourceMapGenerator({ file: 'chunk.js' })
  map.addMapping({
    generated: { line: 20, column: 401 },
    original: { line: 7, column: 10 },
    source: 'exact-selected-source',
  })
  map.setSourceContent('exact-selected-source', 'retained authored hook source')
  const configuration = {
    filePath: '/original/hooks.test.mjs',
    sourceMaps: [
      {
        url: 'http://127.0.0.1:1234/chunk.js',
        map: map.toJSON(),
        originalSources: ['exact-selected-source'],
      },
    ],
  }
  const mapper = createClientSourceMapResolver(configuration),
    raw =
      'createCollector/hook/<@http://127.0.0.1:1234/framework.js line 14 > srcScript:9189:24\n@http://127.0.0.1:1234/chunk.js line 14 > srcScript:20:402\n',
    error = new Error('original hook error')
  error.stack = raw
  expect(mapClientDiagnosticStack(error.stack, mapper)).toEqual([
    {
      file: '/original/hooks.test.mjs',
      line: 7,
      column: 11,
      methodName: undefined,
      original: true,
    },
  ])
  expect(error.stack).toBe(raw)
  expect(error.message).toBe('original hook error')
  for (const label of [
    'line 0 > srcScript',
    'line -1 > srcScript',
    'line 14 > eval',
    'line 14 > srcScript extra',
    'line 14  > srcScript',
  ]) {
    expect(
      mapClientDiagnosticStack(
        '@http://127.0.0.1:1234/chunk.js ' + label + ':20:402',
        mapper
      )
    ).toEqual([])
  }
  expect(
    mapClientDiagnosticStack(
      '@http://127.0.0.1:1234/other.js line 14 > srcScript:20:402',
      mapper
    )
  ).toEqual([])
  expect(
    mapClientDiagnosticStack(
      raw,
      createClientSourceMapResolver({
        ...configuration,
        sourceMaps: [
          {
            ...configuration.sourceMaps[0],
            originalSources: ['unselected-source'],
          },
        ],
      })
    )
  ).toEqual([])
})

it('tracks private concurrent logical finals by immutable case and exact attempt while preserving rejection controls', () => {
  const { execFileSync } = require('node:child_process')
  const output = execFileSync(
    process.execPath,
    [join(__dirname, 'concurrent-case-finals.cjs')],
    { encoding: 'utf8', timeout: 15000 }
  )
  expect(JSON.parse(output)).toEqual({
    controls: 15,
    bothEndOrders: true,
    independentRetry: true,
    invalidFinalsRejected: true,
    noExtraErrorReads: true,
  })
})

it('copies effective concurrent and sequential flags from closed definitions without reading mutable public Task fields', async () => {
  const {
    createCollector,
  } = require('next/dist/experimental/testing/runner/collector')
  const {
    clientDeclarations,
  } = require('next/dist/experimental/testing/client/collection')
  const {
    createTaskTree,
  } = require('next/dist/experimental/testing/runner/tasks')
  const collector = createCollector('entry')
  collector.api.describe.concurrent('parallel', () => {
    collector.api.test('inherited', () => {})
    collector.api.describe('sequential', { concurrent: false }, () => {
      collector.api.test('overridden', () => {})
    })
  })
  collector.api.test('ordinary', () => {})
  await collector.settle()
  const root = collector.close()
  const tree = createTaskTree(root, {
    filePath: '/original/cases.test.mjs',
    testTimeout: 1000,
  })
  for (const task of tree.tasks.values()) task.concurrent = false
  expect(
    clientDeclarations(root, 'concurrent-v1').map(({ name, concurrent }) => ({
      name,
      concurrent,
    }))
  ).toEqual([
    { name: '', concurrent: false },
    { name: 'parallel', concurrent: true },
    { name: 'inherited', concurrent: true },
    { name: 'sequential', concurrent: false },
    { name: 'overridden', concurrent: false },
    { name: 'ordinary', concurrent: false },
  ])
  expect(
    clientDeclarations(root).every(
      (declaration) => !('concurrent' in declaration)
    )
  ).toBe(true)
})

it('admits native Browser commands only from the exact immutable active attempt without accepting stale retry or public fields', () => {
  const { execFileSync } = require('node:child_process')
  const output = execFileSync(
    process.execPath,
    [join(__dirname, 'native-command-origins.cjs')],
    { encoding: 'utf8', timeout: 15000 }
  )
  expect(JSON.parse(output)).toEqual({
    controls: 15,
    exactLiveAttemptOnly: true,
    closedAndPreviousRetriesRejected: true,
    malformedOriginsRejected: true,
    legacyProfileUnchanged: true,
  })
})

it('admits collected public Browser concurrency while enforcing native owner, limit and legacy boundaries', () => {
  const { execFileSync } = require('node:child_process')
  const output = execFileSync(
    process.execPath,
    [join(__dirname, 'public-concurrency-admission.cjs')],
    { encoding: 'utf8', timeout: 15000 }
  )
  expect(JSON.parse(output)).toEqual({
    controls: 10,
    explicitAndConfiguredDefinitions: true,
    exactTwoLiveNativeOwners: true,
    positiveLimitsEnforced: true,
    mixedAndDuplicateStartsRejected: true,
    legacyAndFixtureControlsPreserved: true,
  })
})

it('admits plain Browser fixture resources only through the file-owned capability', () => {
  const { execFileSync } = require('node:child_process')
  const output = execFileSync(
    process.execPath,
    [join(__dirname, 'public-fixture-admission.cjs')],
    { encoding: 'utf8', timeout: 15000 }
  )
  expect(JSON.parse(output)).toEqual({
    controls: 7,
    plainScopesAdmittedByActualFile: true,
    legacyFixtureRefusalsPreserved: true,
    concurrentCapabilityStillIndependent: true,
    sharedFileAndWorkerLifetime: true,
    testScopeRecreated: true,
  })
})

it('keeps native Browser fixture scope and awaited disposal ownership separate from attempt authority', () => {
  const { execFileSync } = require('node:child_process')
  const scopes = JSON.parse(
    execFileSync(
      process.execPath,
      [join(__dirname, 'native-fixture-scopes.cjs')],
      {
        encoding: 'utf8',
        timeout: 15000,
      }
    )
  )
  expect(scopes).toEqual({
    controls: 18,
    liveActualFixtureScopesOnly: true,
    noSyntheticAttemptOrigin: true,
    assertionDeclarationAndUtilityAdmissionHeld: true,
    absentForeignAndClosedOwnersRefused: true,
    lateContinuationRefused: true,
  })
  for (const mode of [
    'normal',
    'file-error',
    'browser-error',
    'keyboard-error',
    'all-errors',
    'cancelled',
  ]) {
    const result = JSON.parse(
      execFileSync(
        process.execPath,
        [join(__dirname, 'native-fixture-disposal.cjs'), mode],
        { encoding: 'utf8', timeout: 15000 }
      )
    )
    expect(result).toEqual({
      mode,
      fileDisposalAwaitedBeforeBrowserCleanup: true,
      allRemainingDisposalsAttempted: true,
      originalFailureOrderHeld: true,
      cancellationAndPublicationVetoHeld: true,
    })
  }
})

it('owns the real before-worker cleanup boundary and preserves component and keyboard cleanup contracts', () => {
  const { execFileSync } = require('node:child_process')
  for (const mode of [
    'default',
    'ordered',
    'before-error',
    'worker-error',
    'mixed-same',
  ]) {
    const result = JSON.parse(
      execFileSync(
        process.execPath,
        [join(__dirname, 'native-fixture-ordering.cjs'), mode],
        { encoding: 'utf8', timeout: 15000 }
      )
    )
    expect(result).toEqual({
      mode,
      actualOwnedWorkerBoundary: true,
      callbackAwaitedBeforeWorker: true,
      assertionAndWorkerLifetimesHeld: true,
      allFailureSlotsPreserved: true,
      closedAfterJoin: true,
    })
  }
  for (const mode of [
    'normal',
    'component-error',
    'getter-error',
    'noncallable',
  ]) {
    const result = JSON.parse(
      execFileSync(
        process.execPath,
        [join(__dirname, 'native-fixture-component-cleanup.cjs'), mode],
        { encoding: 'utf8', timeout: 15000 }
      )
    )
    expect(result).toEqual({
      mode,
      inheritedGetterAndBoundExtension: true,
      ignoredExtensionSymbols: true,
      directSymbolReceiverAndReadCount: true,
      componentBeforeKeyboard: true,
      keyboardAttemptedAfterComponentFailure: true,
      originalErrorRetained: true,
    })
  }
}, 45000)

it('joins the same Browser cleanup promise when an older file ignores or does not await the private callback', () => {
  const { execFileSync } = require('node:child_process')
  for (const mode of ['awaited', 'unawaited', 'missing-file']) {
    const result = JSON.parse(
      execFileSync(
        process.execPath,
        [join(__dirname, 'native-fixture-cleanup-join.cjs'), mode],
        { encoding: 'utf8', timeout: 15000 }
      )
    )
    expect(result).toEqual({
      mode,
      callbackPromiseShared: true,
      fallbackJoinedBeforeRemainingDisposals: true,
      cleanupExactlyOnce: true,
      originalInitializationFailureRetained: true,
    })
  }
}, 30000)
