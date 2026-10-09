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
})
